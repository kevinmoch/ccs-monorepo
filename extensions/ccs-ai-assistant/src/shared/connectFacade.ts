import { WebSkillError } from '@webskill/core';
import type {
  ConnectEndpointView,
  ConnectFacade,
  ConnectTemporarySkill,
  ConnectTemporarySkillDetail,
  ConnectTestResult,
  ConnectToolView,
  ConnectWebMcpSource
} from '@webskill/console';
import { createExtensionConsentStore, createExtensionDownloadConsentStore } from './consentStore';
import { createPageMcpHost, type PageMcpHost } from './pageMcpHost';
import { ACTION_SCOPE, PERCEPTION_SCOPE } from './scopes';
import { createTabBinding, type TabBindingPort } from './tabBinding';

function unsupported(what: string): never {
  throw new WebSkillError('TOOL_UNSUPPORTED', `${what} is not supported: page endpoints come from the page itself.`);
}

/**
 * options 页里 console 的门面。
 *
 * 端点、工具、页面技能全部来自**当前绑定页**（分册 18）。options 页与 side panel 是
 * 两个进程各自一份运行时，所以这里自建 binding + `PageMcpHost`；两页同源，
 * 启停状态经 localStorage 共享，在这里改完 side panel 立刻生效。
 *
 * `pageActionConsents` / `forgetPageActionConsent*` 与 side panel 用的是**同一份**
 * `chrome.storage.local`：撤销后 side panel 立刻重新弹卡，中间没有缓存层（FR-14.6）。
 */
export function createExtensionConnect(): ConnectFacade {
  // options 页没有绑定 tab；粒度串已经随每条记录存在 storage 里，读取侧不需要它
  const consent = createExtensionConsentStore(() => undefined);
  // 下载文件授权进**同一张表**（分册 20 AC-20.14）：它们的字段形状一致，
  // 多造一个 console 视图只会让用户得到两个地方找「我都授权过什么」
  const downloads = createExtensionDownloadConsentStore();
  /** origin 自带 `://`，不可能等于 `downloads`，因此拿 scope 分流是安全的 */
  const isDownloadScope = (scope: string): boolean => scope === 'downloads';

  /**
   * 惰性建：`chrome.tabs` 的监听器一装就开始跟着用户切页跑，
   * 而只看「感知范围」这一页的用户根本没让我们去查任何标签页。
   */
  let lazy: { binding: TabBindingPort; pageMcp: PageMcpHost; ready: Promise<void> } | undefined;
  const host = (): NonNullable<typeof lazy> => {
    if (lazy === undefined) {
      const binding = createTabBinding(() => undefined);
      lazy = {
        binding,
        pageMcp: createPageMcpHost({ resolveTabId: () => binding.tabId() }),
        // 首次绑定是异步的，不等它就会在页面刚打开时误报「没有绑定页」
        ready: binding.bindActiveTab()
      };
    }
    return lazy;
  };

  /** 拉不到页面与「页面没有端点」是两件事，后者不该冒充成功（FR-18.8） */
  const refreshed = async (): Promise<PageMcpHost> => {
    const { pageMcp, ready } = host();
    await ready;
    await pageMcp.refresh();
    const reason = pageMcp.lastError();
    if (reason !== undefined) throw new WebSkillError('MCP_ENDPOINT_UNAVAILABLE', reason);
    return pageMcp;
  };

  const toolsOf = async (endpoint: string): Promise<ConnectToolView[]> => {
    const { pageMcp } = host();
    const { tools } = await pageMcp.registry.get(endpoint).listTools();
    return tools.map((tool) => ({
      endpoint,
      name: tool.name,
      ...(tool.description === undefined ? {} : { description: tool.description }),
      ...(tool.inputSchema === undefined ? {} : { inputSchema: tool.inputSchema }),
      enabled: pageMcp.isToolEnabled(endpoint, tool.name),
      disclosure: pageMcp.isToolOnDemand(endpoint, tool.name) ? ('on-demand' as const) : ('always' as const)
    }));
  };

  const webmcpSource: ConnectWebMcpSource = {
    get label() {
      return host().binding.snapshot().origin ?? 'Bound page';
    },
    isAvailable: () => host().pageMcp.webmcp.isAvailable(),
    isEnabled: () => host().pageMcp.isWebMcpEnabled(),
    setEnabled: (on) => host().pageMcp.setWebMcpEnabled(on),
    listTools: async () => {
      const pageMcp = await refreshed();
      // 适配器在页面没有 WebMCP 时给 undefined，与「有但空」在 UI 上同一个展现
      const tools = (await pageMcp.webmcp.listTools()) ?? [];
      return tools.map((tool) => ({
        endpoint: 'webmcp',
        name: tool.name,
        ...(tool.description === undefined ? {} : { description: tool.description }),
        ...(tool.inputSchema === undefined ? {} : { inputSchema: tool.inputSchema }),
        ...(tool.origin === undefined ? {} : { origin: tool.origin }),
        ...(tool.annotations === undefined ? {} : { annotations: tool.annotations }),
        enabled: pageMcp.isToolEnabled('webmcp', tool.name),
        disclosure: pageMcp.isToolOnDemand('webmcp', tool.name) ? ('on-demand' as const) : ('always' as const)
      }));
    },
    setToolEnabled: (tool, enabled) => host().pageMcp.setToolEnabled('webmcp', tool, enabled),
    setToolDisclosure: (tool, disclosure) => host().pageMcp.setToolOnDemand('webmcp', tool, disclosure === 'on-demand')
  };

  return {
    listEndpoints: async () => {
      const pageMcp = await refreshed();
      const views: ConnectEndpointView[] = [];
      for (const name of pageMcp.endpoints()) {
        // 逐个探：一个端点答不上来不该让整张表变成一条错误
        const toolCount = await toolsOf(name)
          .then((tools) => tools.length)
          .catch(() => undefined);
        views.push({
          config: {
            name,
            // 页面端点没有 URL，它就在这一页里；填成假地址会让诊断按钮去连一个不存在的东西
            url: `page://${host().binding.snapshot().origin ?? 'bound-page'}/${name}`,
            enabled: pageMcp.isEndpointEnabled(name)
          },
          status: toolCount === undefined ? 'failed' : 'connected',
          ...(toolCount === undefined ? {} : { toolCount })
        });
      }
      return views;
    },
    // 页面端点是**页面给的**，手动加/删它没有意义；给个能点但必然失败的按钮更糟
    addEndpoint: async () => unsupported('Adding an endpoint by hand'),
    removeEndpoint: async () => unsupported('Removing an endpoint by hand'),
    reconnect: async () => {
      await host().pageMcp.refresh(true);
    },
    listTools: async () => {
      const pageMcp = await refreshed();
      const lists = await Promise.all(pageMcp.endpoints().map((name) => toolsOf(name).catch(() => [])));
      return lists.flat();
    },
    testEndpoint: async (name) => {
      const startedAt = Date.now();
      try {
        const pageMcp = await refreshed();
        const { tools } = await pageMcp.registry.get(name).listTools();
        const result: ConnectTestResult = {
          ok: true,
          latencyMs: Date.now() - startedAt,
          checkedAt: new Date().toISOString()
        };
        return tools.length === 0 ? { ...result, detail: 'The endpoint answered but exposes no tools.' } : result;
      } catch (e) {
        return {
          ok: false,
          latencyMs: Date.now() - startedAt,
          error: e instanceof Error ? e.message : String(e),
          checkedAt: new Date().toISOString()
        };
      }
    },
    setEndpointEnabled: async (name, enabled) => host().pageMcp.setEndpointEnabled(name, enabled),
    setToolEnabled: async (endpoint, tool, enabled) => host().pageMcp.setToolEnabled(endpoint, tool, enabled),
    setToolDisclosure: async (endpoint, tool, disclosure) =>
      host().pageMcp.setToolOnDemand(endpoint, tool, disclosure === 'on-demand'),
    temporarySkills: async () => {
      const pageMcp = await refreshed();
      const entries = await pageMcp.source.listSkills();
      return entries.map((entry): ConnectTemporarySkill => ({
        name: entry.name,
        description: entry.description,
        source: entry.source,
        // root 形如 `mcp://<endpoint>/prompts/<name>`；同名技能靠它区分
        ...(entry.root === undefined ? {} : { origin: entry.root })
      }));
    },
    temporarySkillDetail: async (name): Promise<ConnectTemporarySkillDetail> => {
      const pageMcp = await refreshed();
      const document = await pageMcp.source.loadSkill!(name);
      return {
        name,
        description: document.metadata.description,
        source: 'mcp',
        body: document.body
      };
    },
    /**
     * 感知范围只读展示。`records` 为空是实话：感知发生在 side panel 的进程里，
     * options 页读不到它的内存，而为此建一条跨页留痕通道超出本册范围。
     */
    pagePerception: async () => ({
      enabled: true,
      include: [...(PERCEPTION_SCOPE as { include: readonly string[] }).include],
      exclude: [...((PERCEPTION_SCOPE as { exclude?: readonly string[] }).exclude ?? [])],
      records: [],
      // 两份范围分开上报（FR-14.5）：console 分两块展示，用户一眼看出可读 ≠ 可操作
      actionScope: actionScopeSummary()
    }),
    pageActionConsents: async () => [...(await consent.list()), ...(await downloads.list())],
    forgetPageActionConsent: async (id) => {
      const cut = id.lastIndexOf('|');
      if (cut > 0 && isDownloadScope(id.slice(0, cut))) return await downloads.forget(id);
      return await consent.forget(id);
    },
    forgetPageActionConsentScope: async (scope) => {
      if (isDownloadScope(scope)) return await downloads.forgetAll();
      return await consent.forgetScope(scope);
    },
    // 不用展开：`label` 是 getter，展开会当场求值，把「惰性建 binding」这件事作废
    webmcp: Object.assign(webmcpSource, { sources: [webmcpSource] })
  };
}

/** 操作范围的只读展示串。与 `PERCEPTION_SCOPE` 分开取，两者不是同一个对象（AC-14.7） */
export function actionScopeSummary(): { include: readonly string[]; exclude: readonly string[] } {
  const scope = ACTION_SCOPE as { include: readonly string[]; exclude?: readonly string[] };
  return { include: [...scope.include], exclude: [...(scope.exclude ?? [])] };
}

/**
 * 页面端点在扩展进程里的宿主（分册 18 FR-18.4 / FR-18.5 / FR-18.6）。
 *
 * 把绑定页当前注册的端点同步进**扩展自己的** `EndpointRegistry`，
 * 之后 `McpRuntimePlugin` / `TemporarySkillProvider` / `ConnectFacade` 全按既有方式装配——
 * 握手只多了一个 client 实现，没有第二套代码路径（D-18-4）。
 *
 * 启停与披露状态存 `localStorage` 而不是 `chrome.storage.local`：
 * `McpToolVisibility` 的回调是**同步**的，异步存储接不上；而 side panel 与 options 页同源，
 * localStorage 天然共享（与 FR-14.9 的模型配置同一条路）。
 */
import { WebSkillError } from '@webskill/core';
import {
  EndpointRegistry,
  ExperimentalWebMcpAdapter,
  McpRuntimePlugin,
  TemporarySkillProvider,
  webMcpToolLlmName
} from '@webskill/mcp';
import type { BrowserModelContextLike, McpClientLike } from '@webskill/mcp';
import type { ExternalSkillProvider, ExternalToolSource, ToolResult } from '@webskill/runtime';
import type { SkillCatalogEntry } from '@webskill/core';
import { createRemotePageClient, createRemoteWebMcp, listPageEndpoints, type PageMcpTransport } from './pageMcpClient';

const ENDPOINT_DISABLED_KEY = 'webskill.extension.page-mcp.disabled-endpoints';
const TOOL_DISABLED_KEY = 'webskill.extension.page-mcp.disabled-tools';
const ON_DEMAND_KEY = 'webskill.extension.page-mcp.on-demand-tools';
const WEB_MCP_ENABLED_KEY = 'webskill.extension.page-mcp.webmcp-enabled';

function readList(key: string): string[] {
  try {
    const parsed: unknown = JSON.parse(globalThis.localStorage?.getItem(key) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function writeList(key: string, values: string[]): void {
  globalThis.localStorage?.setItem(key, JSON.stringify([...new Set(values)]));
}

function toggle(key: string, entry: string, present: boolean): void {
  const list = new Set(readList(key));
  if (present) list.add(entry);
  else list.delete(entry);
  writeList(key, [...list]);
}

export interface PageMcpHost {
  registry: EndpointRegistry<McpClientLike>;
  plugin: McpRuntimePlugin;
  /** chatbot adapter 的 `pageSkillSource`：工具源与技能提供者同一个对象两个 port */
  source: ExternalToolSource & ExternalSkillProvider;
  /**
   * 按**页面声明的原始工具名**调一个 WebMCP 工具（站点自荐数据源的 `target` 就是它）。
   * `source.call` 收的是模型侧名字（`mcp__<工具名>`），直接把原始名传进去一定解不出来。
   */
  callWebMcpTool(tool: string, args: Record<string, unknown>): Promise<ToolResult>;
  webmcp: ExperimentalWebMcpAdapter;
  /** 拉一次页面清单；`force` 跳过 TTL（收到「清单变了」通知时用） */
  refresh(force?: boolean): Promise<void>;
  /** 当前已发现的端点名 */
  endpoints(): string[];
  /** 绑定页换了：上一页的端点全部下线 */
  reset(): void;
  isEndpointEnabled(endpoint: string): boolean;
  setEndpointEnabled(endpoint: string, enabled: boolean): void;
  isToolEnabled(endpoint: string, tool: string): boolean;
  setToolEnabled(endpoint: string, tool: string, enabled: boolean): void;
  isToolOnDemand(endpoint: string, tool: string): boolean;
  setToolOnDemand(endpoint: string, tool: string, onDemand: boolean): void;
  isWebMcpEnabled(): boolean;
  setWebMcpEnabled(on: boolean): void;
  /** 最近一次拉取失败的原因；用来区分「页面没有端点」和「问不到页面」（FR-18.8） */
  lastError(): string | undefined;
}

export function createPageMcpHost(deps: { resolveTabId: () => number | undefined }): PageMcpHost {
  const registry = new EndpointRegistry<McpClientLike>();
  const skillProviders = new Map<string, TemporarySkillProvider>();
  let lastError: string | undefined;
  let lastFetchedAt = 0;
  let inFlight: Promise<void> | undefined;

  const transport: PageMcpTransport = {
    send: async (message) => {
      const tabId = deps.resolveTabId();
      if (tabId === undefined) {
        throw new WebSkillError('MCP_ENDPOINT_UNAVAILABLE', 'No page is bound, so there are no page endpoints.');
      }
      // 只问主帧：嵌入帧里的端点不接（D-18-6）
      return chrome.tabs.sendMessage(tabId, message, { frameId: 0 });
    }
  };

  const webmcp = new ExperimentalWebMcpAdapter(
    () => createRemoteWebMcp(transport) as unknown as BrowserModelContextLike,
    { enabled: globalThis.localStorage?.getItem(WEB_MCP_ENABLED_KEY) !== '0' }
  );

  const plugin = new McpRuntimePlugin({
    registry,
    webMcp: [webmcp],
    // 端点是页面给的，装配时还不知道有哪些；resolver 按 registry 现状工作
    endpoints: [],
    visibility: {
      isEndpointEnabled: (endpoint) => !readList(ENDPOINT_DISABLED_KEY).includes(endpoint),
      isEndpointToolEnabled: (endpoint, tool) => !readList(TOOL_DISABLED_KEY).includes(`${endpoint}/${tool}`),
      isWebMcpToolEnabled: (tool) => !readList(TOOL_DISABLED_KEY).includes(`webmcp/${tool}`),
      endpointToolDisclosure: (endpoint, tool) =>
        readList(ON_DEMAND_KEY).includes(`${endpoint}/${tool}`) ? 'on-demand' : undefined,
      webMcpToolDisclosure: (tool) => (readList(ON_DEMAND_KEY).includes(`webmcp/${tool}`) ? 'on-demand' : undefined)
    }
  });

  function clearEndpoints(): void {
    for (const endpoint of registry.endpoints()) registry.unregister(endpoint);
    skillProviders.clear();
    lastFetchedAt = 0;
  }

  function reset(): void {
    clearEndpoints();
    lastError = undefined;
  }

  async function pull(): Promise<void> {
    let discovered: { endpoints: string[]; webMcp: boolean };
    try {
      discovered = await listPageEndpoints(transport);
      lastError = undefined;
    } catch (e) {
      // 「问不到页面」不能压成「页面没有端点」：后者会让用户以为站点没提供（FR-18.8）。
      // 用 clearEndpoints 而不是 reset——后者会把刚记下的原因一并抹掉
      clearEndpoints();
      lastError = e instanceof Error ? e.message : String(e);
      return;
    }
    for (const endpoint of registry.endpoints()) {
      if (discovered.endpoints.includes(endpoint)) continue;
      registry.unregister(endpoint);
      skillProviders.delete(endpoint);
    }
    for (const endpoint of discovered.endpoints) {
      if (skillProviders.has(endpoint)) continue;
      registry.set(endpoint, createRemotePageClient(transport, endpoint));
      skillProviders.set(endpoint, new TemporarySkillProvider({ registry, endpoint }));
    }
    lastFetchedAt = Date.now();
  }

  /** 页面注入时机不定，发现必须惰性（FR-18.5）；1s TTL 挡住一次界面渲染里的连环调用 */
  async function refresh(force = false): Promise<void> {
    if (!force && Date.now() - lastFetchedAt < 1_000) return;
    inFlight ??= pull().finally(() => {
      inFlight = undefined;
    });
    await inFlight;
  }

  const providers = (): TemporarySkillProvider[] => [...skillProviders.values()];

  const source: ExternalToolSource & ExternalSkillProvider = {
    kind: 'mcp',
    listToolSpecs: async () => {
      await refresh();
      return plugin.listToolSpecs();
    },
    canHandle: (name) => plugin.canHandle(name),
    call: async (name, args) => {
      await refresh();
      return plugin.call(name, args);
    },
    listSkills: async () => {
      await refresh();
      const lists = await Promise.all(providers().map((p) => p.listSkills()));
      return lists.flat() as SkillCatalogEntry[];
    },
    loadSkill: async (name) => {
      await refresh();
      return firstThatWorks(providers(), (p) => p.loadSkill(name), `Page skill "${name}" is not available.`);
    },
    readFile: async (name, path) => {
      await refresh();
      return firstThatWorks(
        providers(),
        (p) => p.readFile(name, path),
        `Page skill "${name}" has no reference "${path}".`
      );
    }
  };

  return {
    registry,
    plugin,
    source,
    callWebMcpTool: async (tool, args) => {
      await refresh();
      return plugin.call(webMcpToolLlmName(tool, webmcp.sourceId), args);
    },
    webmcp,
    refresh,
    endpoints: () => registry.endpoints(),
    reset,
    isEndpointEnabled: (endpoint) => !readList(ENDPOINT_DISABLED_KEY).includes(endpoint),
    setEndpointEnabled: (endpoint, enabled) => toggle(ENDPOINT_DISABLED_KEY, endpoint, !enabled),
    isToolEnabled: (endpoint, tool) => !readList(TOOL_DISABLED_KEY).includes(`${endpoint}/${tool}`),
    setToolEnabled: (endpoint, tool, enabled) => toggle(TOOL_DISABLED_KEY, `${endpoint}/${tool}`, !enabled),
    isToolOnDemand: (endpoint, tool) => readList(ON_DEMAND_KEY).includes(`${endpoint}/${tool}`),
    setToolOnDemand: (endpoint, tool, onDemand) => toggle(ON_DEMAND_KEY, `${endpoint}/${tool}`, onDemand),
    isWebMcpEnabled: () => globalThis.localStorage?.getItem(WEB_MCP_ENABLED_KEY) !== '0',
    setWebMcpEnabled: (on) => {
      globalThis.localStorage?.setItem(WEB_MCP_ENABLED_KEY, on ? '1' : '0');
      webmcp.setEnabled(on);
    },
    lastError: () => lastError
  };
}

/**
 * 页面可能有多个端点，而技能名在端点之间不保证唯一。
 * 挨个试到第一个给得出的为止——比先 listSkills 再定位少一次全量往返。
 */
async function firstThatWorks<T>(
  providers: readonly TemporarySkillProvider[],
  attempt: (provider: TemporarySkillProvider) => Promise<T>,
  message: string
): Promise<T> {
  for (const provider of providers) {
    try {
      return await attempt(provider);
    } catch {
      continue;
    }
  }
  throw new WebSkillError('SKILL_NOT_FOUND', message);
}

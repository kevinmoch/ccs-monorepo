import {
  BrowserWorkerScriptExecutor,
  OpfsProvider,
  createDocumentSurfaceHost,
  createIframeWorker,
  createRemotePageActionExecutor,
  createRemotePerceptionReader,
  createRemoteTargetRegistry,
  explainResolution,
  extractDocxText,
  extractXlsxText,
  WORKER_BOOTSTRAP_SOURCE
} from '@webskill/browser';
import {
  DataSourceCandidatePolicy,
  DataSourcePolicy,
  PERCEPTION_PAGING_DEFAULTS,
  PageActionPolicy,
  PagePerceptionPolicy,
  TabWorksetPolicy,
  createHttpDataSourceTransport
} from '@webskill/agent';
import type { DataSourceCandidate, DataSourceDef, PageActionUi } from '@webskill/agent';
import type { DataSourceInfo } from '@webskill/runtime';
import { AUDIT_EVENT_TYPES, CandidateStore, FsAuditLog, createCandidateSink } from '@webskill/governance';
import type { CandidateSink } from '@webskill/governance';
import { createBrowserChatbotHost } from '@webskill/browser';
import type { ChatbotHostAdapter, SandboxExecutorDeps, SettingsSectionId } from '@webskill/chatbot';
import { createLocalStorageRuntimeConfigStore } from '@webskill/ui-kit';
import type { RuntimeConfig, RuntimeConfigStore } from '@webskill/ui-kit';
import { applyBakedDefaults, restoreBakedSecrets, stripBakedSecrets } from './bakedConfig';
import {
  createExtensionConsentStore,
  createExtensionDataSourceCandidateStore,
  createExtensionDownloadConsentStore,
  type ExtensionConsentStore,
  type ExtensionDataSourceCandidateStore,
  type ExtensionDownloadConsentStore
} from './consentStore';
import { createExtensionDownloadsReader } from './downloadsReader';
import { createExtensionDownloadWatcher } from './downloadWatcher';
import { createExtensionTabWorkset } from './tabWorkset';
import { createTabLinkedDocumentReader } from './linkedDocuments';
import { documentFetchRequest } from './messages';
import { isPageDataSourcesMessage, isPageMcpChanged, pageDataSourcesPull } from './pageMcpClient';
import { createPageMcpHost, type PageMcpHost } from './pageMcpHost';
import { extractPdfText } from './pdfText';
import { ACTION_SCOPE, DOWNLOAD_WAIT_MS, PERCEPTION_SCOPE } from './scopes';
import { seedBuiltinSkills, BUILTIN_ROOT } from './seedSkills';
import { createTabBinding, type TabBindingPort } from './tabBinding';
import { createTabTransport } from './transport';

export const CHAT_ROOT = '/chat';
export const MANAGED_ROOT = '/managed';
// 内置根排最前：同名时 discovery 按 root 顺序定赢家
export const SKILL_ROOTS = [BUILTIN_ROOT, '/skills', MANAGED_ROOT];

/**
 * 技能脚本能取的数据源（分册 16）。**目标由宿主写死，脚本只能给 `id`**——
 * 而扩展装在任意站点上，唯一能写死的目标就是「当前绑定的那一页」，
 * 所以这里只有一条，取数范围等同于 `PERCEPTION_SCOPE`。
 *
 * 从别的宿主搬来的技能若引用了别的 `sourceId`，会拿到「未声明」的拒绝并附上本清单，
 * 那是设计意图：`sourceId` 是授权面，不随技能包迁移。
 */
const PAGE_DATA_SOURCE: DataSourceDef = {
  id: 'current-page',
  kind: 'page-perception',
  description: 'Accessibility snapshot of the bound tab, limited to the host perception scope',
  target: 'body'
};

/** side panel 与 options 页共用的配置存储键；同步读取的地方也必须用它 */
export const RUNTIME_CONFIG_KEY = 'webskill.extension.runtime-config';

/** 技能仓变更的跨页广播频道（同源页面间） */
const SKILL_CHANGE_CHANNEL = 'webskill.extension.skills-changed';

/**
 * 在 options 页装/卸/发布技能后告知 side panel。
 *
 * 两边是两个独立的页面上下文，而 `WebSkillRuntime` 把技能目录缓在实例里：
 * side panel 是常驻的，不告知就只能重启面板才能看见新技能。
 * （同页宿主如 playground 靠切回对话视图时重装配解决，扩展没有那个时机。）
 */
export function notifySkillsChanged(): void {
  const channel = new BroadcastChannel(SKILL_CHANGE_CHANNEL);
  channel.postMessage('changed');
  channel.close();
}

export function onSkillsChanged(handler: () => void): () => void {
  const channel = new BroadcastChannel(SKILL_CHANGE_CHANNEL);
  channel.onmessage = () => handler();
  return () => channel.close();
}

/**
 * side panel 与 options 页同源（`chrome-extension://<固定 ID>`，靠 manifest 的 `key`），
 * 所以两边读同一个 `localStorage` 键，`storage` 事件还能给到跨页同步。
 * 在 console 里配好的模型，side panel 无需任何同步代码即可读到（FR-14.9）——
 * **不为此新增任何 SDK 公开契约**。
 *
 * 读路径垫一层 `config.json` 的烘焙缺省值；写路径把烘焙密钥换回占位串，
 * 明文因此不进 localStorage（见 bakedConfig.ts 对这层边界的说明）。
 */
export function createExtensionRuntimeConfigStore(): RuntimeConfigStore {
  const inner = createLocalStorageRuntimeConfigStore({ key: RUNTIME_CONFIG_KEY });
  // localStorage 不可用（隐私模式、配额满）时的副本：SDK store 有自己的兜底，
  // 但那份已经 merge 过默认值，分不出「字段缺席」与「用户就是这个值」
  let memory: unknown;

  return {
    load: async () => restoreBakedSecrets(applyBakedDefaults(readStoredConfig() ?? memory)),
    save: async (config) => {
      const stripped = await stripBakedSecrets(config);
      memory = stripped;
      await inner.save(stripped);
    },
    reset: async () => {
      memory = undefined;
      await inner.reset();
    },
    subscribe: (listener) => inner.subscribe!(listener)
  };
}

/** 存储里的原始配置；`undefined` 表示「没配过」，与「配成了空对象」不同 */
function readStoredConfig(): unknown {
  try {
    const raw = localStorage.getItem(RUNTIME_CONFIG_KEY);
    return raw === null ? undefined : JSON.parse(raw);
  } catch {
    // 存储不可用或内容坏了都按「没配过」处理，落到烘焙缺省值
    return undefined;
  }
}

/**
 * 界面语言的同步读取。`RuntimeConfigStore.load()` 是异步的，而 `PageActionConsent.describeScope`
 * 必须同步返回一行文案——存储后端就是同源 localStorage，直接读同一个键。
 */
export function readLocaleSync(): 'en' | 'zh' {
  return loadRuntimeConfigSync().appearance.locale;
}

/**
 * 运行时配置的同步读取。取数策略要在**每次调用时**读当前配置——
 * 用户在选项页加了一条数据源，side panel 不重载就得能用（0.14.0 分册 19 AC-19.9），
 * 而装配期快照做不到这件事。
 *
 * 模型条目的 `apiKey` 在这条路径上仍是占位串：解密要 WebCrypto（异步），
 * 而本函数的消费者（取数源、出站策略、外观）都不需要它。需要密钥的走 store 的 `load()`。
 */
export function loadRuntimeConfigSync(): RuntimeConfig {
  return applyBakedDefaults(readStoredConfig());
}

/**
 * 本宿主当前能给技能的全部数据源：写死的当前页 + 用户在「设置 › 沙箱」里配的 http 源。
 *
 * 用户配的源**只给 id 和地址**，脚本仍然只能报 id；地址是否放行由沙箱出站策略在
 * `DataSourcePolicy` 内部判定，这里不做也不能做豁免。
 * 同名时宿主自带的赢：`current-page` 的语义不该被一条用户配置改写。
 */
function currentDataSources(): readonly DataSourceDef[] {
  return [
    PAGE_DATA_SOURCE,
    ...loadRuntimeConfigSync().sandbox.dataSources.map((entry) => ({
      id: entry.id,
      kind: 'http' as const,
      description: entry.description === '' ? `User-configured data source "${entry.id}"` : entry.description,
      target: entry.url
    }))
  ];
}

/**
 * 只读的源清单，给选项页用（导入预检与「设置 › 沙箱」的「宿主自带」一栏）。
 * 与 side panel 共用 `currentDataSources`，两处不会各说各话；
 * 投影一律走 `publicSources`，`target` 因此不可能漏进 UI 或模型上下文。
 */
const dataSourceCatalog = new DataSourcePolicy({ sources: currentDataSources });

export function hostDataSources(): readonly DataSourceInfo[] {
  return dataSourceCatalog.publicSources;
}

export function createExtensionFs(): OpfsProvider {
  return new OpfsProvider({ rootName: 'webskill-extension' });
}

/**
 * 首启播种内置技能（幂等）。**地址必须在这一层解**：`chrome.runtime.getURL` 只有扩展页能调，
 * 而 `sidepanel/main.tsx` 不许出现 `chrome.`（AC-14.18）。
 *
 * 不阻塞挂载：播完广播一次。引擎把技能目录缓在实例里，不广播得重开面板才看得见。
 */
export function seedExtensionSkills(fs: OpfsProvider): void {
  void seedBuiltinSkills(fs, (path) => chrome.runtime.getURL(path))
    .then(notifySkillsChanged)
    .catch((error: unknown) => {
      // 播种失败就是「技能库里少了三个技能」，静默会让人以为它本来就没有
      console.error('Failed to seed the built-in skills', error);
    });
}

/**
 * 技能脚本跑在 sandbox 页里的 Worker（分册 12）：执行器一行不改，只换 workerFactory。
 *
 * 参数是 `deps` 而不是 `fs`：沙箱档位、能力开关、网络策略都要跟着用户在 console 里改的
 * `RuntimeConfig` 走，所以不能在这里自己算 deps——主链路把它当 `executorFactory` 交给引擎，
 * 由引擎在每次装配时按当前配置算好再传进来。
 */
export function createExtensionExecutor(deps: SandboxExecutorDeps): BrowserWorkerScriptExecutor {
  return new BrowserWorkerScriptExecutor({
    ...deps,
    workerFactory: () =>
      createIframeWorker(WORKER_BOOTSTRAP_SOURCE, { documentUrl: chrome.runtime.getURL('sandbox.html') })
  });
}

/**
 * side panel 的候选源区块要的一切（0.14.0 分册 21）。
 *
 * 做成端口而不是把 `DataSourceCandidatePolicy` 直接交给组件：那样组件就得自己知道
 * 「当前绑的是哪个 origin」，而 origin 是扩展概念——`src/sidepanel/` 里不许出现 `chrome.`。
 */
export interface DataSourceCandidatesPort {
  subscribe(listener: () => void): () => void;
  /** 单调版本号。`snapshot()` 每次都返回新对象，直接喂给 useSyncExternalStore 会无限重渲 */
  version(): number;
  snapshot(): {
    scope?: string;
    pending: readonly DataSourceCandidate[];
    approved: readonly DataSourceDef[];
    /** 这条 id 被宿主写死的还是用户手配的盖掉了；没被盖返回 undefined */
    shadowOf(id: string): 'host' | 'user' | undefined;
  };
  approve(id: string, remember: boolean): Promise<void>;
  forget(id: string): Promise<void>;
}

export interface SidePanelHost {
  adapter: ChatbotHostAdapter;
  runtimeConfig: RuntimeConfigStore;
  binding: TabBindingPort;
  consent: ExtensionConsentStore;
  /** 下载文件授权的「不再询问」记录（分册 20）；options 页的撤销入口读同一份 */
  downloadConsent: ExtensionDownloadConsentStore;
  /** 站点自荐的数据源（分册 21）：待批 / 已批 / 批准 / 撤销 */
  candidates: DataSourceCandidatesPort;
  /** 「记住」的持久化；options 页列出与撤销读同一份 */
  candidateStore: ExtensionDataSourceCandidateStore;
  /** 页面握手发现到的端点 / 页面技能 / WebMCP（分册 18） */
  pageMcp: PageMcpHost;
  /** 技能自动生成的候选收货端；根与 options 页的治理门面一致，生成的候选直接进审核队列 */
  skillCandidates: CandidateSink;
  /**
   * 技能脚本的取数入口（分册 16 的宿主两步接线之第一步）。**稳定引用**：
   * 它进 `ChatEngine` 的 useMemo 依赖表，内联箭头会每次渲染重建引擎并丢会话态。
   * 第二步是运行时配置里的 `sandbox.capabilities.fetchData`，缺省仍关。
   */
  fetchData: (sourceId: string, params?: Record<string, unknown>) => Promise<unknown>;
  /**
   * 给模型看的数据源清单（0.14.0 分册 19）。**函数形式**：用户改完配置立刻反映，
   * 又不必换引用把 `ChatEngine` 重建掉。只含 id 与描述，接口地址不进模型上下文。
   */
  dataSources: () => readonly DataSourceInfo[];
  /**
   * 执行器替换点。走 `ChatbotConfig.executorFactory` 而不是 `adapter.executor`：
   * 后者会让引擎跳过 `RuntimeConfig.sandbox` 映射，于是设置里开了 `fetchData` 也还是拿到 disabled。
   */
  executorFactory: (deps: SandboxExecutorDeps) => BrowserWorkerScriptExecutor;
  /** 确认卡的 UI 端口在引擎就绪后回填（engine 装配晚于 policy） */
  pageActionUi: { current?: PageActionUi };
  /**
   * chatbot 各处「打开设置」出口的落点。分区必须一直传到 options 页：
   * `openOptionsPage()` 带不了参数，console 拿不到 `initialPage` 就落缺省的技能库。
   */
  openConsolePage(section?: SettingsSectionId): void;
  /** 在普通标签页里完成一次麦克风授权（0.17.0 FR-10.2） */
  openMicrophonePermissionPage(): void;
  /** 在普通标签页里完成一次摄像头授权（0.17.0 FR-14.7） */
  openCameraPermissionPage(): void;
  /** Agent 焦点与用户视线是否同一页（0.16.0 FR-11.7）；提示条只认这个端口，不认 `chrome.*` */
  agentFocus: AgentFocusPort;
}

/**
 * 给界面看的「模型现在在哪一页」（0.16.0 分册 11）。
 *
 * 刻意只有四个成员：side panel 不该知道标签页 id，也不该有第二条改焦点的路。
 * @see AC-14.18 —— 挂载侧一个 `chrome.` 都不许出现
 */
export interface AgentFocusPort {
  subscribe(listener: () => void): () => void;
  /** 焦点与用户当前页一致（含「还没设焦点」）。**一致时提示条不存在**，不是隐藏（DV-3） */
  matched(): boolean;
  /** 焦点页的标题/地址，供提示条显示 */
  page(): { title?: string; url?: string } | undefined;
  /** 用户点「跟随」：把焦点搬到用户当前看的这一页。这是**用户**的动作，不违反 SC-3 */
  follow(): void;
}

/**
 * side panel 的全部装配。**扩展能力只在这里碰 `chrome.*`**：
 * 挂载文件（`src/sidepanel/main.tsx`）里一个都不许出现（AC-14.18）。
 * 这条约束不是洁癖，它是「这份 UI 能不能原样搬去网页宿主」的机械判据。
 */
export function createSidePanelHost(): SidePanelHost {
  const fs = createExtensionFs();
  seedExtensionSkills(fs);
  const runtimeConfig = createExtensionRuntimeConfigStore();
  const audit = new FsAuditLog({ root: MANAGED_ROOT, fs });

  // 一个 registry 实例同时喂给 reader 与 executor：这是分册 13 的装配前提，
  // 各建一个的话执行期永远查不到感知期发出的句柄
  const targets = createRemoteTargetRegistry();
  // 两者互相要对方：绑定变了要清端点，端点要问「现在绑的是哪个 tab」。
  // 用一个可填的 holder 打破（与 `pageActionUi` 同一惯例），比让 tabBinding 认识 MCP 干净
  const onPageChanged: { reset?: () => void } = {};
  const candidateStore = createExtensionDataSourceCandidateStore();
  const candidates = new DataSourceCandidatePolicy({
    store: candidateStore,
    audit: {
      record: (event) =>
        void audit.append({ type: AUDIT_EVENT_TYPES.dataFetched, target: event.id ?? event.scope, data: { ...event } })
    }
  });
  const candidateListeners = new Set<() => void>();
  let candidateVersion = 0;
  /** 最近一次感知回报的文档身份；两类页面留痕的 `page` 键取自它（分册 11 §8） */
  let currentPage: { key: string; url?: string; title?: string } | undefined;
  const announceCandidates = (): void => {
    candidateVersion += 1;
    for (const listener of candidateListeners) listener();
  };
  const binding = createTabBinding(() => {
    // 0.16.0 起**不**在这里清句柄表：用户切一下标签页就把模型手上的句柄全废掉，
    // 正是分册 11 要消灭的行为。失效改由「该文档自己变了 / 那一页被关了」触发（FR-11.3）
    //
    // 端点是「这一页的能力」：留着上一页的端点
    // 就是让模型去调一个它已经看不见的页面里的工具（FR-18.4）
    onPageChanged.reset?.();
    // 候选源同理（D-21-7）；已记住的不动，它们靠 approved(新 origin) 自然只对新站点生效
    candidates.clearPending();
    announceCandidates();
  });

  /**
   * 主动向当前页要一次它声明过的数据源（分册 21）。
   *
   * 站点通常只在加载时喊一次，而面板往往比页面晚开、或是切回一个早就开着的 tab——
   * 光等推送，界面会停在「这站什么都没提供」上。拉取答的是内容脚本缓存的那一份。
   */
  const pullCandidates = async (): Promise<void> => {
    const tabId = binding.tabId();
    const scope = binding.origin();
    if (tabId === undefined || scope === undefined) return;
    const reply: unknown = await chrome.tabs
      .sendMessage(tabId, pageDataSourcesPull(), { frameId: 0 })
      .catch(() => undefined);
    if (!isPageDataSourcesMessage(reply) || reply.sources.length === 0) return;
    candidates.offer(scope, reply.sources);
    await candidates.restore(scope).catch(() => undefined);
    announceCandidates();
  };

  // 换绑之后才拉：`onRebind` 是在 `current` 更新**之前**调的，那时读到的还是上一页
  let pulledFor: string | undefined;
  binding.subscribe(() => {
    const key = `${binding.tabId() ?? ''}|${binding.origin() ?? ''}`;
    if (key === pulledFor) return;
    pulledFor = key;
    void pullCandidates();
  });
  const pageMcp = createPageMcpHost({ resolveTabId: () => binding.tabId() });
  onPageChanged.reset = () => pageMcp.reset();
  /**
   * 标签页工作集（0.16.0 分册 11 ~ 13）。
   *
   * 传输层此后问的是 **Agent 焦点**而不是用户的活动标签页：模型点开详情页、
   * 再切回列表页，用户画面一直停在原处（SC-3）。焦点没设时回落到绑定页，
   * 行为与本版前一致。
   */
  const workset = createExtensionTabWorkset({
    onFocus: (shard) => targets.focus(shard ?? ''),
    onReset: () => targets.clear(),
    onDrop: (shard) => targets.drop(shard)
  });
  const transport = createTabTransport(() => workset.focusedTabId() ?? binding.tabId());

  const perception = new PagePerceptionPolicy({
    scope: PERCEPTION_SCOPE,
    reader: createRemotePerceptionReader({
      transport,
      targets,
      // 感知回来的文档身份即分片键；宿主据此知道「这条留痕、这个焦点属于哪一页」（分册 11 §8）
      onDocument: (document) => {
        currentPage = document;
        workset.noteDocument(document.key);
      }
    }),
    describePage: () => currentPage,
    audit
  });

  const consent = createExtensionConsentStore(() => binding.origin(), readLocaleSync);
  const downloadConsent = createExtensionDownloadConsentStore(readLocaleSync);
  // 根与 options 页的 governance facade 同为 MANAGED_ROOT，生成的候选因此直接出现在 console 的审核队列里
  const skillCandidates = createCandidateSink({ store: new CandidateStore({ root: MANAGED_ROOT, fs }), audit });
  // 取数走的是**同一个** perception 策略：数据能不能读由 PERCEPTION_SCOPE 一处判定，
  // 脚本走这条路只是不把结果塞进模型上下文（分册 16 FR-16.5）
  const dataSources = new DataSourcePolicy({
    // D-21-4 的三级优先级就是拼接顺序：撞名保留先声明的那条（宿主 > 用户 > 自动发现）
    sources: () => [...currentDataSources(), ...candidates.approved(binding.origin())],
    provenanceOf: (source) => candidates.provenanceOf(binding.origin(), source.id),
    // 出站放行沿用沙箱设置里的那一份，取数不另开一套白名单
    remoteUrl: () => loadRuntimeConfigSync().sandbox.remoteUrl,
    transports: {
      'page-perception': {
        fetch: async () => {
          const { nodes } = await perception.perceive();
          return { url: binding.snapshot().url, nodes };
        }
      },
      http: createHttpDataSourceTransport(),
      // 分册 21：投影出候选却不接通道，等于「看得见取不到」——AC-21.17 会绿而功能是假的
      'webmcp-tool': {
        fetch: async (source, params) => {
          // target 是页面声明的原始工具名；模型侧名字带 `mcp__` 前缀，得由宿主补
          const result = await pageMcp.callWebMcpTool(source.target, params ?? {});
          if (!result.ok) throw new Error(result.error?.message ?? `Page tool "${source.target}" failed.`);
          // 脚本要的是数据不是工具回执；文本能解成 JSON 就给结构，否则原样给串
          const text = result.content.map((part) => part.text ?? '').join('');
          try {
            return JSON.parse(text);
          } catch {
            return text;
          }
        }
      }
    },
    audit: {
      record: (event) =>
        void audit.append({ type: AUDIT_EVENT_TYPES.dataFetched, target: event.sourceId, data: { ...event } })
    }
  });
  /**
   * 绑定页即工作集第 0 项（FR-12.4）。`anchor` 在本轮已经动过页面之后是空操作——
   * run 在跑时用户切标签页，不该把 Agent 的焦点拽回来；两轮之间则相反，起点跟着用户走。
   */
  const anchorBinding = (): void => {
    const snapshot = binding.snapshot();
    if (snapshot.tabId === undefined || !snapshot.bindable) return;
    workset.anchor(snapshot.tabId, {
      ...(snapshot.title === undefined ? {} : { title: snapshot.title }),
      ...(snapshot.url === undefined ? {} : { url: snapshot.url })
    });
  };
  anchorBinding();
  binding.subscribe(anchorBinding);

  const pageActionUi: { current?: PageActionUi } = {};
  // 下载信号的开关必须**同步**读得到（策略在 act() 里判），而配置存储是异步的：
  // 缓存一份，订阅变更时刷新。快照只在装配期取一次的话，用户刚打开的开关要等重启才生效（分册 15 · §8）
  let downloadSignalOn = false;
  const refreshDownloadSignal = (): void => {
    void runtimeConfig
      .load()
      .then((config) => {
        downloadSignalOn = config.sandbox.downloadedFiles === true;
      })
      .catch(() => undefined);
  };
  refreshDownloadSignal();
  runtimeConfig.subscribe?.(refreshDownloadSignal);
  // 两个策略互相引用（页面操作要 admit、工作集要 enabled），显式标注类型才能断开推导环
  const pageActions: PageActionPolicy = new PageActionPolicy({
    scope: ACTION_SCOPE,
    executor: createRemotePageActionExecutor({ transport, targets }),
    ui: { request: (input) => pageActionUi.current!.request(input) },
    consent,
    audit,
    // 只在一次操作的窗口期内订阅；开关关着时窗口照开，但结果只进留痕（D-15-6）
    downloadWatcher: createExtensionDownloadWatcher(),
    downloadSignalEnabled: () => downloadSignalOn,
    downloadWaitMs: () => DOWNLOAD_WAIT_MS,
    // 句柄不属于当前焦点页时给出可操作的说明，而不是笼统的「过期了」（分册 11 §7）
    diagnose: (ref) => explainResolution(targets.resolve(ref)),
    // 新标签页的观察窗口与准入；两者都不注入即这条通路整个不存在（AC-13.13）
    tabWatcher: workset.watcher,
    workset: { admit: (opened) => tabWorkset.admit(opened) },
    describePage: () => currentPage
  });

  /**
   * 模型侧标签页控制（分册 12）。准入闸门住在这里，
   * 页面操作的准入因此也要经过它 —— 上限只有一处判定。
   */
  const tabWorkset: TabWorksetPolicy = new TabWorksetPolicy({
    port: workset.port,
    // 三个工具与页面操作同生共死：不能操作页面的会话里，切换页面没有意义（FR-12.1）
    enabled: () => pageActions.enabled,
    audit
  });

  const bundle = createBrowserChatbotHost({
    fs,
    managedRoot: MANAGED_ROOT,
    skillRoots: SKILL_ROOTS,
    // chatbot 的「打开控制台」按钮因此自然落到扩展的选项页，chatbot 侧一行不改（D-14-6）
    navigation: {
      openConsole: () => void chrome.runtime.openOptionsPage(),
      // openOptionsPage() 带不了参数，定位候选只能自己开标签页（FR-24.2）
      openConsoleCandidate: (candidateId: string) =>
        void chrome.tabs.create({
          url: chrome.runtime.getURL(`options.html?candidate=${encodeURIComponent(candidateId)}`)
        })
    },
    pagePerception: perception
  });

  const adapter: ChatbotHostAdapter = {
    ...(bundle.chatbotAdapter as unknown as ChatbotHostAdapter),
    pageActions,
    // 三个标签页工具（分册 12）。策略自己还要求页面操作开着，因此这里给了也不等于开着
    pageTabs: tabWorkset,
    // 大页面分段回喂（分册 22）。扩展的 scope 是 `body` 一条，正是最容易撑爆预算的形状——
    // 不开这个开关，ERP 类页面上靠后的字段模型永远读不到，而且它自己不知道。
    // 预算用 SDK 那份缺省，不在这里另抄一组数
    pagePerceptionPaging: { enabled: true, ...PERCEPTION_PAGING_DEFAULTS },
    // 页面自己注册的 MCP 端点与页面技能（分册 18）。同一个对象两个 port：
    // 工具给模型调，prompts 当临时技能装载
    pageSkillSource: pageMcp.source,
    // docx/xlsx 抽取器同时服务**附件上传**与链接文档读取，前者与页面感知无关：
    // 挂进感知开关里的话，用户在文件选择器里根本选不到 .docx/.xlsx（分册 17 D-17-4）
    docxExtractor: extractDocxText,
    xlsxExtractor: extractXlsxText,
    pdfExtractor: extractPdfText,
    // 链接文档读取走**内容脚本**取件，为的是带上用户在那个站点的登录态（D-17-1）。
    // side panel 自己 fetch 拿到的会是一张登录页，而那对模型看起来是「读成功了」
    linkedDocuments: createTabLinkedDocumentReader({
      pageUrl: () => binding.snapshot().url,
      fetchInTab: async (url) => {
        const tabId = binding.tabId();
        if (tabId === undefined) throw new Error('No tab is bound.');
        return await chrome.tabs.sendMessage(tabId, documentFetchRequest(url), { frameId: 0 });
      }
    }),
    documentAudit: audit,
    // 文档投放面（0.15.0 分册 13）。viewer 页跑在 `sandbox.pages` 里的 opaque origin，
    // 那是扩展里**唯一**能拿到真隔离的办法：扩展页没有服务端，`<meta>` 里的 sandbox 指令被忽略。
    // 地址在这里取，不在 `sidepanel/main.tsx`——AC-14.18 禁止那一侧出现 `chrome.`
    documentSurface: createDocumentSurfaceHost({
      viewerUrl: chrome.runtime.getURL('view.html'),
      // viewer 页跑在 opaque origin，读不到扩展存储，界面语言只能随地址带过去。
      // **每次投放时现读**：装配期快照会把语言钉死在开面板那一刻
      open: (url, target) => window.open(`${url}?lang=${readLocaleSync()}`, target),
      // 授权走扩展既有的确认卡通路（与页面操作同一个 UI 桥），不另造一套弹窗
      confirm: async ({ skillName, dataSource }) => {
        const zh = readLocaleSync() === 'zh';
        const response = await pageActionUi.current!.request({
          type: 'confirm',
          id: `document-surface-${Date.now()}`,
          message: zh
            ? `技能「${skillName}」要把一份文档投到独立窗口打开，其中包含来自「${dataSource}」的数据。是否继续？`
            : `Skill “${skillName}” wants to open a document in a separate window. It carries data from “${dataSource}”. Continue?`
        });
        return response.cancelled !== true && response.value !== false;
      },
      audit
    }),
    // 读本机下载的文件（分册 20）。只交端口：开关读 `sandbox.downloadedFiles`、
    // 授权卡走引擎的 UI 桥、抽取器复用上面那两个，都在 chatbot 侧完成
    downloads: { reader: createExtensionDownloadsReader(), consent: downloadConsent }
  };

  // 页面端点变了就重新拉一次清单。**必须校验来源 tab**（FR-18.7 第 4 条）：
  // 这条通知任何标签页的内容脚本都能发，不比对就等于让后台标签页往这里投毒
  chrome.runtime.onMessage.addListener((message, sender) => {
    if (!isPageMcpChanged(message) || sender.tab?.id !== binding.tabId()) return false;
    void pageMcp.refresh(true).catch(() => undefined);
    return false;
  });

  // 站点自荐的数据源（分册 21）。复用**同一条**来源 tab 闸（AC-21.14）：
  // 这条消息带内容，来源错了就是把别的站点的地址挂到当前站点名下
  chrome.runtime.onMessage.addListener((message, sender) => {
    if (!isPageDataSourcesMessage(message) || sender.tab?.id !== binding.tabId()) return false;
    const scope = binding.origin();
    if (scope === undefined) return false;
    candidates.offer(scope, message.sources);
    // 已记住的那些不该再问一次；回填后才通知界面，否则会闪一下待批条目
    void candidates.restore(scope).then(announceCandidates, announceCandidates);
    return false;
  });

  /** 界面要的是「这条候选被谁盖掉了」，那是纯 UI 职责，不进 policy（设计 §2） */
  const shadowOf = (id: string): 'host' | 'user' | undefined => {
    if (PAGE_DATA_SOURCE.id === id) return 'host';
    return loadRuntimeConfigSync().sandbox.dataSources.some((entry) => entry.id === id) ? 'user' : undefined;
  };

  const candidatesPort: DataSourceCandidatesPort = {
    subscribe(listener) {
      candidateListeners.add(listener);
      return () => void candidateListeners.delete(listener);
    },
    version: () => candidateVersion,
    snapshot: () => ({
      ...(binding.origin() === undefined ? {} : { scope: binding.origin()! }),
      pending: candidates.pending(binding.origin()),
      approved: candidates.approved(binding.origin()),
      shadowOf
    }),
    async approve(id, remember) {
      const scope = binding.origin();
      if (scope === undefined) return;
      await candidates.approve(scope, id, { remember });
      announceCandidates();
    },
    async forget(id) {
      const scope = binding.origin();
      if (scope === undefined) return;
      await candidates.forget(scope, id);
      announceCandidates();
    }
  };

  return {
    adapter,
    runtimeConfig,
    binding,
    consent,
    downloadConsent,
    candidates: candidatesPort,
    candidateStore,
    pageMcp,
    skillCandidates,
    fetchData: (sourceId, params) => dataSources.fetchData(sourceId, params),
    dataSources: () => dataSources.publicSources,
    executorFactory: createExtensionExecutor,
    pageActionUi,
    openConsolePage: (section) =>
      void (section === undefined
        ? chrome.runtime.openOptionsPage()
        : chrome.tabs.create({
            url: chrome.runtime.getURL(`options.html?page=${encodeURIComponent(section)}`)
          })),
    openMicrophonePermissionPage: () => void chrome.tabs.create({ url: chrome.runtime.getURL('microphone.html') }),
    openCameraPermissionPage: () => void chrome.tabs.create({ url: chrome.runtime.getURL('camera.html') }),
    agentFocus: {
      // 绑定与工作集都会改变「一致与否」，两处都要订阅：只订一处就会出现
      // 提示条该消失却不消失
      subscribe: (listener) => {
        const offBinding = binding.subscribe(listener);
        const offWorkset = workset.subscribe(listener);
        return () => {
          offBinding();
          offWorkset();
        };
      },
      matched: () => workset.matchesUserTab(binding.tabId()),
      page: () => workset.focusedPage(),
      follow: () => {
        const snapshot = binding.snapshot();
        if (snapshot.tabId === undefined || !snapshot.bindable) return;
        workset.follow(snapshot.tabId, {
          ...(snapshot.title === undefined ? {} : { title: snapshot.title }),
          ...(snapshot.url === undefined ? {} : { url: snapshot.url })
        });
      }
    }
  };
}

/**
 * 绑定到某个 tab（FR-14.4 / D-14-3）。
 *
 * **自动跟随浏览器的活动 tab**。原先要用户手点「绑定到当前标签页」，代价是：
 * 用户点开一个链接、浏览器把新页面推到眼前，助手仍然只认上一页——
 * 用户对着新页面提问，模型答的是旧页面，而两边都不知道自己在说不同的东西。
 *
 * 自动跟随带回来的风险是模型上下文里还留着上一页的句柄。处置办法是换页即弃表：
 * 旧 ref 在新表里查不到，`PageActionPolicy` 因此抛 `PAGE_ACTION_STALE_REF`，
 * 消息原文就是「重新感知这一页再试」——模型能读懂并自行纠正。
 *
 * 扩展自己的页面（options / side panel）与 `chrome://` 一律**不接管绑定**：
 * 用户去控制台配个模型再切回来，绑定不该因此丢掉。
 */
export interface TabBindingSnapshot {
  tabId?: number;
  title?: string;
  origin?: string;
  /** 完整 URL；同一站点开出多个标签页时，origin 分不出绑的是哪一个 */
  url?: string;
  /** 绑定的 tab 已关闭；下一次切到别的页面会自动接管 */
  lost: boolean;
  /** 内容脚本注入不进去的页面（`chrome://`、扩展页、商店页）；transport 据此立刻失败 */
  bindable: boolean;
}

export interface TabBindingPort {
  snapshot(): TabBindingSnapshot;
  /** 供 transport 用：没绑定就是 undefined，由 transport 立刻失败 */
  tabId(): number | undefined;
  /** 供授权记忆用的粒度串；无绑定或无法解析时 undefined */
  origin(): string | undefined;
  bindActiveTab(): Promise<void>;
  subscribe(listener: () => void): () => void;
}

function originOf(url: string | undefined): string | undefined {
  if (url === undefined) return undefined;
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}

/** 浏览器对这些页面一律禁止注入内容脚本，`host_permissions` 再宽也没用 */
const UNBINDABLE_SCHEME = /^(chrome|chrome-untrusted|chrome-extension|moz-extension|devtools|edge|about|view-source):/i;
const WEB_STORE = /^https:\/\/(chromewebstore\.google\.com|chrome\.google\.com\/webstore)\//i;

/**
 * 浏览器自有的页面，含本扩展的 console（它就开在一个普通标签页里）。
 * 与 `about:` 分开：后者是普通标签页刚打开时的过渡态，真实地址随后由 `onUpdated` 送来；
 * 这几个 scheme 则**永远**不会变成可绑定的页面，把它们记成「活动 tab」只会拖累後续判定。
 */
const BROWSER_OWNED = /^(chrome|chrome-untrusted|chrome-extension|moz-extension|devtools|edge|view-source):/i;

function isBindable(url: string | undefined): boolean {
  if (url === undefined) return false;
  return !UNBINDABLE_SCHEME.test(url) && !WEB_STORE.test(url);
}

/**
 * 最近一次绑定的 tab。side panel 与 options 页是两个进程各自一份绑定，
 * 而 options 页被看的时候“活动 tab”正是它自己（不可绑定）。
 * 两页同源，记在 localStorage 里就能对上同一页（分册 18 FR-18.6）。
 */
const LAST_BOUND_KEY = 'webskill.extension.last-bound-tab';

const rememberTab = (tabId: number): void => {
  globalThis.localStorage?.setItem(LAST_BOUND_KEY, String(tabId));
};

const rememberedTab = (): number | undefined => {
  const raw = globalThis.localStorage?.getItem(LAST_BOUND_KEY);
  const parsed = raw === null || raw === undefined ? Number.NaN : Number(raw);
  return Number.isInteger(parsed) ? parsed : undefined;
};

/**
 * @param onRebind 换页时的副作用（清空句柄表）。做成入参而不是内部直接引用 registry：
 *   绑定与句柄表是两件事，把后者塞进来会让这个模块也变成装配代码。
 */
export function createTabBinding(onRebind: () => void): TabBindingPort {
  let current: TabBindingSnapshot = { lost: false, bindable: false };
  /**
   * 浏览器焦点所在的 tab，**不管它可不可绑定**。
   * 新开的标签页/窗口在 `onActivated` 那一刻通常还停在 `about:blank`，
   * 真实地址是随后由 `onUpdated` 送来的；不记住这个 id 就接不上那一步。
   */
  let activeTabId: number | undefined;
  const listeners = new Set<() => void>();
  const notify = (): void => {
    for (const listener of [...listeners]) listener();
  };

  const adopt = (tab: chrome.tabs.Tab | undefined): void => {
    if (tab?.id === undefined || !isBindable(tab.url)) return;
    const nextOrigin = originOf(tab.url);
    rememberTab(tab.id);
    // 换了 tab 或换了站点即弃表：旧 ref 留着就是让模型能操作它已经看不见的页面
    if (tab.id !== current.tabId || nextOrigin !== current.origin) onRebind();
    current = {
      tabId: tab.id,
      lost: false,
      bindable: true,
      ...(tab.title ? { title: tab.title } : {}),
      ...(tab.url ? { url: tab.url } : {}),
      ...(nextOrigin ? { origin: nextOrigin } : {})
    };
    notify();
  };

  chrome.tabs.onRemoved.addListener((tabId) => {
    if (tabId !== current.tabId) return;
    current = { ...current, lost: true };
    notify();
  });

  chrome.tabs.onActivated.addListener(({ tabId }) => {
    void chrome.tabs
      .get(tabId)
      .then((tab) => {
        if (!BROWSER_OWNED.test(tab.url ?? '')) activeTabId = tabId;
        adopt(tab);
      })
      .catch(() => undefined);
  });

  // 用户点链接弹出新窗口时焦点整个换窗口，`onActivated` 未必补一发
  chrome.windows.onFocusChanged.addListener((windowId) => {
    if (windowId === chrome.windows.WINDOW_ID_NONE) return;
    void chrome.tabs
      .query({ active: true, windowId })
      .then(([tab]) => {
        if (tab?.id !== undefined && !BROWSER_OWNED.test(tab.url ?? '')) activeTabId = tab.id;
        adopt(tab);
      })
      .catch(() => undefined);
  });

  chrome.tabs.onUpdated.addListener((tabId, _change, tab) => {
    // 绑定页自己导航：origin 变了要立刻反映出来，否则授权记忆会记到上一个站点头上
    if (tabId === current.tabId || tabId === activeTabId) adopt(tab);
  });

  return {
    snapshot: () => current,
    tabId: () => (current.lost ? undefined : current.tabId),
    origin: () => (current.lost ? undefined : current.origin),
    bindActiveTab: async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id !== undefined && !BROWSER_OWNED.test(tab.url ?? '')) activeTabId = tab.id;
      adopt(tab);
      if (current.tabId !== undefined) return;
      // 从 options 页打开时活动 tab 就是它自己（不可绑定）；回退到上一次记住的那一页
      const remembered = rememberedTab();
      if (remembered !== undefined) {
        await chrome.tabs
          .get(remembered)
          .then(adopt)
          .catch(() => undefined);
        if (current.tabId !== undefined) return;
      }
      // tab id 不跨浏览器会话，记住的那一页可能早就关了。此时只扫「活动 tab」是不够的：
      // 每个窗口只有一个活动 tab，而用户只开一个窗口时那一个正是 console 自己。
      // 扫不到就一直停在「没有绑定页」，直到用户偷偷切一下标签页才好——那个动作没人猜得到
      const recent = (tabs: readonly chrome.tabs.Tab[]): chrome.tabs.Tab | undefined =>
        tabs
          .filter((candidate) => isBindable(candidate.url))
          .sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))[0];
      adopt(recent(await chrome.tabs.query({ currentWindow: true }).catch(() => [])));
      if (current.tabId !== undefined) return;
      adopt(recent(await chrome.tabs.query({}).catch(() => [])));
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}

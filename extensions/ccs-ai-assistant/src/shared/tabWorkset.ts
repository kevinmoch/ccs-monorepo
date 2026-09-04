/**
 * 标签页工作集在扩展进程里的实现（0.16.0 分册 11 / 12 / 13）。
 *
 * 一个模块同时产出 `TabWorksetPort` 与 `ActionTabWatcher`，因为两者共享**同一份**
 * 「句柄 → tabId」映射：watcher 观察到新页、admit 把它接进来并发句柄，
 * 中间不能经过一次按 URL 的重新查找——同一地址的两个标签页会撞在一起。
 *
 * ## SC-3 的宿主义务
 *
 * `focus()` **不得**调用任何会改变用户可见画面的 API
 * （`chrome.tabs.update({ active: true })`、`chrome.windows.update({ focused: true })`
 * 及一切等价物）。切换焦点只改变「后续感知与操作发往哪一页」。
 * 本文件里因此**不存在**对那两个 API 的调用；守护测试逐字检查这一点。
 */
import type {
  ActionTabWatcher,
  ActionTabWindow,
  OpenedPageInfo,
  TabWorksetPort,
  WorksetTab
} from '@webskill/sdk/agent';

/** 一次操作最多等多久确认「有没有开出新页」；超过就是没开 */
const OPEN_WAIT_MS = 1_500;

interface Member {
  handle: string;
  tabId: number;
  /** run 起点的那一页归用户所有，模型不得关闭（SC-3） */
  origin: boolean;
  /** 该页最近一次被感知时的文档分片键；焦点切过去时据此切句柄表（分册 11） */
  shard?: string;
}

export interface ExtensionTabWorksetOptions {
  /**
   * 焦点移到某个分片。传 `undefined` 表示那一页还没被感知过——
   * 此时**不能**留在上一页的分片上，否则模型拿旧句柄操作新页面（SC-1 的根）。
   */
  onFocus(shard: string | undefined): void;
  /** run 结束：连带清空句柄表（FR-11.4）。它只丢句柄，不关闭任何标签页 */
  onReset(): void;
  /** 某一页作废（关闭 / 文档变了）：只丢它自己的分片 */
  onDrop(shard: string): void;
}

export interface ExtensionTabWorkset {
  port: TabWorksetPort;
  watcher: ActionTabWatcher;
  /**
   * 后续感知与操作该发往哪个 tab。焦点没设或那一页已经关了就返回 `undefined`，
   * 由装配层回落到用户的活动标签页。
   */
  focusedTabId(): number | undefined;
  /** 焦点页的标题/地址快照；提示条要告诉用户「模型现在在哪一页」 */
  focusedPage(): OpenedPageInfo | undefined;
  /** 用户当前看的那一页是不是 Agent 的焦点页；提示条据此出现或不出现（FR-11.7） */
  matchesUserTab(userTabId: number | undefined): boolean;
  /** 用户点「跟随」：把 Agent 焦点改到用户当前页。这是**用户**的动作，不违反 SC-3 */
  follow(tabId: number, page?: OpenedPageInfo): void;
  /** run 起点：把绑定页登记为工作集第 0 项 */
  anchor(tabId: number, page?: OpenedPageInfo): void;
  /**
   * 感知回报了文档身份：把分片键记到**当前焦点页**名下。
   * 这是扩展侧唯一知道「哪个标签页对应哪个分片」的时刻——
   * 句柄表住在 `@webskill/browser` 里，那一层不认识标签页（AC-G8）。
   */
  noteDocument(key: string): void;
  subscribe(listener: () => void): () => void;
}

/** 句柄是随机串而不是 tabId：模型若能猜出「+1 就是下一页」，SC-2 的闭合准入就形同虚设 */
function newHandle(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return `tab-${[...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}

export function createExtensionTabWorkset(options: ExtensionTabWorksetOptions): ExtensionTabWorkset {
  /** 接入顺序即数组顺序；第 0 项恒为 run 起点的绑定页 */
  let members: Member[] = [];
  let focused: string | undefined;
  /**
   * 本轮里模型已经动过这些页了（感知过 / 操作过 / 开过新页）。
   *
   * 它就是「run 在跑」的闸门：`reset()` 会把它清掉，而 reset 恰好在每一轮结束时调。
   * 不能拿 `members.length > 0` 代替：`anchor` 自己就把工作集填成了非空，
   * 那个条件一旦成立就再也不会回到 false，于是 run 之间用户切标签页也被拦下，
   * 焦点永远停在第一次 anchor 的那一页上——提示条从第二次切页起就持续冒出来。
   */
  let touched = false;
  /** 最近一次观察窗口捕获到的新页；`admit` 直接消费它，不按 URL 回查 */
  let lastOpened: { tabId: number; page: OpenedPageInfo } | undefined;
  const listeners = new Set<() => void>();
  /** tabId → 该页的标题/地址快照；工作集里的页不一定是活动页，随时问 chrome 是异步的 */
  const pages = new Map<number, OpenedPageInfo>();

  const notify = (): void => {
    for (const listener of [...listeners]) listener();
  };

  const memberOf = (handle: string): Member | undefined => members.find((m) => m.handle === handle);

  /** 关掉的页立刻离开工作集：留着就是让模型往一个不存在的地方发消息 */
  chrome.tabs.onRemoved.addListener((tabId) => {
    const leaving = members.filter((m) => m.tabId === tabId);
    if (leaving.length === 0) return;
    members = members.filter((m) => m.tabId !== tabId);
    pages.delete(tabId);
    for (const member of leaving) {
      if (member.shard !== undefined) options.onDrop(member.shard);
      if (focused === member.handle) {
        focused = undefined;
        options.onFocus(undefined);
      }
    }
    notify();
  });

  chrome.tabs.onUpdated.addListener((tabId, _change, tab) => {
    if (!members.some((m) => m.tabId === tabId)) return;
    pages.set(tabId, {
      ...(tab.title === undefined ? {} : { title: tab.title }),
      ...(tab.url === undefined ? {} : { url: tab.url })
    });
    notify();
  });

  const join = (tabId: number, page: OpenedPageInfo | undefined, origin: boolean): string => {
    const existing = members.find((m) => m.tabId === tabId);
    if (page !== undefined) pages.set(tabId, page);
    if (existing !== undefined) return existing.handle;
    const member: Member = { handle: newHandle(), tabId, origin };
    members = origin ? [member, ...members.filter((m) => !m.origin)] : [...members, member];
    return member.handle;
  };

  const port: TabWorksetPort = {
    list: (): readonly WorksetTab[] =>
      members.map((member) => {
        const page = pages.get(member.tabId);
        return {
          handle: member.handle,
          ...(page?.title === undefined ? {} : { title: page.title }),
          ...(page?.url === undefined ? {} : { url: page.url })
        };
      }),

    // SC-3：只改「后续消息发往哪一页」。**没有** chrome.tabs.update / windows.update
    focus: (handle: string): void => {
      const member = memberOf(handle);
      focused = handle;
      options.onFocus(member?.shard);
      notify();
    },

    close: async (handle: string): Promise<void> => {
      const member = memberOf(handle);
      if (member === undefined) return;
      members = members.filter((m) => m.handle !== handle);
      pages.delete(member.tabId);
      if (member.shard !== undefined) options.onDrop(member.shard);
      // 焦点落在被关掉的那一页上时不自动跳到别处：让下一次操作明确报「这一页没了」，
      // 比让它悄悄作用在另一页上安全
      if (focused === handle) {
        focused = undefined;
        options.onFocus(undefined);
      }
      notify();
      await chrome.tabs.remove(member.tabId).catch(() => undefined);
    },

    admit: (opened: OpenedPageInfo): string => {
      const captured = lastOpened;
      lastOpened = undefined;
      // 观察窗口没抓到 tabId 时不猜：宁可让准入失败，也不能把一个不确定的页接进工作集
      if (captured === undefined) throw new Error('The page that was opened could not be identified.');
      const handle = join(captured.tabId, { ...captured.page, ...opened }, false);
      // 新开的页立刻成为焦点：模型的下一步几乎总是读它。
      // 它还没被感知过，分片因此是 `undefined`：先感知才能拿到句柄
      focused = handle;
      options.onFocus(memberOf(handle)?.shard);
      notify();
      return handle;
    },

    reset: (): void => {
      members = [];
      focused = undefined;
      lastOpened = undefined;
      touched = false;
      pages.clear();
      options.onReset();
      notify();
    }
  };

  /**
   * 一次页面操作的观察窗口（分册 13 FR-13.2）。
   *
   * 与下载观察端口同款：**只在窗口期内**订阅 `chrome.tabs.onCreated`，结算时立刻退订。
   * 常驻监听意味着这个扩展任何时候都在看用户开了什么标签页。
   */
  const watcher: ActionTabWatcher = {
    open: (): ActionTabWindow => {
      // 一次页面操作即将发生：从这一刻起直到 run 结束，用户切页不再改变模型的焦点
      touched = true;
      let hit: { tabId: number; page: OpenedPageInfo } | undefined;
      let firstHit: (() => void) | undefined;
      const listener = (tab: chrome.tabs.Tab): void => {
        if (tab.id === undefined || hit !== undefined) return;
        hit = {
          tabId: tab.id,
          page: {
            ...(tab.title === undefined || tab.title === '' ? {} : { title: tab.title }),
            ...(tab.url === undefined || tab.url === '' ? {} : { url: tab.url })
          }
        };
        firstHit?.();
      };
      chrome.tabs.onCreated.addListener(listener);

      let closed = false;
      const close = (): void => {
        if (closed) return;
        closed = true;
        chrome.tabs.onCreated.removeListener(listener);
      };

      return {
        settle: async ({ timeoutMs }) => {
          if (timeoutMs <= 0) {
            close();
            return undefined;
          }
          if (hit === undefined) {
            await new Promise<void>((resolve) => {
              const timer = setTimeout(resolve, Math.min(timeoutMs, OPEN_WAIT_MS));
              firstHit = () => {
                clearTimeout(timer);
                resolve();
              };
            });
            firstHit = undefined;
          }
          close();
          if (hit === undefined) return undefined;
          // 新页的标题/地址在 onCreated 那一刻通常还是空的；补一次真实值再交给 admit
          const settledTab = await chrome.tabs.get(hit.tabId).catch(() => undefined);
          const page: OpenedPageInfo = {
            ...hit.page,
            ...(settledTab?.title ? { title: settledTab.title } : {}),
            ...(settledTab?.url ? { url: settledTab.url } : {})
          };
          lastOpened = { tabId: hit.tabId, page };
          return page;
        }
      };
    }
  };

  return {
    port,
    watcher,
    focusedTabId: () => (focused === undefined ? undefined : memberOf(focused)?.tabId),
    focusedPage: () => {
      const tabId = focused === undefined ? undefined : memberOf(focused)?.tabId;
      return tabId === undefined ? undefined : pages.get(tabId);
    },
    matchesUserTab: (userTabId) => {
      const agentTabId = focused === undefined ? undefined : memberOf(focused)?.tabId;
      // 焦点没设时不算不一致：那时消息本来就发往用户的活动页
      return agentTabId === undefined || userTabId === undefined || agentTabId === userTabId;
    },
    follow: (tabId, page) => {
      focused = join(tabId, page, false);
      options.onFocus(memberOf(focused)?.shard);
      notify();
    },
    anchor: (tabId, page) => {
      // run 在跑时用户切标签页**不该**把 Agent 的焦点拽回来，
      // 那正是本册要消灭的「用户一动，模型就丢上下文」（FR-11.1）。
      // 两轮之间则相反：起点必须跟着用户走，否则焦点卡在上一轮那一页上，
      // 提示条会在每一次切页后冒出来且永不消失。
      if (touched) return;
      focused = join(tabId, page, true);
      options.onFocus(memberOf(focused)?.shard);
      notify();
    },
    noteDocument: (key) => {
      // 感知回报 = 模型开始读页了；同样关上闸门，否则它刚记下的分片下一秒就被切页抹掉
      touched = true;
      const member = focused === undefined ? undefined : memberOf(focused);
      if (member === undefined || member.shard === key) return;
      member.shard = key;
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    }
  };
}

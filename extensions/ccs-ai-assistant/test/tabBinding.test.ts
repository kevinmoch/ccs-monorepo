// @vitest-environment jsdom
/**
 * 绑定自动跟随活动标签页（FR-14.4 修订）。
 *
 * 这些判据都只能靠事件驱动验证：读源码只能证明监听器挂上了，
 * 证明不了它挑对了 tab——而挑错 tab 正是这次要修的毛病本身。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTabBinding } from '../src/shared/tabBinding';

interface Tab {
  id?: number;
  url?: string;
  title?: string;
  windowId?: number;
  lastAccessed?: number;
}

type Listener<T extends unknown[]> = (...args: T) => void;

/** 桩里的「当前窗口」；扩展页面自己所在的那一个 */
const CURRENT_WINDOW = 1;

/** 事件桩：只保留本模块用到的四个事件 + 两个查询 */
function installChrome(tabs: Map<number, Tab>) {
  const activated: Listener<[{ tabId: number; windowId: number }]>[] = [];
  const removed: Listener<[number]>[] = [];
  const updated: Listener<[number, { url?: string }, Tab]>[] = [];
  const focused: Listener<[number]>[] = [];
  /** windowId → 该窗口的活动 tab */
  const activeByWindow = new Map<number, number>();

  (globalThis as Record<string, unknown>)['chrome'] = {
    tabs: {
      get: (tabId: number) => {
        const tab = tabs.get(tabId);
        return tab === undefined ? Promise.reject(new Error(`no tab ${tabId}`)) : Promise.resolve(tab);
      },
      query: ({
        windowId,
        currentWindow,
        active
      }: {
        windowId?: number;
        currentWindow?: boolean;
        active?: boolean;
      }) => {
        const windows = windowId !== undefined ? [windowId] : currentWindow === true ? [CURRENT_WINDOW] : undefined;
        const scoped = [...tabs.values()].filter(
          (tab) => windows === undefined || windows.includes(tab.windowId ?? CURRENT_WINDOW)
        );
        return Promise.resolve(
          active === true
            ? scoped.filter((tab) => activeByWindow.get(tab.windowId ?? CURRENT_WINDOW) === tab.id)
            : scoped
        );
      },
      onActivated: { addListener: (l: (typeof activated)[number]) => activated.push(l) },
      onRemoved: { addListener: (l: (typeof removed)[number]) => removed.push(l) },
      onUpdated: { addListener: (l: (typeof updated)[number]) => updated.push(l) }
    },
    windows: {
      WINDOW_ID_NONE: -1,
      onFocusChanged: { addListener: (l: (typeof focused)[number]) => focused.push(l) }
    }
  };

  /** 事件回调里有一次 `chrome.tabs.get` 的 await，判据前要放行微任务 */
  const settle = (): Promise<void> => Promise.resolve().then(() => undefined);

  return {
    activeByWindow,
    async activate(tabId: number, windowId = CURRENT_WINDOW): Promise<void> {
      const tab = tabs.get(tabId);
      if (tab !== undefined) tab.windowId = windowId;
      activeByWindow.set(windowId, tabId);
      for (const l of activated) l({ tabId, windowId });
      await settle();
      await settle();
    },
    async focusWindow(windowId: number): Promise<void> {
      for (const l of focused) l(windowId);
      await settle();
      await settle();
    },
    async update(tabId: number, tab: Tab): Promise<void> {
      tabs.set(tabId, tab);
      for (const l of updated) l(tabId, { url: tab.url }, tab);
      await settle();
    },
    close(tabId: number): void {
      for (const l of removed) l(tabId);
    }
  };
}

describe('绑定跟随活动标签页', () => {
  let tabs: Map<number, Tab>;
  let chromeStub: ReturnType<typeof installChrome>;

  beforeEach(() => {
    tabs = new Map<number, Tab>([
      [1, { id: 1, url: 'https://a.example.com/orders', title: 'A' }],
      [2, { id: 2, url: 'https://b.example.com/report', title: 'B' }],
      [3, { id: 3, url: 'chrome-extension://abc/options.html', title: 'Console' }]
    ]);
    chromeStub = installChrome(tabs);
  });

  it('用户切到另一个标签页，绑定自动跟过去', async () => {
    const binding = createTabBinding(() => undefined);
    await chromeStub.activate(1);
    expect(binding.snapshot().url).toBe('https://a.example.com/orders');

    await chromeStub.activate(2);
    expect(binding.snapshot().url).toBe('https://b.example.com/report');
    expect(binding.tabId()).toBe(2);
  });

  it('换页即弃句柄表：换了站点必须清，否则模型能操作它已经看不见的页面', async () => {
    const onRebind = vi.fn();
    createTabBinding(onRebind);
    await chromeStub.activate(1);
    expect(onRebind).toHaveBeenCalledTimes(1);

    await chromeStub.activate(2);
    expect(onRebind).toHaveBeenCalledTimes(2);
  });

  it('扩展自己的页面不接管绑定：去控制台配个模型再切回来，绑定还在', async () => {
    const onRebind = vi.fn();
    const binding = createTabBinding(onRebind);
    await chromeStub.activate(1);
    const calls = onRebind.mock.calls.length;

    await chromeStub.activate(3);

    expect(binding.snapshot().url).toBe('https://a.example.com/orders');
    expect(binding.tabId()).toBe(1);
    // 清表也不能发生：清了表，用户回来后模型手里的句柄就全废了
    expect(onRebind).toHaveBeenCalledTimes(calls);
  });

  it('新开的标签页在 activated 那一刻还是 about:blank，地址到位后才接管', async () => {
    const binding = createTabBinding(() => undefined);
    await chromeStub.activate(1);

    tabs.set(9, { id: 9, url: 'about:blank' });
    await chromeStub.activate(9);
    // 这一刻还没有地址，绑定不该跳到一个驱动不了的页面
    expect(binding.tabId()).toBe(1);

    await chromeStub.update(9, { id: 9, url: 'https://c.example.com/detail', title: 'C' });
    expect(binding.tabId()).toBe(9);
    expect(binding.snapshot().url).toBe('https://c.example.com/detail');
  });

  it('点链接弹出新窗口：焦点换窗口也要跟过去', async () => {
    const binding = createTabBinding(() => undefined);
    await chromeStub.activate(1, 1);

    tabs.set(7, { id: 7, url: 'https://popup.example.com/view', title: 'Popup', windowId: 2 });
    chromeStub.activeByWindow.set(2, 7);
    await chromeStub.focusWindow(2);

    expect(binding.snapshot().url).toBe('https://popup.example.com/view');
  });

  it('焦点离开浏览器不改变绑定', async () => {
    const binding = createTabBinding(() => undefined);
    await chromeStub.activate(1);

    await chromeStub.focusWindow(-1);

    expect(binding.tabId()).toBe(1);
  });

  it('绑定页内同站导航只更新标题，不清句柄表', async () => {
    const onRebind = vi.fn();
    const binding = createTabBinding(onRebind);
    await chromeStub.activate(1);
    const calls = onRebind.mock.calls.length;

    await chromeStub.update(1, { id: 1, url: 'https://a.example.com/orders/42', title: 'Order 42' });

    expect(binding.snapshot().title).toBe('Order 42');
    expect(onRebind).toHaveBeenCalledTimes(calls);
  });

  it('绑定页关闭后 transport 拿不到 tabId，于是立刻失败而不是发往别人', async () => {
    const binding = createTabBinding(() => undefined);
    await chromeStub.activate(1);

    chromeStub.close(1);

    expect(binding.snapshot().lost).toBe(true);
    expect(binding.tabId()).toBeUndefined();
    expect(binding.origin()).toBeUndefined();
  });

  /**
   * console 开在一个普通标签页里，它一装配就 `bindActiveTab()`，
   * 而那一刻的活动 tab 正是它自己。回退链断在这里的话，
   * 页面技能 / MCP 端点两页就报「没有绑定页」——切一下标签页才好，可那个动作没人猜得到。
   */
  describe('从扩展自己的页面装配时的回退链', () => {
    beforeEach(() => {
      globalThis.localStorage?.removeItem('webskill.extension.last-bound-tab');
      // 窗口 1 是 console 所在窗口（桩里的“当前窗口”），真实页面在窗口 2
      tabs.get(3)!.windowId = 1;
      tabs.get(1)!.windowId = 2;
      tabs.get(2)!.windowId = 2;
      chromeStub.activeByWindow.set(1, 3);
      chromeStub.activeByWindow.set(2, 1);
    });

    it('记住的那一页还在：绑回它', async () => {
      globalThis.localStorage?.setItem('webskill.extension.last-bound-tab', '2');
      const binding = createTabBinding(() => undefined);

      await binding.bindActiveTab();

      expect(binding.tabId()).toBe(2);
    });

    it('记住的那一页已经关了：现找一个可绑定的活动页，而不是空着', async () => {
      globalThis.localStorage?.setItem('webskill.extension.last-bound-tab', '404');
      const binding = createTabBinding(() => undefined);

      await binding.bindActiveTab();

      expect(binding.tabId()).toBe(1);
      expect(binding.snapshot().url).toBe('https://a.example.com/orders');
    });

    it('压根没记过：同样现找一个，而不是等用户去切标签页', async () => {
      const binding = createTabBinding(() => undefined);

      await binding.bindActiveTab();

      expect(binding.tabId()).toBe(1);
    });

    it('只有一个窗口时活动页就是 console 自己：仍要在同窗口里现找最近看过的那一页', async () => {
      tabs.get(1)!.windowId = 1;
      tabs.get(2)!.windowId = 1;
      chromeStub.activeByWindow.delete(2);
      chromeStub.activeByWindow.set(1, 3);
      tabs.get(1)!.lastAccessed = 100;
      tabs.get(2)!.lastAccessed = 900;
      const binding = createTabBinding(() => undefined);

      await binding.bindActiveTab();

      // 只扫「各窗口的活动 tab」在这里一页都扫不到——单窗口时那一个正是 console
      expect(binding.tabId()).toBe(2);
    });

    it('绑定过一次之后，console 页面自己的 onUpdated 不能顶掉绑定', async () => {
      const binding = createTabBinding(() => undefined);
      await binding.bindActiveTab();
      expect(binding.tabId()).toBe(1);

      // console 页在自己的标签页里导航（换 hash 路由）；它不是活动业务页，不该被采纳
      await chromeStub.update(3, { id: 3, url: 'chrome-extension://abc/options.html#/mcp', title: 'Console' });

      expect(binding.tabId()).toBe(1);
    });
  });
});

/**
 * 0.16.0 分册 11 ~ 13 · 扩展侧的标签页工作集。
 *
 * 这里验的是三条**只有宿主能违反**的约束：
 * `focus()` 不许动用户的画面（SC-3）、观察窗口不许常驻（FR-13.2）、
 * run 结束只丢句柄不关页（FR-11.4）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createExtensionTabWorkset } from '../src/shared/tabWorkset';

type CreatedListener = (tab: { id?: number; title?: string; url?: string }) => void;
type RemovedListener = (tabId: number) => void;

interface Stub {
  created: Set<CreatedListener>;
  removed: Set<RemovedListener>;
  /** 被 `chrome.tabs.remove` 关掉的页；SC-3 与 FR-11.4 都要检查这一条 */
  closed: number[];
  openTab(tab: { id: number; title?: string; url?: string }): void;
  removeTab(tabId: number): void;
}

function stubChrome(): Stub {
  const created = new Set<CreatedListener>();
  const removed = new Set<RemovedListener>();
  const updated = new Set<unknown>();
  const closed: number[] = [];
  const tabs = new Map<number, { id: number; title?: string; url?: string }>();
  (globalThis as unknown as Record<string, unknown>)['chrome'] = {
    tabs: {
      get: (tabId: number) => Promise.resolve(tabs.get(tabId) ?? { id: tabId }),
      remove: (tabId: number) => {
        closed.push(tabId);
        return Promise.resolve();
      },
      onCreated: {
        addListener: (fn: CreatedListener) => void created.add(fn),
        removeListener: (fn: CreatedListener) => void created.delete(fn)
      },
      onRemoved: { addListener: (fn: RemovedListener) => void removed.add(fn) },
      onUpdated: { addListener: (fn: unknown) => void updated.add(fn) }
    }
  };
  return {
    created,
    removed,
    closed,
    openTab: (tab) => {
      tabs.set(tab.id, tab);
      for (const fn of [...created]) fn(tab);
    },
    removeTab: (tabId) => {
      tabs.delete(tabId);
      for (const fn of [...removed]) fn(tabId);
    }
  };
}

function hooks(): {
  focus: ReturnType<typeof vi.fn>;
  reset: ReturnType<typeof vi.fn>;
  drop: ReturnType<typeof vi.fn>;
  options: Parameters<typeof createExtensionTabWorkset>[0];
} {
  const focus = vi.fn();
  const reset = vi.fn();
  const drop = vi.fn();
  return { focus, reset, drop, options: { onFocus: focus, onReset: reset, onDrop: drop } };
}

afterEach(() => {
  delete (globalThis as unknown as Record<string, unknown>)['chrome'];
});

describe('扩展侧标签页工作集', () => {
  let chrome: Stub;
  beforeEach(() => {
    chrome = stubChrome();
  });

  it('T-E-1 切换焦点不碰任何会改变用户画面的 API', async () => {
    const h = hooks();
    const workset = createExtensionTabWorkset(h.options);
    workset.anchor(1, { title: 'List', url: 'https://example.com/list' });

    const list = await workset.port.list();
    expect(list).toHaveLength(1);
    await workset.port.focus(list[0]!.handle);

    // stubChrome 根本没提供 tabs.update / windows.update：调了就是 TypeError。
    // 加上下面那条源码守护，「不动用户画面」既有运行期证据也有静态证据
    expect(chrome.closed).toEqual([]);
  });

  it('T-E-2 源码里不存在任何抢焦点的调用（SC-3 静态守护）', () => {
    const source = readFileSync(resolve(import.meta.dirname, '../src/shared/tabWorkset.ts'), 'utf8')
      // 注释里必须能写出这几个 API 名字，否则这条约束没法解释清楚
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    expect(source).not.toMatch(/chrome\.tabs\.update/);
    expect(source).not.toMatch(/chrome\.windows\./);
    expect(source).not.toMatch(/active:\s*true/);
  });

  it('T-E-3 观察窗口只在窗口期内订阅，结算后立刻退订', async () => {
    const h = hooks();
    const workset = createExtensionTabWorkset(h.options);
    const window = await workset.watcher.open({});
    expect(chrome.created.size).toBe(1);

    chrome.openTab({ id: 7, title: 'Detail', url: 'https://example.com/rows/7' });
    const opened = await window.settle({ timeoutMs: 200 });

    expect(opened).toEqual({ title: 'Detail', url: 'https://example.com/rows/7' });
    // 不退订就是这个扩展任何时候都在看用户开了什么页
    expect(chrome.created.size).toBe(0);
  });

  it('T-E-4 timeoutMs <= 0 立刻关窗，且窗口之外开的页不进工作集', async () => {
    const h = hooks();
    const workset = createExtensionTabWorkset(h.options);
    workset.anchor(1, { url: 'https://example.com/list' });

    const window = await workset.watcher.open({});
    expect(await window.settle({ timeoutMs: 0 })).toBeUndefined();
    expect(chrome.created.size).toBe(0);

    chrome.openTab({ id: 9, url: 'https://elsewhere.example/ad' });
    // 没经过观察窗口的页拿不到句柄：SC-2 的闭合准入
    expect(() => workset.port.admit({})).toThrow(/could not be identified/);
    expect(await workset.port.list()).toHaveLength(1);
  });

  it('T-E-5 准入后焦点落到新页，且新页尚未感知时分片为空', async () => {
    const h = hooks();
    const workset = createExtensionTabWorkset(h.options);
    workset.anchor(1, { url: 'https://example.com/list' });
    workset.noteDocument('doc-list');
    h.focus.mockClear();

    const window = await workset.watcher.open({});
    chrome.openTab({ id: 7, title: 'Detail', url: 'https://example.com/rows/7' });
    await window.settle({ timeoutMs: 200 });
    const handle = await workset.port.admit({});

    expect(workset.focusedTabId()).toBe(7);
    // 还没感知过就还没有句柄表：留在上一页的分片上就是拿旧句柄操作新页面
    expect(h.focus).toHaveBeenLastCalledWith(undefined);
    expect((await workset.port.list()).map((t) => t.handle)).toEqual([expect.any(String), handle]);
  });

  it('T-E-6 焦点切回已感知过的页时带上它自己的分片', async () => {
    const h = hooks();
    const workset = createExtensionTabWorkset(h.options);
    workset.anchor(1, { url: 'https://example.com/list' });
    workset.noteDocument('doc-list');

    const window = await workset.watcher.open({});
    chrome.openTab({ id: 7, url: 'https://example.com/rows/7' });
    await window.settle({ timeoutMs: 200 });
    await workset.port.admit({});
    workset.noteDocument('doc-detail');

    const [list, detail] = await workset.port.list();
    await workset.port.focus(list!.handle);
    expect(h.focus).toHaveBeenLastCalledWith('doc-list');
    await workset.port.focus(detail!.handle);
    expect(h.focus).toHaveBeenLastCalledWith('doc-detail');
  });

  it('T-E-6b 三层下钻：详情页再开一层，逐层回退时各自带回自己的分片', async () => {
    const h = hooks();
    const workset = createExtensionTabWorkset(h.options);
    workset.anchor(1, { url: 'https://example.com/list' });
    workset.noteDocument('doc-list');

    // 第二层：在列表页点开一行
    const toDetail = await workset.watcher.open({});
    chrome.openTab({ id: 7, url: 'https://example.com/rows/7' });
    await toDetail.settle({ timeoutMs: 200 });
    await workset.port.admit({});
    workset.noteDocument('doc-detail');

    // 第三层：在详情页里再点开一个附件——准入不看当前在第几层
    const toAttachment = await workset.watcher.open({});
    chrome.openTab({ id: 9, url: 'https://example.com/rows/7/attachment' });
    await toAttachment.settle({ timeoutMs: 200 });
    const attachment = await workset.port.admit({});
    workset.noteDocument('doc-attachment');

    const tabs = await workset.port.list();
    expect(tabs).toHaveLength(3);
    expect(workset.focusedTabId()).toBe(9);

    await workset.port.focus(tabs[1]!.handle);
    expect(h.focus).toHaveBeenLastCalledWith('doc-detail');
    await workset.port.focus(tabs[0]!.handle);
    expect(h.focus).toHaveBeenLastCalledWith('doc-list');
    await workset.port.focus(attachment);
    expect(h.focus).toHaveBeenLastCalledWith('doc-attachment');
  });

  it('T-E-7 run 结束只丢句柄，不关闭任何标签页', async () => {
    const h = hooks();
    const workset = createExtensionTabWorkset(h.options);
    workset.anchor(1, { url: 'https://example.com/list' });
    const window = await workset.watcher.open({});
    chrome.openTab({ id: 7, url: 'https://example.com/rows/7' });
    await window.settle({ timeoutMs: 200 });
    await workset.port.admit({});

    await workset.port.reset();

    expect(h.reset).toHaveBeenCalledTimes(1);
    expect(await workset.port.list()).toEqual([]);
    expect(workset.focusedTabId()).toBeUndefined();
    // 模型开出来的页归用户处置
    expect(chrome.closed).toEqual([]);
  });

  it('T-E-8 关闭工具真的关页，并只丢那一页的分片', async () => {
    const h = hooks();
    const workset = createExtensionTabWorkset(h.options);
    workset.anchor(1, { url: 'https://example.com/list' });
    workset.noteDocument('doc-list');
    const window = await workset.watcher.open({});
    chrome.openTab({ id: 7, url: 'https://example.com/rows/7' });
    await window.settle({ timeoutMs: 200 });
    const detail = await workset.port.admit({});
    workset.noteDocument('doc-detail');

    await workset.port.close(detail);

    expect(chrome.closed).toEqual([7]);
    expect(h.drop).toHaveBeenCalledWith('doc-detail');
    expect(h.drop).not.toHaveBeenCalledWith('doc-list');
    // 焦点不自动跳到别处：让下一次操作明确报「这一页没了」
    expect(workset.focusedTabId()).toBeUndefined();
  });

  it('T-E-9 用户自己关掉的页同样离开工作集并丢分片', async () => {
    const h = hooks();
    const workset = createExtensionTabWorkset(h.options);
    workset.anchor(1, { url: 'https://example.com/list' });
    const window = await workset.watcher.open({});
    chrome.openTab({ id: 7, url: 'https://example.com/rows/7' });
    await window.settle({ timeoutMs: 200 });
    await workset.port.admit({});
    workset.noteDocument('doc-detail');

    chrome.removeTab(7);

    expect(await workset.port.list()).toHaveLength(1);
    expect(h.drop).toHaveBeenCalledWith('doc-detail');
    expect(workset.focusedTabId()).toBeUndefined();
  });

  it('T-E-10 run 在跑时用户切标签页不改变模型的焦点', async () => {
    const h = hooks();
    const workset = createExtensionTabWorkset(h.options);
    workset.anchor(1, { url: 'https://example.com/list' });
    const window = await workset.watcher.open({});
    chrome.openTab({ id: 7, url: 'https://example.com/rows/7' });
    await window.settle({ timeoutMs: 200 });
    await workset.port.admit({});

    // 用户切回列表页：绑定层会再喊一次 anchor
    workset.anchor(1, { url: 'https://example.com/list' });

    expect(workset.focusedTabId()).toBe(7);
    expect(workset.matchesUserTab(1)).toBe(false);
  });

  it('T-E-11 焦点未设定时不算不一致，提示条因此不出现', () => {
    const h = hooks();
    const workset = createExtensionTabWorkset(h.options);
    expect(workset.matchesUserTab(1)).toBe(true);

    workset.anchor(1, { url: 'https://example.com/list' });
    expect(workset.matchesUserTab(1)).toBe(true);
  });

  it('T-E-11b run 之间锚点跟着用户走，连切几次页都不冒提示条', () => {
    const h = hooks();
    const workset = createExtensionTabWorkset(h.options);
    workset.anchor(1, { url: 'https://example.com/list' });
    workset.noteDocument('doc-list');
    // 一轮读完：句柄丢掉，闸门也一并打开
    workset.port.reset();

    workset.anchor(2, { url: 'https://example.com/mail' });
    expect(workset.focusedTabId()).toBe(2);
    expect(workset.matchesUserTab(2)).toBe(true);

    workset.anchor(3, { url: 'https://example.com/bank' });
    expect(workset.focusedTabId()).toBe(3);
    expect(workset.matchesUserTab(3)).toBe(true);
    // 起点始终只有一项：跟着走不等于把用户逛过的页都攒起来
    expect(workset.port.list()).toHaveLength(1);
  });

  it('T-E-12 用户点「跟随」把焦点搬到自己这一页', async () => {
    const h = hooks();
    const workset = createExtensionTabWorkset(h.options);
    workset.anchor(1, { url: 'https://example.com/list' });
    const window = await workset.watcher.open({});
    chrome.openTab({ id: 7, url: 'https://example.com/rows/7' });
    await window.settle({ timeoutMs: 200 });
    await workset.port.admit({});
    expect(workset.matchesUserTab(1)).toBe(false);

    workset.follow(1, { url: 'https://example.com/list' });

    expect(workset.matchesUserTab(1)).toBe(true);
    expect(workset.focusedTabId()).toBe(1);
    // 跟随不新建成员：那一页本来就在工作集里
    expect(await workset.port.list()).toHaveLength(2);
  });

  it('T-E-13 句柄是不透明串，模型猜不出下一页', async () => {
    // 「猜不出」的可证伪形式：句柄不是标签页 id 的函数。
    // 同一组 id 在两个工作集里必须得到互不相同的句柄——若实现改成
    // `tab-${tabId}` 或任何编码，两轮就会重合。
    async function handlesFor(): Promise<string[]> {
      const workset = createExtensionTabWorkset(hooks().options);
      workset.anchor(11, { url: 'https://example.com/list' });
      const window = await workset.watcher.open({});
      chrome.openTab({ id: 12, url: 'https://example.com/rows/12' });
      await window.settle({ timeoutMs: 200 });
      await workset.port.admit({});
      return (await workset.port.list()).map((tab) => tab.handle);
    }

    const first = await handlesFor();
    const second = await handlesFor();

    expect(first).toHaveLength(2);
    for (const handle of [...first, ...second]) {
      expect(handle).toMatch(/^tab-[0-9a-f]{16}$/);
    }
    // 工作集内部不重复，跨工作集也不重复
    expect(new Set([...first, ...second]).size).toBe(4);
  });
});

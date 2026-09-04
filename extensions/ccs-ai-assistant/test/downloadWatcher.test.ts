/**
 * 0.15.0 分册 15 · §8：扩展侧的下载观察端口。
 *
 * 这里验的是「不常驻」和「不多读」这两条：
 * 窗口关掉之后再发生的下载必须**没有任何监听在听**（AC-15.13），
 * 而窗口期内发生的下载只贡献一个计数，文件名/大小/类型一个都不许经手（AC-15.2）。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createExtensionDownloadWatcher } from '../src/shared/downloadWatcher';

type Listener = (delta: { id: number; state?: { current?: string } }) => void;

interface Stub {
  listeners: Set<Listener>;
  /** 模拟一次下载状态变更；窗口关掉后调它就等于「窗口之外发生的下载」 */
  emit(delta: { id: number; state?: { current?: string } }): void;
}

function stubChrome(): Stub {
  const listeners = new Set<Listener>();
  (globalThis as unknown as Record<string, unknown>)['chrome'] = {
    downloads: {
      onChanged: {
        addListener: (fn: Listener) => void listeners.add(fn),
        removeListener: (fn: Listener) => void listeners.delete(fn)
      }
    }
  };
  return {
    listeners,
    emit: (delta) => {
      for (const fn of [...listeners]) fn(delta);
    }
  };
}

afterEach(() => {
  delete (globalThis as unknown as Record<string, unknown>)['chrome'];
});

describe('扩展侧下载观察端口', () => {
  it('只数窗口期内完成的下载，且结算后立刻退订', async () => {
    const chrome = stubChrome();
    const window = await createExtensionDownloadWatcher().open({ runId: 'run-1' });

    expect(chrome.listeners.size).toBe(1);
    chrome.emit({ id: 1, state: { current: 'complete' } });
    chrome.emit({ id: 2, state: { current: 'complete' } });

    expect(await window.settle({ timeoutMs: 50 })).toBe(2);
    // 不退订就是「这个扩展任何时候都在看用户的下载记录」
    expect(chrome.listeners.size).toBe(0);
  });

  it('窗口之外发生的下载既没人听也不计数', async () => {
    const chrome = stubChrome();
    const window = await createExtensionDownloadWatcher().open({});
    expect(await window.settle({ timeoutMs: 10 })).toBe(0);

    chrome.emit({ id: 9, state: { current: 'complete' } });
    expect(chrome.listeners.size).toBe(0);
  });

  it('只认 complete：进行中与被中断的状态不计数', async () => {
    const chrome = stubChrome();
    const window = await createExtensionDownloadWatcher().open({});

    chrome.emit({ id: 1, state: { current: 'in_progress' } });
    chrome.emit({ id: 2, state: { current: 'interrupted' } });
    // 只改了文件名而没有状态转换的通知同样不计数
    chrome.emit({ id: 3 });

    expect(await window.settle({ timeoutMs: 10 })).toBe(0);
  });

  it('同一次下载的多条 complete 通知只算一次', async () => {
    const chrome = stubChrome();
    const window = await createExtensionDownloadWatcher().open({});

    chrome.emit({ id: 5, state: { current: 'complete' } });
    chrome.emit({ id: 5, state: { current: 'complete' } });

    expect(await window.settle({ timeoutMs: 10 })).toBe(1);
  });

  it('预算为 0 时立刻关窗并丢弃计数（执行抛错的那条路）', async () => {
    const chrome = stubChrome();
    const window = await createExtensionDownloadWatcher().open({});
    chrome.emit({ id: 1, state: { current: 'complete' } });

    expect(await window.settle({ timeoutMs: 0 })).toBe(0);
    expect(chrome.listeners.size).toBe(0);
  });

  it('第一次完成就提前结束等待，不必耗满预算', async () => {
    const chrome = stubChrome();
    const window = await createExtensionDownloadWatcher().open({});
    const started = Date.now();
    const settled = window.settle({ timeoutMs: 5_000 });

    setTimeout(() => chrome.emit({ id: 1, state: { current: 'complete' } }), 10);

    expect(await settled).toBe(1);
    expect(Date.now() - started).toBeLessThan(2_000);
  });
});

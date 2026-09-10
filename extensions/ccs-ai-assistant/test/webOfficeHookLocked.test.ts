// @vitest-environment jsdom
/**
 * 页面把 `WebOfficeSDK` 定义成**不可配置**的那一种（0.21.0 分册 14 FR-14.3 / AC-11.4）。
 *
 * 单独一个文件的原因很具体：一旦在 jsdom 的 `window` 上定义了不可配置属性，
 * 这一整个文件的后续用例都撤不回来。与其在同一份文件里靠执行顺序小心翼翼，
 * 不如让它自己占一个 worker——这也正是它要验的那件事的性质：不可逆。
 */
import { describe, expect, it } from 'vitest';

describe('页面先把全局锁死（AC-11.4）', () => {
  it('装不上就安静退场：不抛错，也不再监听消息', async () => {
    const locked = { OfficeType: { Writer: 'w' } };
    Object.defineProperty(window, 'WebOfficeSDK', { configurable: false, value: locked });
    let listeners = 0;
    const native = window.addEventListener.bind(window);
    window.addEventListener = ((type: string, handler: EventListener, options?: unknown) => {
      if (type === 'message') listeners += 1;
      native(type, handler, options as AddEventListenerOptions);
    }) as typeof window.addEventListener;

    const { installWebOfficeHook } = await import('../src/content/mainWorld/webOfficeHook');
    expect(() => installWebOfficeHook()).not.toThrow();

    window.addEventListener = native as typeof window.addEventListener;
    expect(window.WebOfficeSDK).toBe(locked);
    // 页面锁死的属性我们改不动，也不试图改；顺带守住「任何情况下都不挂窗口消息监听器」（DV-17）
    expect(listeners).toBe(0);
  });
});

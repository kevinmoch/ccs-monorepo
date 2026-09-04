// @vitest-environment jsdom
/**
 * 0.14.0 分册 15 FR-15.8：click 监听器探针。
 *
 * 探针是**改页面原型**的东西，用例的重点是「它确实记下了行为事实」和
 * 「它撤得干净、撤得安全」，而不是「函数被调用过」。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PROBE_CHANNEL, PROBE_MARK, keepProbeArmed, probeInteractiveHint } from '../src/shared/probe';

const native = EventTarget.prototype.addEventListener;

/** 每个用例重新装一次探针：模块级副作用只在首次 import 时跑一遍 */
async function installProbe(): Promise<void> {
  vi.resetModules();
  await import('../src/content/probe');
}

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '';
  EventTarget.prototype.addEventListener = native;
});

afterEach(() => {
  EventTarget.prototype.addEventListener = native;
  vi.useRealTimers();
});

describe('click 监听器探针', () => {
  it('挂过 click 监听的元素被标记，没挂过的不被标记', async () => {
    await installProbe();
    document.body.innerHTML = '<div id="a"></div><div id="b"></div>';
    const marked = document.getElementById('a') as Element;
    const plain = document.getElementById('b') as Element;

    marked.addEventListener('click', () => undefined);

    expect(probeInteractiveHint(marked)).toBe(true);
    expect(probeInteractiveHint(plain)).toBe(false);
  });

  it.each(['mousedown', 'mouseup', 'pointerdown', 'pointerup'])('%s 也算可点信号', async (type) => {
    await installProbe();
    document.body.innerHTML = '<div id="a"></div>';
    const element = document.getElementById('a') as Element;

    element.addEventListener(type, () => undefined);

    expect(element.hasAttribute(PROBE_MARK)).toBe(true);
  });

  it('非 click 类的监听器不留痕', async () => {
    await installProbe();
    document.body.innerHTML = '<div id="a"></div>';
    const element = document.getElementById('a') as Element;

    element.addEventListener('scroll', () => undefined);
    element.addEventListener('focus', () => undefined);

    expect(probeInteractiveHint(element)).toBe(false);
  });

  it('监听器仍然被真正注册：探针只记录，不拦截', async () => {
    await installProbe();
    document.body.innerHTML = '<div id="a"></div>';
    const element = document.getElementById('a') as HTMLElement;
    const handler = vi.fn();

    element.addEventListener('click', handler);
    element.dispatchEvent(new Event('click'));

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('AC-15.12：本帧长时间没被使用后，原型还原为原生实现', async () => {
    await installProbe();
    expect(EventTarget.prototype.addEventListener).not.toBe(native);

    await vi.advanceTimersByTimeAsync(30_000);

    expect(EventTarget.prototype.addEventListener).toBe(native);
  });

  it('续期信号让探针留任：使用中的帧不会被卸下', async () => {
    await installProbe();
    const wrapped = EventTarget.prototype.addEventListener;

    await vi.advanceTimersByTimeAsync(20_000);
    window.dispatchEvent(
      new MessageEvent('message', { data: { channel: PROBE_CHANNEL, kind: 'keep' }, source: window })
    );
    await vi.advanceTimersByTimeAsync(20_000);

    expect(EventTarget.prototype.addEventListener).toBe(wrapped);
  });

  it('keepProbeArmed 发出的正是探针认得的续期负载', () => {
    const post = vi.spyOn(window, 'postMessage');

    keepProbeArmed();

    expect(post).toHaveBeenCalledWith({ channel: PROBE_CHANNEL, kind: 'keep' }, '*');
    post.mockRestore();
  });

  it('AC-15.13：页面在探针之上又包了一层时不还原，不抹掉页面自己的包装', async () => {
    await installProbe();
    const probeWrapper = EventTarget.prototype.addEventListener;
    const pageWrapper = function (this: EventTarget, ...args: Parameters<typeof native>): void {
      probeWrapper.apply(this, args);
    };
    EventTarget.prototype.addEventListener = pageWrapper;

    await vi.advanceTimersByTimeAsync(30_000);

    expect(EventTarget.prototype.addEventListener).toBe(pageWrapper);
  });

  it('disarm 信号只认本窗口发来的：跨窗口的同名消息不生效', async () => {
    await installProbe();
    const wrapped = EventTarget.prototype.addEventListener;

    // 内嵌 iframe 里的第三方脚本冒充内容脚本发 disarm；source 不是本窗口，探针必须无视
    window.dispatchEvent(
      new MessageEvent('message', { data: { channel: PROBE_CHANNEL, kind: 'disarm' }, source: null })
    );
    await vi.advanceTimersByTimeAsync(0);

    expect(EventTarget.prototype.addEventListener).toBe(wrapped);
  });

  it('本窗口发来的 disarm 立即卸下探针', async () => {
    await installProbe();

    window.dispatchEvent(
      new MessageEvent('message', { data: { channel: PROBE_CHANNEL, kind: 'disarm' }, source: window })
    );

    expect(EventTarget.prototype.addEventListener).toBe(native);
  });
});

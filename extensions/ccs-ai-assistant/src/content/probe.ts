/**
 * click 监听器探针（0.14.0 分册 15 FR-15.8）。
 *
 * 跑在**页面自己的 JS 世界**（`world: "MAIN"`）且 `document_start` 注入——两个条件缺一不可：
 * 内容脚本默认的 isolated world 看不到页面的 `EventTarget.prototype`，
 * 而 `document_idle` 时页面脚本早已把监听器挂完了，包装上去也是空的。
 *
 * 「这个元素挂过 click 监听器」是可交互性最强的信号——它就是可交互的**定义本身**，
 * 不是从 class 名或光标形状反推出来的猜测。
 *
 * ## 为什么打 DOM 属性而不是维护一个 WeakSet
 *
 * MAIN 与 ISOLATED 两个世界不共享 JS 对象，Element 引用传不过去，
 * 而感知遍历是**同步**的，没有等异步 postMessage 往返的余地。
 * 属性是两个世界唯一共享的载体。代价是页面能看见这个属性、
 * 页面自己的 MutationObserver 可能被惊动——记在这里，不假装没有。
 */

import { installPageHostAnchor } from './pageHostAnchor';

/** 与 shared/probe.ts 共用；那边是感知侧的读取方，改名要同时改两处 */
const MARK = 'data-webskill-clickable';
/** 挂上这些类型即视为「可点」；`click` 之外的几种覆盖自己实现拖拽/长按的控件 */
const CLICK_EVENTS = new Set(['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup']);

/** 本帧多久没被 page agent 用过就卸下探针（FR-15.8 第 4 条） */
const DISARM_AFTER_MS = 30_000;

const CHANNEL = 'webskill:probe';

type ProbeSignal = { channel: typeof CHANNEL; kind: 'keep' | 'disarm' };

const isProbeSignal = (value: unknown): value is ProbeSignal =>
  typeof value === 'object' &&
  value !== null &&
  (value as { channel?: unknown }).channel === CHANNEL &&
  ((value as { kind?: unknown }).kind === 'keep' || (value as { kind?: unknown }).kind === 'disarm');

const nativeAddEventListener = EventTarget.prototype.addEventListener;

/**
 * Chrome 已弃用 `unload`：页面注册它会打一条 violation 报告，而调用栈会指到本包装函数上，
 * 让扩展看起来是违规方。禁用时直接不透传，页面注册不上——本就注册不上。
 */
function unloadDisallowed(): boolean {
  try {
    const policy = (document as { permissionsPolicy?: { features(): string[]; allowsFeature(f: string): boolean } })
      .permissionsPolicy;
    if (policy === undefined) return false;
    return policy.features().includes('unload') && !policy.allowsFeature('unload');
  } catch {
    return false;
  }
}

function probeAddEventListener(
  this: EventTarget,
  type: string,
  listener: EventListenerOrEventListenerObject | null,
  options?: boolean | AddEventListenerOptions
): void {
  if (type === 'unload' && unloadDisallowed()) return;
  if (CLICK_EVENTS.has(type) && this instanceof Element) {
    try {
      this.setAttribute(MARK, '');
    } catch {
      // 只读节点或已冻结的自定义元素；标不上就退回其余四级信号
    }
  }
  nativeAddEventListener.call(this, type, listener, options);
}

EventTarget.prototype.addEventListener = probeAddEventListener;

function disarm(): void {
  // 只在原型仍是自己那份时还原：页面若在上面又包了一层，动它会把人家的包装一并抹掉
  if (EventTarget.prototype.addEventListener === probeAddEventListener) {
    EventTarget.prototype.addEventListener = nativeAddEventListener;
  }
}

let timer = setTimeout(disarm, DISARM_AFTER_MS);

window.addEventListener('message', (event: MessageEvent) => {
  // 只认本窗口发来的信号：跨窗口的同名消息可能是页面在冒充内容脚本
  if (event.source !== window || !isProbeSignal(event.data)) return;
  if (event.data.kind === 'disarm') {
    clearTimeout(timer);
    disarm();
    return;
  }
  clearTimeout(timer);
  timer = setTimeout(disarm, DISARM_AFTER_MS);
});

// 同一份 `document_start` MAIN world 脚本里搭车（分册 18 FR-18.3）：
// 锚点要抢在页面脚本之前落位，而这份脚本已经在那个时刻了，再加一个内容脚本没有意义
installPageHostAnchor();

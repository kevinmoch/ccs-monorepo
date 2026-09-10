/**
 * MAIN ↔ ISOLATED 的载体（DV-17）。
 *
 * 两个世界共享同一棵 DOM，却各有各的 JS 堆，所以本来最顺手的载体是 `window.postMessage`。
 * 不能用：实测（2026-09-08，真实 WPS 页面）往承载 WPS SDK 的窗口投**任何**一条 message，
 * 哪怕内容是 `{hello:1}`，SDK 之后的每一次取值都永不返回——它的应答分发器把收到的消息
 * 一律当成一次答复来推进队列，多出一条就整体错位，且**不抛错、不打日志**。
 * 我们的桥请求就是那一条，这是「授权框弹出、内容读不到、只能截图兜底」的全部原因。
 *
 * 第三方页面里还有多少个这样的库无从得知，因此这不是 WebOffice 一处的补丁，
 * 而是本扩展在页面里的**通用约束**：同窗口的跨世界通信一律走 `document` 上的 `CustomEvent`。
 *
 * `detail` 一律是 JSON 字符串：跨世界传对象会撞上结构化克隆的边界，字符串没有这个问题。
 * 代价是不能传函数与 `undefined` 字段，而桥本来就只传可序列化的数据。
 */

/** 发一条桥事件。序列化失败就不发——静默发出半个信封比不发更难排查 */
export function dispatchBridgeEvent(type: string, payload: unknown): boolean {
  let detail: string;
  try {
    detail = JSON.stringify(payload);
  } catch {
    return false;
  }
  document.dispatchEvent(new CustomEvent(type, { detail }));
  return true;
}

/** 读一条桥事件的载荷。形状校验交给各桥自己的 `is*`，这里只负责解开信封 */
export function readBridgeEvent(event: Event): unknown {
  const detail: unknown = (event as CustomEvent<unknown>).detail;
  if (typeof detail !== 'string') return undefined;
  try {
    return JSON.parse(detail);
  } catch {
    return undefined;
  }
}

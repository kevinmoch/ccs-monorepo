/**
 * ISOLATED 侧的握手中继（分册 18 FR-18.3）。
 *
 * 纯转发，不做判断：`chrome.runtime` 的请求换成 `window.postMessage`，等 id 对上的应答回去。
 *
 * 来源校验（FR-18.7 第 4 条）**不在这里做**。本脚本跑在页面自己的 renderer 里，
 * 被 XSS 的页面能改它的行为——让它自证来源没有意义，那道闸门在 side panel 侧。
 */
import { PAGE_MCP_BRIDGE_CHANNEL, isPageMcpBridgeResponse } from '../shared/pageMcpBridge';
import { PAGE_MCP_CHANNEL, type PageMcpRequest, type PageMcpResult } from '../shared/messages';

/** MAIN 侧无应答时不能把 sendResponse 悬着：通道不关，调用方就一直等 */
const BRIDGE_TIMEOUT_MS = 15_000;

let nextId = 1;

export function relayPageMcp(request: PageMcpRequest): Promise<PageMcpResult> {
  const id = nextId++;
  return new Promise((resolve) => {
    const settle = (result: PageMcpResult): void => {
      clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      resolve(result);
    };
    const timer = setTimeout(
      () =>
        settle({
          channel: PAGE_MCP_CHANNEL,
          ok: false,
          reason: 'The page did not answer the handshake in time.'
        }),
      BRIDGE_TIMEOUT_MS
    );
    const onMessage = (event: MessageEvent): void => {
      // 只认本窗口、且 id 对得上的应答；页面乱发消息最多让我们多等一会儿
      if (event.source !== window || !isPageMcpBridgeResponse(event.data) || event.data.id !== id) return;
      settle(
        event.data.ok
          ? { channel: PAGE_MCP_CHANNEL, ok: true, value: event.data.value }
          : { channel: PAGE_MCP_CHANNEL, ok: false, reason: event.data.reason }
      );
    };
    window.addEventListener('message', onMessage);
    window.postMessage(
      {
        channel: PAGE_MCP_BRIDGE_CHANNEL,
        id,
        kind: request.kind,
        ...(request.endpoint === undefined ? {} : { endpoint: request.endpoint }),
        ...(request.method === undefined ? {} : { method: request.method }),
        params: request.params
      },
      '*'
    );
  });
}

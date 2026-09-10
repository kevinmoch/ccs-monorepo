/**
 * ISOLATED 侧的 WebOffice 中继（0.21.0 分册 11 FR-11.3a）。
 *
 * 转发之外只多做一件事，但那件事是整册的安全支点：**handle 在这一侧生成**。
 * MAIN 侧只知道自己发的 `localId`，页面伪造 localId 最多指到它自己的另一个实例；
 * 而授权、审计、记忆全都按 handle 记账，页面碰不到那个命名空间。
 *
 * 来源校验不在这里做（与 `pageMcpRelay.ts` 同理）：本脚本跑在页面的 renderer 里，
 * 被 XSS 的页面能改它的行为——让它自证来源没有意义，那道闸门在 side panel 侧。
 */
import { dispatchBridgeEvent, readBridgeEvent } from '../shared/domBridge';
import { frameIndexInTop } from '../shared/frameIndex';
import {
  WEB_OFFICE_BRIDGE_CHANNEL,
  WEB_OFFICE_BRIDGE_REQUEST_EVENT,
  WEB_OFFICE_BRIDGE_RESPONSE_EVENT,
  isWebOfficeBridgeResponse,
  type WebOfficeBridgePayload,
  type WebOfficeInstanceSummary
} from '../shared/webOfficeBridge';
import { WEB_OFFICE_CHANNEL, type WebOfficeRequest, type WebOfficeResult } from '../shared/messages';

/** MAIN 侧没有应答就不能把 sendResponse 悬着：通道不关，面板就一直等 */
const BRIDGE_TIMEOUT_MS = 15_000;

let nextId = 1;

/** handle ↔ localId。页面看不到这张表，它是 handle 不可伪造的全部理由 */
const handles = new Map<string, string>();
const localIds = new Map<string, string>();

function newHandle(): string {
  const random =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `wo-${random}`;
}

function handleFor(localId: string): string {
  const existing = handles.get(localId);
  if (existing !== undefined) return existing;
  const handle = newHandle();
  handles.set(localId, handle);
  localIds.set(handle, localId);
  return handle;
}

function ask(request: WebOfficeBridgePayload): Promise<WebOfficeResult> {
  const id = nextId++;
  return new Promise((resolve) => {
    const settle = (result: WebOfficeResult): void => {
      clearTimeout(timer);
      document.removeEventListener(WEB_OFFICE_BRIDGE_RESPONSE_EVENT, onResponse);
      resolve(result);
    };
    const timer = setTimeout(
      () => settle({ channel: WEB_OFFICE_CHANNEL, ok: false, reason: 'timeout' }),
      BRIDGE_TIMEOUT_MS
    );
    const onResponse = (event: Event): void => {
      // 只认 id 对得上的应答；页面乱发事件最多让我们多等一会儿
      const payload = readBridgeEvent(event);
      if (!isWebOfficeBridgeResponse(payload) || payload.id !== id) return;
      settle(
        payload.ok
          ? { channel: WEB_OFFICE_CHANNEL, ok: true, value: payload.value }
          : { channel: WEB_OFFICE_CHANNEL, ok: false, reason: payload.reason }
      );
    };
    document.addEventListener(WEB_OFFICE_BRIDGE_RESPONSE_EVENT, onResponse);
    dispatchBridgeEvent(WEB_OFFICE_BRIDGE_REQUEST_EVENT, { channel: WEB_OFFICE_BRIDGE_CHANNEL, id, ...request });
  });
}

export async function relayWebOffice(request: WebOfficeRequest): Promise<WebOfficeResult> {
  if (request.kind === 'list') {
    const result = await ask({ kind: 'enumerate' });
    if (!result.ok) return result;
    const summaries = Array.isArray(result.value) ? (result.value as WebOfficeInstanceSummary[]) : [];
    return {
      channel: WEB_OFFICE_CHANNEL,
      ok: true,
      value: summaries.map((summary) => ({
        handle: handleFor(summary.localId),
        // 下面两项是**页面说的**，名字里带 claimed 就是为了让面板那侧无法不小心当成事实
        claimedOfficeType: summary.officeType,
        ...(summary.fileId === undefined ? {} : { claimedFileId: summary.fileId }),
        ...(summary.viaMount === true ? { claimedViaMount: true } : {}),
        ready: summary.state === 'ready'
      }))
    };
  }
  // 取件不带 handle，而是带目标帧在顶层帧 `window.frames` 里的序号（DV-18）。
  // 宏与 frameId 不同源，所以宿主逐帧问，本帧自己比对：不是自己就直说不是，
  // 不去碰 MAIN 世界——否则一页两份文档时会把另一份的字节计到这份头上
  if (request.kind === 'take-frame-pdf') {
    if (frameIndexInTop() !== request.frameIndex) {
      return { channel: WEB_OFFICE_CHANNEL, ok: false, reason: 'wrong-frame' };
    }
    return ask({ kind: 'take-frame-pdf' });
  }
  // 直链问的是「这一帧知不知道」，不是「这份文档的字节在哪」：
  // 实测里链接在宿主帧、实例在 office 帧，拿 handle 定位只会问错帧
  if (request.kind === 'take-linked-pdf') return ask({ kind: 'take-linked-pdf' });
  if (request.kind === 'take-linked-presentation') return ask({ kind: 'take-linked-presentation' });
  const localId = request.handle === undefined ? undefined : localIds.get(request.handle);
  if (localId === undefined) return { channel: WEB_OFFICE_CHANNEL, ok: false, reason: 'no-instance' };
  if (request.kind === 'describe') return ask({ kind: 'describe', localId });
  if (request.kind === 'scroll') return ask({ kind: 'scroll', localId });
  if (request.kind === 'take-pdf') return ask({ kind: 'take-pdf', localId });
  return ask({ kind: 'call', localId, method: request.method ?? '', args: request.args ?? [] });
}

// @vitest-environment jsdom
/**
 * ISOLATED 中继里与「按帧序号取 PDF」有关的那一段（DV-18）。
 *
 * 归属判定放在这一侧而不是 MAIN 侧：MAIN 侧的代码住在页面自己的世界里，
 * 页面能覆盖它；而序号一旦认错，模型看到的就是**另一份文档**的内容。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dispatchBridgeEvent, readBridgeEvent } from '../src/shared/domBridge';
import {
  WEB_OFFICE_BRIDGE_CHANNEL,
  WEB_OFFICE_BRIDGE_REQUEST_EVENT,
  WEB_OFFICE_BRIDGE_RESPONSE_EVENT
} from '../src/shared/webOfficeBridge';
import { WEB_OFFICE_CHANNEL, type WebOfficeRequest } from '../src/shared/messages';
import { relayWebOffice } from '../src/content/webOfficeRelay';

/** 收到的桥请求；同时充当「MAIN 侧」的应答者 */
let seen: Array<Record<string, unknown>>;
let answer: unknown;

function onRequest(event: Event): void {
  const payload = readBridgeEvent(event) as Record<string, unknown> | undefined;
  if (payload === undefined) return;
  seen.push(payload);
  dispatchBridgeEvent(WEB_OFFICE_BRIDGE_RESPONSE_EVENT, {
    channel: WEB_OFFICE_BRIDGE_CHANNEL,
    id: payload['id'],
    ok: true,
    value: answer
  });
}

/** 把这一帧伪装成顶层帧的第 `index` 个子帧 */
function pretendFrame(index: number): void {
  const top: Record<string | number, unknown> = { length: index + 1 };
  top[index] = window;
  Object.defineProperty(window, 'top', { configurable: true, value: top });
  Object.defineProperty(window, 'parent', { configurable: true, value: top });
}

function request(frameIndex: number): WebOfficeRequest {
  return { channel: WEB_OFFICE_CHANNEL, kind: 'take-frame-pdf', frameIndex };
}

beforeEach(() => {
  seen = [];
  answer = [0x25, 0x50, 0x44, 0x46];
  document.addEventListener(WEB_OFFICE_BRIDGE_REQUEST_EVENT, onRequest);
});

afterEach(() => {
  document.removeEventListener(WEB_OFFICE_BRIDGE_REQUEST_EVENT, onRequest);
  Reflect.deleteProperty(window, 'top');
  Reflect.deleteProperty(window, 'parent');
  vi.useRealTimers();
});

describe('按帧序号取 PDF 字节（DV-18）', () => {
  it('序号对得上时把字节交出去', async () => {
    pretendFrame(2);

    const result = await relayWebOffice(request(2));

    expect(result).toEqual({ channel: WEB_OFFICE_CHANNEL, ok: true, value: [0x25, 0x50, 0x44, 0x46] });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ kind: 'take-frame-pdf' });
  });

  it('序号对不上就直说不是自己，且**根本不问**页面', async () => {
    pretendFrame(1);

    const result = await relayWebOffice(request(2));

    expect(result).toEqual({ channel: WEB_OFFICE_CHANNEL, ok: false, reason: 'wrong-frame' });
    // 关键在这一条：不是自己还去问，一页两份文档时就会把另一份的字节交上去
    expect(seen).toEqual([]);
  });

  it('顶层帧永远不是取件目标：它没有序号', async () => {
    const result = await relayWebOffice(request(0));

    expect(result).toMatchObject({ ok: false, reason: 'wrong-frame' });
    expect(seen).toEqual([]);
  });

  it('取件不需要 handle：这条请求上没有可伪造的授权标识', async () => {
    pretendFrame(0);

    const result = await relayWebOffice(request(0));

    expect(result).toMatchObject({ ok: true });
    expect(seen[0]).not.toHaveProperty('localId');
  });
});

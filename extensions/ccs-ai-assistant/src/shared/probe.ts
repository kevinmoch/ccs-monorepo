/**
 * 探针的感知侧读取方（分册 15 FR-15.8 第 2 步）。
 *
 * MAIN world 的探针把「挂过 click 监听器」写成 DOM 属性，这里把它读回来喂给 SDK 的
 * `interactiveHint`。两侧共用 `PROBE_MARK` 与 `PROBE_CHANNEL`，改名必须同时改。
 */

import { dispatchBridgeEvent } from './domBridge';

export const PROBE_MARK = 'data-webskill-clickable';

export const PROBE_CHANNEL = 'webskill:probe';

/** 续期/卸载信号的事件名；不用 `window.postMessage`（DV-17，理由见 `domBridge.ts`） */
export const PROBE_SIGNAL_EVENT = `${PROBE_CHANNEL}:signal`;

/** FR-15.1 的信号 0：行为事实，不是从 class 名反推的猜测 */
export const probeInteractiveHint = (element: Element): boolean => element.hasAttribute(PROBE_MARK);

/** 本帧仍在被 page agent 使用，续期探针；不续期它会自行卸下（FR-15.8 第 4 条） */
export function keepProbeArmed(): void {
  dispatchBridgeEvent(PROBE_SIGNAL_EVENT, { channel: PROBE_CHANNEL, kind: 'keep' });
}

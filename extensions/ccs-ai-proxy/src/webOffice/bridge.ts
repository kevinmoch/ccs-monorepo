/**
 * MAIN ↔ ISOLATED 的 WebOffice 桥信封（0.21.0 分册 12）。
 *
 * **不依赖任何 SDK 类型**：MAIN 侧那一端由 `content/web-office.js` 承载，
 * 它是 `document_start` 注入到每一帧的脚本，把 `@webskill/browser` 的类型图
 * 拖进去，等于让每次导航都多下载一份用不上的代码。
 *
 * 代价是这里有两份「同一个事实」的副本——只读方法名与 `OfficeType` 指纹。
 * 本文件整体搬自 `ccs-ai-assistant/src/shared/webOfficeBridge.ts`，那边由
 * web-skill-sdk 仓的 `test/webOfficeMirrors.test.ts` 与 SDK 声明逐条比对；
 * **本仓没有那道守护**，改动 SDK 的白名单或枚举时要手动把三处对齐。
 */

export const WEB_OFFICE_BRIDGE_CHANNEL = 'webskill:web-office-bridge';

/**
 * 桥必须走 DOM 事件，**不能**用 `window.postMessage`（DV-17，理由见 `domBridge.ts`）。
 */
export const WEB_OFFICE_BRIDGE_REQUEST_EVENT = `${WEB_OFFICE_BRIDGE_CHANNEL}:request`;
export const WEB_OFFICE_BRIDGE_RESPONSE_EVENT = `${WEB_OFFICE_BRIDGE_CHANNEL}:response`;

/**
 * SDK v2.0.5 的 `OfficeType`（`packages/browser/src/weboffice/types.ts` 的镜像）。
 *
 * 版本护栏用它做结构指纹。`Dbt`/`KSheet` 的长值是实测的，别照包内那套单字母枚举改回去。
 */
export const WEB_OFFICE_OFFICE_TYPE_MIRROR: Record<string, string> = {
  Spreadsheet: 's',
  Writer: 'w',
  Presentation: 'p',
  Pdf: 'f',
  Otl: 'o',
  Dbt: 'dbt',
  KSheet: 'ksheet'
};

/**
 * 只读方法白名单（`packages/browser/src/weboffice/port.ts` 的镜像）。
 *
 * MAIN 侧的调用器只接受这里面的名字。写方法从来不在里面，所以「只读」是结构上的：
 * 想调一个写方法，得先有人往这份清单里加一行。
 */
export const WEB_OFFICE_READ_METHOD_MIRROR: readonly string[] = [
  'GetDocumentText',
  'GetParagraphs',
  'GetSheetNames',
  'GetUsedRange',
  'GetSheetRows',
  'GetCell',
  'GetSlideCount',
  'GetSlideTitle',
  'GetSlideBody',
  'GetSlideNotes',
  'GetPageCount',
  'GetPageText'
];

export interface WebOfficeInstanceSummary {
  /** 页面看得见的本地序号。**不是** handle——handle 由 ISOLATED 侧生成（FR-11.3a） */
  localId: string;
  officeType: string;
  fileId?: string;
  iframeId?: string;
  /**
   * 这份记录是 `config()` 在**宿主帧**造出来的远程句柄，文档本体住在它 mount 的子帧里。
   * 子帧会拿 `WPSOpenApi` 再报一次同一份文档，宿主据此去重（否则一份文档会被数成两份）
   */
  viaMount?: boolean;
  state: 'initialising' | 'ready' | 'failed';
}

/**
 * 请求载荷单独一个联合类型：`Omit<联合, 'channel'|'id'>` 会把联合拍扁成交集，
 * 调用方写 `{kind:'describe', localId}` 会被判成多余字段。
 */
export type WebOfficeBridgePayload =
  | { kind: 'enumerate' }
  | { kind: 'describe'; localId: string }
  | { kind: 'call'; localId: string; method: string; args: readonly unknown[] }
  | { kind: 'scroll'; localId: string }
  | { kind: 'take-pdf'; localId: string }
  /**
   * 取本帧知道的那条原件直链的字节。不带 localId：直链是**宿主页面**的东西，
   * 而实例在它子帧里（实测：`downloadurl` 在顶层，`WPSOpenApi` 在 office 帧），
   * 两者从来不在同一帧。问“这一帧知不知道一条直链”才问得到东西
   */
  | { kind: 'take-linked-pdf' }
  /** 同上，但收件标准是演示文稿包（FR-12.4d） */
  | { kind: 'take-linked-presentation' }
  /** 取本帧嗅到的 PDF。不带 localId：发到哪一帧就是那一帧的字节（DV-18） */
  | { kind: 'take-frame-pdf' };

export type WebOfficeBridgeRequest = {
  channel: typeof WEB_OFFICE_BRIDGE_CHANNEL;
  id: number;
} & WebOfficeBridgePayload;

export type WebOfficeBridgeResponse =
  | { channel: typeof WEB_OFFICE_BRIDGE_CHANNEL; id: number; ok: true; value: unknown }
  | { channel: typeof WEB_OFFICE_BRIDGE_CHANNEL; id: number; ok: false; reason: string };

export function isWebOfficeBridgeRequest(value: unknown): value is WebOfficeBridgeRequest {
  if (typeof value !== 'object' || value === null) return false;
  const c = value as { channel?: unknown; id?: unknown; kind?: unknown; method?: unknown };
  if (c.channel !== WEB_OFFICE_BRIDGE_CHANNEL || typeof c.id !== 'number') return false;
  if (c.kind === 'enumerate' || c.kind === 'describe' || c.kind === 'scroll') return true;
  if (c.kind === 'take-pdf' || c.kind === 'take-frame-pdf' || c.kind === 'take-linked-pdf') return true;
  if (c.kind === 'take-linked-presentation') return true;
  // 方法白名单挡在**入口**：放进 dispatch 里判，一个漏掉的分支就是任意方法调用
  return c.kind === 'call' && typeof c.method === 'string' && WEB_OFFICE_READ_METHOD_MIRROR.includes(c.method);
}

export function isWebOfficeBridgeResponse(value: unknown): value is WebOfficeBridgeResponse {
  if (typeof value !== 'object' || value === null) return false;
  const c = value as { channel?: unknown; id?: unknown; ok?: unknown; reason?: unknown };
  if (c.channel !== WEB_OFFICE_BRIDGE_CHANNEL || typeof c.id !== 'number') return false;
  if (c.ok === true) return true;
  return c.ok === false && typeof c.reason === 'string';
}

/**
 * MAIN ↔ ISOLATED 的握手桥信封（分册 18 FR-18.3）。
 *
 * 单独一份、不依赖任何 SDK 类型：MAIN world 那一侧由 `probe.js` 承载，
 * 它是个刻意保持极小的 `document_start` 脚本，把 `@webskill/browser` 的类型图
 * 拖进去只会让页面每次导航都多下载一份用不上的代码。
 *
 * 两个世界共用同一个 `window`，所以双方都会收到自己发出的消息。
 * 请求带 `kind`、应答带 `ok`，靠这两个字段互斥地认领，别再加 `direction` 字段。
 */

export const PAGE_MCP_BRIDGE_CHANNEL = 'webskill:page-mcp-bridge';

export const PAGE_MCP_BRIDGE_METHODS = [
  'listTools',
  'callTool',
  'listPrompts',
  'getPrompt',
  'listResources',
  'readResource'
] as const;

export type PageMcpBridgeMethod = (typeof PAGE_MCP_BRIDGE_METHODS)[number];

export interface PageMcpBridgeRequest {
  channel: typeof PAGE_MCP_BRIDGE_CHANNEL;
  id: number;
  /** `list` 只问「现在有哪些端点」；WebMCP 的调用用 `endpoint: undefined` */
  kind: 'list' | 'call';
  endpoint?: string;
  method?: PageMcpBridgeMethod;
  params?: unknown;
}

export type PageMcpBridgeResponse =
  | { channel: typeof PAGE_MCP_BRIDGE_CHANNEL; id: number; ok: true; value: unknown }
  | { channel: typeof PAGE_MCP_BRIDGE_CHANNEL; id: number; ok: false; reason: string };

/** 页面 → 宿主唯一被允许的主动消息：不带内容，只让宿主重新拉一次清单（FR-18.7 第 3 条） */
export interface PageMcpBridgeChanged {
  channel: typeof PAGE_MCP_BRIDGE_CHANNEL;
  kind: 'changed';
}

/** 一条消息里最多转多少条提议；候选层另有更严的上限，这里只是不让一次 postMessage 把面板卡死 */
export const PAGE_DATA_SOURCES_LIMIT = 64;

/**
 * 页面自荐可用数据源（0.14.0 分册 21，D-21-6 (b)）。
 *
 * 与 `changed` 不同，它**带内容**；因此内容脚本只做转发，
 * 一切校验在 side panel 的候选层——只有那里知道当前绑的是哪个 tab。
 */
export interface PageMcpBridgeDataSources {
  channel: typeof PAGE_MCP_BRIDGE_CHANNEL;
  kind: 'data-sources';
  sources: readonly unknown[];
}

export function isPageMcpBridgeRequest(value: unknown): value is PageMcpBridgeRequest {
  if (typeof value !== 'object' || value === null) return false;
  const c = value as { channel?: unknown; id?: unknown; kind?: unknown; method?: unknown };
  if (c.channel !== PAGE_MCP_BRIDGE_CHANNEL || typeof c.id !== 'number') return false;
  if (c.kind === 'list') return true;
  if (c.kind !== 'call') return false;
  // 方法白名单挡在**入口**：放到 dispatch 里判，一个漏掉的分支就会变成任意方法调用
  return PAGE_MCP_BRIDGE_METHODS.includes(c.method as PageMcpBridgeMethod);
}

export function isPageMcpBridgeResponse(value: unknown): value is PageMcpBridgeResponse {
  if (typeof value !== 'object' || value === null) return false;
  const c = value as { channel?: unknown; id?: unknown; ok?: unknown; reason?: unknown };
  if (c.channel !== PAGE_MCP_BRIDGE_CHANNEL || typeof c.id !== 'number') return false;
  if (c.ok === true) return true;
  return c.ok === false && typeof c.reason === 'string';
}

export function isPageMcpBridgeChanged(value: unknown): value is PageMcpBridgeChanged {
  if (typeof value !== 'object' || value === null) return false;
  const c = value as { channel?: unknown; kind?: unknown };
  return c.channel === PAGE_MCP_BRIDGE_CHANNEL && c.kind === 'changed';
}

export function isPageMcpBridgeDataSources(value: unknown): value is PageMcpBridgeDataSources {
  if (typeof value !== 'object' || value === null) return false;
  const c = value as { channel?: unknown; kind?: unknown; sources?: unknown };
  return c.channel === PAGE_MCP_BRIDGE_CHANNEL && c.kind === 'data-sources' && Array.isArray(c.sources);
}

/**
 * 内容脚本 → 锚点：「刚才那份自荐再发一遍」。
 *
 * 站点通常在页面解析时就喊完了，而内容脚本是 `document_idle` 才注入的——
 * 那一次推送发生在监听器存在之前，没人接得到。锚点跑在 `document_start`，
 * 它记得住；这条消息只是让它把记住的那份重播一次。
 */
export const pageMcpBridgeDataSourcesPull = (): { channel: typeof PAGE_MCP_BRIDGE_CHANNEL; kind: string } => ({
  channel: PAGE_MCP_BRIDGE_CHANNEL,
  kind: 'data-sources-pull'
});

export function isPageMcpBridgeDataSourcesPull(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const c = value as { channel?: unknown; kind?: unknown };
  return c.channel === PAGE_MCP_BRIDGE_CHANNEL && c.kind === 'data-sources-pull';
}

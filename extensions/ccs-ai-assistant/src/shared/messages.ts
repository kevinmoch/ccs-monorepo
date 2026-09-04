import type { PageAgentReply, PageAgentRequest } from '@webskill/browser';

/**
 * 扩展自己的消息信封。**不复用分册 13 的类型当消息本体**：
 * `chrome.runtime.onMessage` 是全扩展共享的一条总线，
 * 页面里其它内容脚本、其它扩展的转发都会落进同一个监听器。
 * 没有信封就只能靠 `'type' in msg` 猜，猜错一次就是把别人的消息当请求处理。
 */
export const PAGE_AGENT_CHANNEL = 'webskill:page-agent';

export interface PageAgentEnvelope {
  channel: typeof PAGE_AGENT_CHANNEL;
  request: PageAgentRequest;
}

export function pageAgentEnvelope(request: PageAgentRequest): PageAgentEnvelope {
  return { channel: PAGE_AGENT_CHANNEL, request };
}

export function isPageAgentEnvelope(value: unknown): value is PageAgentEnvelope {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { channel?: unknown; request?: unknown };
  if (candidate.channel !== PAGE_AGENT_CHANNEL) return false;
  const request = candidate.request as { type?: unknown } | undefined;
  return typeof request === 'object' && request !== null && (request.type === 'perceive' || request.type === 'execute');
}

/**
 * 内容脚本的回包信封（分册 16 FR-16.5）。
 *
 * 0.13.0 时回的就是分册 13 的应答本体，因为只有一个帧。自动下钻进来之后，
 * 投递目标是前一次 `getAllFrames` 算出的 `frameId`——那一帧完全可能在两次调用
 * 之间导航走了。只看 `frameId` 看不出来，拿回来的就是另一个站点的内容而不自知；
 * 让帧自报地址，路由层才能对得上（AC-16.10）。
 */
export interface PageAgentResponse {
  channel: typeof PAGE_AGENT_CHANNEL;
  reply: PageAgentReply;
  /** 应答时本帧的 `location.href` */
  documentUrl: string;
}

export function pageAgentResponse(reply: PageAgentReply, documentUrl: string): PageAgentResponse {
  return { channel: PAGE_AGENT_CHANNEL, reply, documentUrl };
}

export function isPageAgentResponse(value: unknown): value is PageAgentResponse {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { channel?: unknown; reply?: unknown; documentUrl?: unknown };
  if (candidate.channel !== PAGE_AGENT_CHANNEL) return false;
  if (typeof candidate.documentUrl !== 'string') return false;
  return isPageAgentReply(candidate.reply);
}

/** 分册 13 的应答本体；正常路径上包在 `PageAgentResponse` 里 */
export function isPageAgentReply(value: unknown): value is PageAgentReply {
  if (typeof value !== 'object' || value === null) return false;
  const type = (value as { type?: unknown }).type;
  return type === 'perceive-result' || type === 'execute-result' || type === 'error';
}

/**
 * 链接文档取件（分册 17 FR-17.1）。
 *
 * 自成一条信道而不是塞进 `PageAgentRequest`：那是 SDK 的契约，
 * 「带页面登录态去取一个附件」是扩展宿主特有的能力，SDK 里没有对应概念。
 */
export const DOCUMENT_FETCH_CHANNEL = 'webskill:document-fetch';

export interface DocumentFetchRequest {
  channel: typeof DOCUMENT_FETCH_CHANNEL;
  url: string;
}

export type DocumentFetchResult =
  | { channel: typeof DOCUMENT_FETCH_CHANNEL; ok: true; mimeType: string; data: string }
  | { channel: typeof DOCUMENT_FETCH_CHANNEL; ok: false; reason: string };

export function documentFetchRequest(url: string): DocumentFetchRequest {
  return { channel: DOCUMENT_FETCH_CHANNEL, url };
}

export function isDocumentFetchRequest(value: unknown): value is DocumentFetchRequest {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { channel?: unknown; url?: unknown };
  return candidate.channel === DOCUMENT_FETCH_CHANNEL && typeof candidate.url === 'string';
}

export function isDocumentFetchResult(value: unknown): value is DocumentFetchResult {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { channel?: unknown; ok?: unknown; mimeType?: unknown; data?: unknown; reason?: unknown };
  if (candidate.channel !== DOCUMENT_FETCH_CHANNEL) return false;
  if (candidate.ok === true) return typeof candidate.mimeType === 'string' && typeof candidate.data === 'string';
  return candidate.ok === false && typeof candidate.reason === 'string';
}

/**
 * 页面宿主握手（分册 18 FR-18.3）。
 *
 * 走 `chrome.runtime`，由 ISOLATED 内容脚本转成 MAIN world 的 `window.postMessage`。
 * 自成一条信道的理由与 `DOCUMENT_FETCH_CHANNEL` 相同：这是宿主与页面运行时之间的
 * 交接口，SDK 的 `PageAgentRequest` 里没有对应概念。
 */
export const PAGE_MCP_CHANNEL = 'webskill:page-mcp';

/** 可经桥调用的方法白名单。放开成「client 上的任意方法」等于把页面对象的方法表交出去 */
export const PAGE_MCP_METHODS = [
  'listTools',
  'callTool',
  'listPrompts',
  'getPrompt',
  'listResources',
  'readResource'
] as const;

export type PageMcpMethod = (typeof PAGE_MCP_METHODS)[number];

/** `endpoint` 为空即 WebMCP（它不经锚点，D-18-5），只认 listTools / callTool */
export interface PageMcpRequest {
  channel: typeof PAGE_MCP_CHANNEL;
  /** `list` 只问「现在有哪些端点」，不带内容 */
  kind: 'list' | 'call';
  endpoint?: string;
  method?: PageMcpMethod;
  params?: unknown;
}

export type PageMcpResult =
  | { channel: typeof PAGE_MCP_CHANNEL; ok: true; value: unknown }
  | { channel: typeof PAGE_MCP_CHANNEL; ok: false; reason: string };

export const pageMcpList = (): PageMcpRequest => ({ channel: PAGE_MCP_CHANNEL, kind: 'list' });

export const pageMcpCall = (endpoint: string | undefined, method: PageMcpMethod, params: unknown): PageMcpRequest => ({
  channel: PAGE_MCP_CHANNEL,
  kind: 'call',
  ...(endpoint === undefined ? {} : { endpoint }),
  method,
  params
});

export function isPageMcpRequest(value: unknown): value is PageMcpRequest {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { channel?: unknown; kind?: unknown; method?: unknown };
  if (candidate.channel !== PAGE_MCP_CHANNEL) return false;
  if (candidate.kind === 'list') return true;
  if (candidate.kind !== 'call') return false;
  return PAGE_MCP_METHODS.includes(candidate.method as PageMcpMethod);
}

export function isPageMcpResult(value: unknown): value is PageMcpResult {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { channel?: unknown; ok?: unknown; reason?: unknown };
  if (candidate.channel !== PAGE_MCP_CHANNEL) return false;
  if (candidate.ok === true) return true;
  return candidate.ok === false && typeof candidate.reason === 'string';
}

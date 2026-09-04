/**
 * 页面端点在扩展进程里的替身（分册 18 FR-18.4）。
 *
 * 页面侧的 client 背后连着一个活的 `McpServer` 和 `MessageChannelTransport`，
 * 全是页面内存里的闭包，搬不过来。能跨进程走的只有它 6 个方法的参数与返回值，
 * 而那些恰好都是 JSON-RPC 值——所以这里做的是**方法调用转消息**，不是对象搬家。
 *
 * 拿到替身之后一切照旧：注册进扩展自己的 `EndpointRegistry`，
 * `McpRuntimePlugin` / `TemporarySkillProvider` / `ConnectFacade` 全按既有方式装配（D-18-4）。
 */
import { WebSkillError } from '@webskill/core';
import type { McpClientLike } from '@webskill/mcp';
import { isPageMcpResult, pageMcpCall, pageMcpList, type PageMcpMethod } from './messages';

/** 页面端点清单变了的通知信道；内容脚本发，面板收 */
export const PAGE_MCP_CHANGED = 'webskill:page-mcp-changed';

export const isPageMcpChanged = (value: unknown): boolean =>
  typeof value === 'object' && value !== null && (value as { channel?: unknown }).channel === PAGE_MCP_CHANGED;

/** 页面自荐数据源的信道（0.14.0 分册 21）；内容脚本发，面板收 */
export const PAGE_DATA_SOURCES = 'webskill:page-data-sources';

/**
 * 面板反过来问「你那页声明过什么」的信道。
 *
 * 声明是推的，而站点通常只在加载时喊一次；面板后开、
 * 或切回一个早就开着的 tab，都永远等不到下一次推送。
 * 缓存放在内容脚本而不是重新问一遍 MAIN world：
 * 后者等于给页面一个按问话人换答案的机会。
 */
export const PAGE_DATA_SOURCES_PULL = 'webskill:page-data-sources-pull';

export const pageDataSourcesPull = (): { channel: string } => ({ channel: PAGE_DATA_SOURCES_PULL });

export const isPageDataSourcesPull = (value: unknown): boolean =>
  typeof value === 'object' && value !== null && (value as { channel?: unknown }).channel === PAGE_DATA_SOURCES_PULL;

/** 只判信封；`sources` 里每一条都是不可信内容，由候选层逐条校验 */
export const isPageDataSourcesMessage = (value: unknown): value is { sources: readonly unknown[] } => {
  if (typeof value !== 'object' || value === null) return false;
  const c = value as { channel?: unknown; sources?: unknown };
  return c.channel === PAGE_DATA_SOURCES && Array.isArray(c.sources);
};

/** WebMCP 不是端点，它在桥那头走另一条分支（D-18-5） */
export const WEB_MCP_ENDPOINT = undefined;

export interface PageMcpTransport {
  /** 发往当前绑定 tab 的主帧；未绑定时抛结构化错误 */
  send(message: unknown): Promise<unknown>;
}

async function exchange(transport: PageMcpTransport, message: unknown): Promise<unknown> {
  const raw = await transport.send(message);
  if (!isPageMcpResult(raw)) {
    throw new WebSkillError('MCP_ENDPOINT_UNAVAILABLE', 'The page did not answer the handshake.');
  }
  if (!raw.ok) throw new WebSkillError('MCP_ENDPOINT_UNAVAILABLE', raw.reason);
  return raw.value;
}

/** 页面当前有哪些端点、有没有 WebMCP。空清单与「问不到」是两回事，后者抛错 */
export async function listPageEndpoints(
  transport: PageMcpTransport
): Promise<{ endpoints: string[]; webMcp: boolean }> {
  const value = (await exchange(transport, pageMcpList())) as { endpoints?: unknown; webMcp?: unknown };
  const endpoints = Array.isArray(value?.endpoints)
    ? value.endpoints.filter((e): e is string => typeof e === 'string')
    : [];
  return { endpoints, webMcp: value?.webMcp === true };
}

const call = (transport: PageMcpTransport, endpoint: string | undefined, method: PageMcpMethod, params: unknown) =>
  exchange(transport, pageMcpCall(endpoint, method, params));

/**
 * 六个方法逐个转发。写成 `Object.fromEntries(METHODS.map(...))` 会丢掉类型，
 * 而这个接口是给 SDK 的解析器用的，类型丢了下一个改动就会静默错位。
 */
export function createRemotePageClient(transport: PageMcpTransport, endpoint: string): McpClientLike {
  const forward = <M extends PageMcpMethod>(method: M, params: unknown): Promise<never> =>
    call(transport, endpoint, method, params) as Promise<never>;
  return {
    listTools: () => forward('listTools', {}),
    callTool: (input) => forward('callTool', input),
    listPrompts: () => forward('listPrompts', {}),
    getPrompt: (input) => forward('getPrompt', input),
    listResources: () => forward('listResources', {}),
    readResource: (input) => forward('readResource', input)
  };
}

/**
 * WebMCP 的 `BrowserModelContextLike`。方法名按**适配器真正会调的**来：
 * 它找的是 `getTools()` 与 `executeTool(tool, argsJson)`，参数是 JSON 串不是对象。
 */
export function createRemoteWebMcp(transport: PageMcpTransport): {
  getTools(): Promise<unknown[]>;
  executeTool(tool: unknown, argsJson: unknown): Promise<unknown>;
} {
  return {
    getTools: async () => {
      const value = (await call(transport, WEB_MCP_ENDPOINT, 'listTools', {})) as { tools?: unknown };
      return Array.isArray(value?.tools) ? value.tools : [];
    },
    executeTool: (tool, argumentsJson) => {
      // 适配器传的可能是描述符对象，也可能是名字；桥那头只认名字（拷贝找不回原始对象）
      const name = typeof tool === 'string' ? tool : (tool as { name?: unknown })?.name;
      return call(transport, WEB_MCP_ENDPOINT, 'callTool', { name, argumentsJson });
    }
  };
}

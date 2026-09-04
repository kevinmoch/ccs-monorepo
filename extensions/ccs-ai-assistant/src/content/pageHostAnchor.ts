/**
 * 页面宿主锚点（MAIN world 侧，分册 18 FR-18.3）。
 *
 * 跟 `probe.ts` 一样跑在页面自己的 JS 世界且 `document_start` 注入——后者是关键：
 * 锚点必须**早于任何页面脚本**落位，SDK 的 `EndpointRegistry` 才可能看到它。
 * 晚一步，页面的 chatbot 早就把端点注册完了，我们就永远收不到那一次通知。
 *
 * ## 安全边界，逐条对着 FR-18.7 看
 *
 * 1. 锚点在 MAIN world，页面上**任何脚本**都能读到它、也能调 `register()` 塞假端点。
 *    nonce / 私有字段 / 闭包在同一个世界里都挡不住，这一条无解，不粉饰。
 *    宿主侧因此把握手拿到的一切当不可信内容处理。
 * 2. 暴露没有提升权限：页面脚本本来就能调页面自己的端点。新增的风险是向模型投毒。
 * 3. 桥是单向的：页面只能应答宿主发起的调用。唯一的主动消息是不带内容的 `changed`，
 *    它只会让宿主重新拉一次清单。
 * 4. 方法白名单写死 6 个，不做 `client[method](...)` 的任意分发——那等于把页面对象的
 *    整张方法表交给消息发送方。
 */

import {
  PAGE_DATA_SOURCES_LIMIT,
  PAGE_MCP_BRIDGE_CHANNEL,
  isPageMcpBridgeDataSourcesPull,
  isPageMcpBridgeRequest,
  type PageMcpBridgeMethod,
  type PageMcpBridgeRequest
} from '../shared/pageMcpBridge';

interface McpClientLike {
  listTools(): Promise<unknown>;
  callTool(input: unknown): Promise<unknown>;
  listPrompts(): Promise<unknown>;
  getPrompt(input: unknown): Promise<unknown>;
  listResources(): Promise<unknown>;
  readResource(input: unknown): Promise<unknown>;
}

interface WebMcpLike {
  getTools?(): Promise<unknown> | unknown;
  executeTool?(tool: unknown, argsJson: unknown): Promise<unknown> | unknown;
}

const clients = new Map<string, McpClientLike>();

/**
 * 本页最后一次自荐的数据源（分册 21）。
 *
 * 记在这一侧而不是内容脚本里：页面通常在解析时就喊完了，
 * 而内容脚本是 `document_idle` 才注入的——那一次推送发生在它的监听器存在之前。
 * 存一份并不降低可信度：两边都是页面说了算，校验从来只在 side panel 那侧。
 */
let declaredDataSources: readonly unknown[] = [];

function postDataSources(): void {
  window.postMessage({ channel: PAGE_MCP_BRIDGE_CHANNEL, kind: 'data-sources', sources: declaredDataSources }, '*');
}

/** 端点抖动一批合成一条：demo 换屏时会连着 set 好几次 */
let changePending = false;
function announceChange(): void {
  if (changePending) return;
  changePending = true;
  void Promise.resolve().then(() => {
    changePending = false;
    window.postMessage({ channel: PAGE_MCP_BRIDGE_CHANNEL, kind: 'changed' }, '*');
  });
}

const hasMethod = (value: unknown, name: string): boolean =>
  typeof (value as Record<string, unknown> | null)?.[name] === 'function';

/** 鸭子类型即可：SDK 的泛型 registry 存什么它都不知道，只有形状能判 */
const isMcpClient = (value: unknown): value is McpClientLike =>
  hasMethod(value, 'listTools') && hasMethod(value, 'callTool');

function installAnchor(): void {
  Object.defineProperty(globalThis, '__webskillPageHost', {
    configurable: true,
    value: {
      version: 1,
      register(endpoint: string, client: unknown): void {
        if (typeof endpoint !== 'string' || !isMcpClient(client)) return;
        clients.set(endpoint, client);
        announceChange();
      },
      unregister(endpoint: string): void {
        if (clients.delete(endpoint)) announceChange();
      },
      // 0.14.0 分册 21：只转发，一个字段都不在这一侧信。校验在 side panel 的候选层，
      // 放在这里等于把判据交给被 XSS 的页面所在的世界
      declareDataSources(sources: readonly unknown[]): void {
        if (!Array.isArray(sources)) return;
        declaredDataSources = sources.slice(0, PAGE_DATA_SOURCES_LIMIT);
        postDataSources();
      }
    }
  });
}

const webMcp = (): WebMcpLike | undefined => {
  const doc = (globalThis as { document?: { modelContext?: WebMcpLike } }).document;
  const nav = (globalThis as { navigator?: { modelContext?: WebMcpLike } }).navigator;
  return doc?.modelContext ?? nav?.modelContext;
};

/** WebMCP 的方法名与 MCP 对不上，单独映射（D-18-5：它不经锚点） */
async function callWebMcp(method: PageMcpBridgeMethod, params: unknown): Promise<unknown> {
  const api = webMcp();
  if (api === undefined) throw new Error('This page does not expose WebMCP tools.');
  if (method === 'listTools') {
    if (!hasMethod(api, 'getTools')) return { tools: [] };
    return { tools: await api.getTools!() };
  }
  if (method === 'callTool') {
    if (!hasMethod(api, 'executeTool')) throw new Error('This page does not expose WebMCP tools.');
    const input = (params ?? {}) as { name?: unknown; argumentsJson?: unknown };
    if (typeof input.name !== 'string') throw new Error('A WebMCP call needs a tool name.');
    // 新版 API 的第一参必须是 `getTools()` 返回的**原始对象**——跨进程送来的是拷贝，
    // 所以在这一侧按名字重新找一遍；找不到就退回旧版的 (name, argsJson) 形态
    const tools = hasMethod(api, 'getTools') ? await api.getTools!() : undefined;
    const match = Array.isArray(tools) ? tools.find((t) => (t as { name?: unknown })?.name === input.name) : undefined;
    return api.executeTool!(match ?? input.name, input.argumentsJson ?? '{}');
  }
  // prompts / resources 是 MCP 的概念，WebMCP 没有对应物
  throw new Error(`WebMCP does not support "${method}".`);
}

async function dispatch(request: PageMcpBridgeRequest): Promise<unknown> {
  if (request.kind === 'list') {
    return { endpoints: [...clients.keys()], webMcp: webMcp() !== undefined };
  }
  const method = request.method;
  if (method === undefined) throw new Error('A call needs a method.');
  if (request.endpoint === undefined) return callWebMcp(method, request.params);

  const client = clients.get(request.endpoint);
  if (client === undefined) throw new Error(`Endpoint "${request.endpoint}" is no longer registered on this page.`);
  // 白名单分发；不写成 client[method](...) 是刻意的（见文件头第 4 条）
  switch (method) {
    case 'listTools':
      return client.listTools();
    case 'callTool':
      return client.callTool(request.params);
    case 'listPrompts':
      return client.listPrompts();
    case 'getPrompt':
      return client.getPrompt(request.params);
    case 'listResources':
      return client.listResources();
    case 'readResource':
      return client.readResource(request.params);
  }
}

/**
 * 只在主帧接管（D-18-6）。嵌入帧里的端点是**可调用的能力**，
 * 不是分册 16 那种只读内容，逐帧授权与端点重名都还没有答案。
 *
 * @returns 卸载函数。生产里用不上（页面卸载时一切随之消失），
 *   但没有它就无法在一个进程里装第二次——测试正是这么用的。
 */
export function installPageHostAnchor(): () => void {
  if (window.top !== window) return () => undefined;
  installAnchor();

  const onMessage = (event: MessageEvent): void => {
    if (event.source !== window) return;
    // 内容脚本刚挂上监听器，让它补上错过的那一次自荐（分册 21）
    if (isPageMcpBridgeDataSourcesPull(event.data)) {
      if (declaredDataSources.length > 0) postDataSources();
      return;
    }
    // 只认本窗口发来的请求：跨窗口的同名消息可能是别的页面在冒充内容脚本
    if (!isPageMcpBridgeRequest(event.data)) return;
    const { id } = event.data;
    void dispatch(event.data).then(
      (value) => {
        // 结构化克隆过不去的返回值（含函数、DOM 节点等）不能让整条桥静默卡住
        try {
          window.postMessage({ channel: PAGE_MCP_BRIDGE_CHANNEL, id, ok: true, value }, '*');
        } catch (e) {
          const reason = e instanceof Error ? e.message : String(e);
          window.postMessage(
            {
              channel: PAGE_MCP_BRIDGE_CHANNEL,
              id,
              ok: false,
              reason: `The page returned a value that cannot cross the bridge (${reason}).`
            },
            '*'
          );
        }
      },
      (e: unknown) => {
        window.postMessage(
          { channel: PAGE_MCP_BRIDGE_CHANNEL, id, ok: false, reason: e instanceof Error ? e.message : String(e) },
          '*'
        );
      }
    );
  };
  window.addEventListener('message', onMessage);

  return () => {
    window.removeEventListener('message', onMessage);
    clients.clear();
    declaredDataSources = [];
    delete (globalThis as Record<string, unknown>)['__webskillPageHost'];
  };
}

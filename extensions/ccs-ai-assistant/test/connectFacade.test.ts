// @vitest-environment jsdom
/**
 * options 页里 console 的门面（分册 18 FR-18.6 / AC-18.6）。
 *
 * 判据落在「三个面板拿到的是真数据」和「手动加端点必须结构化拒绝」——
 * 后者比看起来重要：给一个能点但必然失败的按钮，比明说不支持更糟。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PAGE_MCP_CHANNEL } from '../src/shared/messages';
import { createExtensionConnect } from '../src/shared/connectFacade';

const ok = (value: unknown) => ({ channel: PAGE_MCP_CHANNEL, ok: true, value });

const PAGE = {
  endpoints: ['agile-page'],
  tools: [{ name: 'get_view', description: 'Read the current board', inputSchema: { type: 'object' } }],
  prompts: [{ name: 'triage', description: 'Triage a defect' }],
  webMcpTools: [{ name: 'agile_get_current_view', description: 'What the user is looking at' }]
};

function stubChrome(send: ReturnType<typeof vi.fn>): void {
  (globalThis as Record<string, unknown>)['chrome'] = {
    tabs: {
      sendMessage: send,
      query: vi.fn().mockResolvedValue([{ id: 7, url: 'https://agile.example.com/board', title: 'Board' }]),
      get: vi.fn().mockResolvedValue({ id: 7, url: 'https://agile.example.com/board' }),
      onRemoved: { addListener: vi.fn() },
      onActivated: { addListener: vi.fn() },
      onUpdated: { addListener: vi.fn() }
    },
    windows: { WINDOW_ID_NONE: -1, onFocusChanged: { addListener: vi.fn() } }
  };
}

/** 一个装配了端点 + 页面技能 + WebMCP 的页面 */
function livePage(): ReturnType<typeof vi.fn> {
  return vi.fn(async (_tabId: number, message: any) => {
    if (message.kind === 'list') return ok({ endpoints: PAGE.endpoints, webMcp: true });
    if (message.endpoint === undefined) return ok({ tools: PAGE.webMcpTools });
    if (message.method === 'listTools') return ok({ tools: PAGE.tools });
    if (message.method === 'listPrompts') return ok({ prompts: PAGE.prompts });
    if (message.method === 'listResources') return ok({ resources: [] });
    return ok({});
  });
}

beforeEach(() => {
  delete (globalThis as Record<string, unknown>)['chrome'];
  globalThis.localStorage.clear();
});

describe('三个面板都有内容（AC-18.6）', () => {
  it('MCP Endpoints：列出页面注册的端点与它的工具数', async () => {
    stubChrome(livePage());

    const endpoints = await createExtensionConnect().listEndpoints();

    expect(endpoints).toHaveLength(1);
    expect(endpoints[0]!.config.name).toBe('agile-page');
    expect(endpoints[0]!.status).toBe('connected');
    expect(endpoints[0]!.toolCount).toBe(1);
  });

  it('工具清单带上 schema 原文：详情抽屉要展示它，只给摘要等于没给', async () => {
    stubChrome(livePage());

    const tools = await createExtensionConnect().listTools();

    expect(tools).toEqual([
      expect.objectContaining({
        endpoint: 'agile-page',
        name: 'get_view',
        description: 'Read the current board',
        inputSchema: { type: 'object' },
        enabled: true
      })
    ]);
  });

  it('Page Skills：端点的 prompts 变成页面技能', async () => {
    stubChrome(livePage());

    const skills = await createExtensionConnect().temporarySkills();

    expect(skills).toEqual([
      expect.objectContaining({ name: 'triage', description: 'Triage a defect', source: 'mcp' })
    ]);
    // 同名技能靠 origin 区分，不能丢
    expect(skills[0]!.origin).toContain('agile-page');
  });

  it('WebMCP Tools：不经锚点，直读页面的 modelContext（D-18-5）', async () => {
    const send = livePage();
    stubChrome(send);

    const tools = await createExtensionConnect().webmcp.listTools();

    expect(tools.map((t) => t.name)).toEqual(['agile_get_current_view']);
    // WebMCP 的调用不带 endpoint，桥那头才走得进 WebMCP 分支
    expect(send.mock.calls.some(([, m]) => m.method === 'listTools' && m.endpoint === undefined)).toBe(true);
  });

  it('诊断跑一次真往返并给出耗时', async () => {
    stubChrome(livePage());

    const result = await createExtensionConnect().testEndpoint!('agile-page');

    expect(result.ok).toBe(true);
    expect(result.checkedAt).toBeDefined();
  });
});

describe('手动增删端点结构化拒绝（AC-18.6）', () => {
  it('加端点：页面端点是页面给的，手动加没有意义', async () => {
    stubChrome(livePage());
    const connect = createExtensionConnect();

    await expect(connect.addEndpoint({ name: 'x', url: 'https://x' })).rejects.toMatchObject({
      code: 'TOOL_UNSUPPORTED'
    });
    await expect(connect.removeEndpoint('agile-page')).rejects.toMatchObject({ code: 'TOOL_UNSUPPORTED' });
  });
});

describe('降级（AC-18.8）', () => {
  it('页面一个端点都没有：空表且不抛错', async () => {
    stubChrome(vi.fn(async () => ok({ endpoints: [], webMcp: false })));

    await expect(createExtensionConnect().listEndpoints()).resolves.toEqual([]);
  });

  it('问不到页面：结构化错误，而不是一张骗人的空表', async () => {
    stubChrome(vi.fn().mockRejectedValue(new Error('Receiving end does not exist.')));

    await expect(createExtensionConnect().listEndpoints()).rejects.toMatchObject({
      code: 'MCP_ENDPOINT_UNAVAILABLE'
    });
  });
});

describe('启停在两页之间共享', () => {
  it('在 console 里关掉一个工具，读回来就是关的（两页同源，localStorage 共享）', async () => {
    stubChrome(livePage());
    const connect = createExtensionConnect();

    await connect.setToolEnabled!('agile-page', 'get_view', false);

    const [tool] = await connect.listTools();
    expect(tool!.enabled).toBe(false);
  });

  it('按需披露与禁用是两档，不互相顶替', async () => {
    stubChrome(livePage());
    const connect = createExtensionConnect();

    await connect.setToolDisclosure!('agile-page', 'get_view', 'on-demand');

    const [tool] = await connect.listTools();
    expect(tool!.disclosure).toBe('on-demand');
    expect(tool!.enabled).toBe(true);
  });
});

// @vitest-environment jsdom
/**
 * 页面端点在扩展进程里的宿主（分册 18 FR-18.4 / FR-18.8）。
 *
 * 重点是两条容易做错的：换页必须把上一页的端点丢掉（否则模型能调它看不见的页面），
 * 以及「问不到页面」不能压成「页面没有端点」（后者会让用户以为站点没提供）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PAGE_MCP_CHANNEL } from '../src/shared/messages';
import { createPageMcpHost } from '../src/shared/pageMcpHost';

const ok = (value: unknown) => ({ channel: PAGE_MCP_CHANNEL, ok: true, value });

interface Stub {
  sendMessage: ReturnType<typeof vi.fn>;
}

function stubChrome(sendMessage: ReturnType<typeof vi.fn>): Stub {
  const stub: Stub = { sendMessage };
  (globalThis as Record<string, unknown>)['chrome'] = { tabs: { sendMessage } };
  return stub;
}

/** 按端点名给出各自的工具清单，其余问题一律给空 */
function pageWith(endpoints: Record<string, string[]>): ReturnType<typeof vi.fn> {
  return vi.fn(async (_tabId: number, message: any) => {
    if (message.kind === 'list') return ok({ endpoints: Object.keys(endpoints), webMcp: false });
    if (message.method === 'listTools') {
      return ok({ tools: (endpoints[message.endpoint] ?? []).map((name) => ({ name })) });
    }
    return ok({});
  });
}

beforeEach(() => {
  delete (globalThis as Record<string, unknown>)['chrome'];
  globalThis.localStorage?.clear();
});

describe('发现', () => {
  it('把页面注册的端点同步进扩展自己的 registry', async () => {
    stubChrome(pageWith({ 'agile-page': ['get_view'] }));
    const host = createPageMcpHost({ resolveTabId: () => 7 });

    await host.refresh();

    expect(host.endpoints()).toEqual(['agile-page']);
    await expect(host.registry.get('agile-page').listTools()).resolves.toEqual({ tools: [{ name: 'get_view' }] });
  });

  it('只问主帧：嵌入帧里的端点不接（D-18-6）', async () => {
    const send = pageWith({ 'agile-page': [] });
    stubChrome(send);

    await createPageMcpHost({ resolveTabId: () => 7 }).refresh();

    expect(send).toHaveBeenCalledWith(7, expect.anything(), { frameId: 0 });
  });

  it('页面下线一个端点，扩展这边跟着下线', async () => {
    let live = ['a', 'b'];
    stubChrome(
      vi.fn(async (_tabId: number, message: any) =>
        message.kind === 'list' ? ok({ endpoints: live, webMcp: false }) : ok({ tools: [] })
      )
    );
    const host = createPageMcpHost({ resolveTabId: () => 7 });
    await host.refresh();
    expect(host.endpoints()).toEqual(['a', 'b']);

    live = ['a'];
    await host.refresh(true);

    expect(host.endpoints()).toEqual(['a']);
  });

  it('1 秒内的重复拉取合并成一次往返：一次界面渲染会连问好几遍', async () => {
    const send = pageWith({ a: [] });
    stubChrome(send);
    const host = createPageMcpHost({ resolveTabId: () => 7 });

    await host.refresh();
    await host.refresh();
    await host.refresh();

    expect(send.mock.calls.filter(([, m]) => m.kind === 'list')).toHaveLength(1);
  });

  it('force 跳过 TTL：收到「清单变了」时必须真的重问', async () => {
    const send = pageWith({ a: [] });
    stubChrome(send);
    const host = createPageMcpHost({ resolveTabId: () => 7 });

    await host.refresh();
    await host.refresh(true);

    expect(send.mock.calls.filter(([, m]) => m.kind === 'list')).toHaveLength(2);
  });
});

describe('换页（AC-18.5）', () => {
  it('reset 之后上一页的端点一个都不剩', async () => {
    stubChrome(pageWith({ 'agile-page': ['get_view'] }));
    const host = createPageMcpHost({ resolveTabId: () => 7 });
    await host.refresh();

    host.reset();

    expect(host.endpoints()).toEqual([]);
    expect(() => host.registry.get('agile-page')).toThrow();
  });

  it('没有绑定页时拉取不抛到调用方，而是记下原因', async () => {
    stubChrome(pageWith({}));
    const host = createPageMcpHost({ resolveTabId: () => undefined });

    await host.refresh();

    expect(host.endpoints()).toEqual([]);
    expect(host.lastError()).toMatch(/No page is bound/);
  });
});

describe('降级（AC-18.8）', () => {
  it('页面没有端点：空清单且**没有**错误——「没有」不是「坏了」', async () => {
    stubChrome(pageWith({}));
    const host = createPageMcpHost({ resolveTabId: () => 7 });

    await host.refresh();

    expect(host.endpoints()).toEqual([]);
    expect(host.lastError()).toBeUndefined();
  });

  it('问不到页面：清单空但错误留下了，界面据此分辨得出两者', async () => {
    stubChrome(vi.fn().mockRejectedValue(new Error('Receiving end does not exist.')));
    const host = createPageMcpHost({ resolveTabId: () => 7 });

    await host.refresh();

    expect(host.endpoints()).toEqual([]);
    expect(host.lastError()).toMatch(/Receiving end does not exist/);
  });

  it('页面恢复应答后错误随之清掉', async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockImplementation(async (_tabId: number, message: any) =>
        message.kind === 'list' ? ok({ endpoints: ['a'], webMcp: false }) : ok({ tools: [] })
      );
    stubChrome(send);
    const host = createPageMcpHost({ resolveTabId: () => 7 });
    await host.refresh();
    expect(host.lastError()).toBeDefined();

    await host.refresh(true);

    expect(host.lastError()).toBeUndefined();
    expect(host.endpoints()).toEqual(['a']);
  });
});

describe('启停与披露', () => {
  it('端点与工具的开关各存各的，改完立刻读得到', async () => {
    stubChrome(pageWith({ 'agile-page': ['get_view'] }));
    const host = createPageMcpHost({ resolveTabId: () => 7 });

    expect(host.isEndpointEnabled('agile-page')).toBe(true);
    host.setEndpointEnabled('agile-page', false);
    expect(host.isEndpointEnabled('agile-page')).toBe(false);

    expect(host.isToolEnabled('agile-page', 'get_view')).toBe(true);
    host.setToolEnabled('agile-page', 'get_view', false);
    expect(host.isToolEnabled('agile-page', 'get_view')).toBe(false);
    // 关掉一个工具不该顺手关掉别的端点的同名工具
    expect(host.isToolEnabled('ops', 'get_view')).toBe(true);
  });

  it('按需披露与禁用彼此正交', async () => {
    stubChrome(pageWith({ 'agile-page': ['get_view'] }));
    const host = createPageMcpHost({ resolveTabId: () => 7 });

    host.setToolOnDemand('agile-page', 'get_view', true);

    expect(host.isToolOnDemand('agile-page', 'get_view')).toBe(true);
    expect(host.isToolEnabled('agile-page', 'get_view')).toBe(true);
  });
});

/**
 * 站点自荐的数据源（分册 21）落在 WebMCP 上时，`target` 是**页面声明的原始工具名**，
 * 而模型侧的名字带 `mcp__` 前缀。把原始名直接交给 `source.call` 是解不出来的——
 * 界面上候选看得见、取数却永远失败，正是这次要修的毛病。
 */
describe('按原始工具名调 WebMCP 工具', () => {
  /** 页面只有 WebMCP 面，没有端点 */
  function pageWithWebMcp(tools: string[]) {
    return vi.fn(async (_tabId: number, message: any) => {
      if (message.kind === 'list') return ok({ endpoints: [], webMcp: true });
      if (message.method === 'listTools') {
        return ok({ tools: tools.map((name) => ({ name, description: name, inputSchema: '{"type":"object"}' })) });
      }
      if (message.method === 'callTool')
        return ok({ content: [{ type: 'text', text: `called:${message.params.name}` }] });
      return ok({});
    });
  }

  it('原始名交给工具源解不出来，取数因此必须由宿主补前缀', async () => {
    stubChrome(pageWithWebMcp(['agile_get_bugs']));
    const host = createPageMcpHost({ resolveTabId: () => 7 });
    await host.refresh();

    expect(host.source.canHandle('agile_get_bugs')).toBe(false);
    expect(host.source.canHandle('mcp__agile_get_bugs')).toBe(true);
  });

  it('补完前缀后调到的是页面上那个工具', async () => {
    const send = pageWithWebMcp(['agile_get_bugs']);
    stubChrome(send);
    const host = createPageMcpHost({ resolveTabId: () => 7 });

    const result = await host.callWebMcpTool('agile_get_bugs', {});

    expect(result.ok).toBe(true);
    expect(send).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ method: 'callTool', params: expect.objectContaining({ name: 'agile_get_bugs' }) }),
      { frameId: 0 }
    );
  });
});

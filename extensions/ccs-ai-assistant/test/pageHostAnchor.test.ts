// @vitest-environment jsdom
/**
 * MAIN world 锚点（分册 18 FR-18.3 / FR-18.7）。
 *
 * 这里验的是**桥不该做什么**：白名单之外的方法不分发、跨窗口消息不认、
 * 主动通知不带内容。能转发是最容易做对的部分，这几条才是出事的地方。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PAGE_DATA_SOURCES_LIMIT, PAGE_MCP_BRIDGE_CHANNEL } from '../src/shared/pageMcpBridge';
import { installPageHostAnchor } from '../src/content/pageHostAnchor';

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

let dispose: (() => void) | undefined;

/**
 * 收集本窗口 postMessage 出去的东西。
 *
 * **不往下转发**：jsdom 的 postMessage 是下一个任务才派发的，转发会让应答与
 * 「清单变了」通知交错到别的用例里去。请求由用例自己 dispatch。
 */
function captureOutbound(): { sent: any[] } {
  const sent: any[] = [];
  vi.spyOn(window, 'postMessage').mockImplementation((data: any) => {
    sent.push(data);
  });
  return { sent };
}

function loadAnchor(): void {
  dispose = installPageHostAnchor();
}

function anchor(): { version: number; register(e: string, c: unknown): void; unregister(e: string): void } {
  return (globalThis as Record<string, any>)['__webskillPageHost'];
}

/** 发一条桥请求并等应答 */
async function ask(sent: any[], request: Record<string, unknown>): Promise<any> {
  const before = sent.length;
  window.dispatchEvent(
    new MessageEvent('message', {
      source: window as unknown as MessageEventSource,
      data: { channel: PAGE_MCP_BRIDGE_CHANNEL, ...request }
    })
  );
  await flush();
  return sent.slice(before).find((m) => m?.ok !== undefined);
}

const fakeClient = () => ({
  listTools: vi.fn().mockResolvedValue({ tools: [{ name: 'get_view' }] }),
  callTool: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] }),
  listPrompts: vi.fn().mockResolvedValue({ prompts: [] }),
  getPrompt: vi.fn().mockResolvedValue({ messages: [] }),
  listResources: vi.fn().mockResolvedValue({ resources: [] }),
  readResource: vi.fn().mockResolvedValue({ contents: [] })
});

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  dispose?.();
  dispose = undefined;
});

describe('锚点', () => {
  it('装在页面全局上，SDK 才看得见它', async () => {
    loadAnchor();
    expect(anchor().version).toBe(1);
    expect(typeof anchor().register).toBe('function');
  });

  it('只收形状对得上的 client：SDK 的 registry 是泛型的，什么都可能被塞进来', async () => {
    const { sent } = captureOutbound();
    loadAnchor();

    anchor().register('bogus', { nope: true });

    expect((await ask(sent, { id: 1, kind: 'list' })).value.endpoints).toEqual([]);
  });

  it('注册后出现在清单里，注销后消失', async () => {
    const { sent } = captureOutbound();
    loadAnchor();

    anchor().register('agile-page', fakeClient());
    expect((await ask(sent, { id: 1, kind: 'list' })).value.endpoints).toEqual(['agile-page']);

    anchor().unregister('agile-page');
    expect((await ask(sent, { id: 2, kind: 'list' })).value.endpoints).toEqual([]);
  });

  it('端点变了只捅一下宿主，通知里不带任何内容（FR-18.7 第 3 条）', async () => {
    const { sent } = captureOutbound();
    loadAnchor();

    anchor().register('agile-page', fakeClient());
    await flush();

    const changed = sent.filter((m) => m?.kind === 'changed');
    expect(changed.length).toBeGreaterThan(0);
    expect(Object.keys(changed[0]).sort()).toEqual(['channel', 'kind']);
  });

  it('连着注册几个只合成一条通知：demo 换屏会连 set 好几次', async () => {
    const { sent } = captureOutbound();
    loadAnchor();

    anchor().register('a', fakeClient());
    anchor().register('b', fakeClient());
    anchor().register('c', fakeClient());
    await flush();

    expect(sent.filter((m) => m?.kind === 'changed')).toHaveLength(1);
  });
});

describe('桥的分发', () => {
  it('把调用交给对应端点的 client，参数原样传过去', async () => {
    const { sent } = captureOutbound();
    loadAnchor();
    const client = fakeClient();
    anchor().register('agile-page', client);

    const reply = await ask(sent, {
      id: 1,
      kind: 'call',
      endpoint: 'agile-page',
      method: 'callTool',
      params: { name: 'get_view', arguments: { id: 7 } }
    });

    expect(client.callTool).toHaveBeenCalledWith({ name: 'get_view', arguments: { id: 7 } });
    expect(reply.ok).toBe(true);
  });

  it('白名单之外的方法不分发：放开等于把页面对象的整张方法表交出去', async () => {
    const { sent } = captureOutbound();
    loadAnchor();
    const client = { ...fakeClient(), close: vi.fn() };
    anchor().register('agile-page', client);

    const reply = await ask(sent, { id: 1, kind: 'call', endpoint: 'agile-page', method: 'close' });

    // 类型卫把它挡在门外，连应答都不会有
    expect(reply).toBeUndefined();
    expect(client.close).not.toHaveBeenCalled();
  });

  it('端点已经没了时给出可读原因，不是静默不答', async () => {
    const { sent } = captureOutbound();
    loadAnchor();

    const reply = await ask(sent, { id: 1, kind: 'call', endpoint: 'ghost', method: 'listTools' });

    expect(reply.ok).toBe(false);
    expect(reply.reason).toMatch(/no longer registered/);
  });

  it('client 抛错时把错误消息带回去', async () => {
    const { sent } = captureOutbound();
    loadAnchor();
    const client = fakeClient();
    client.listTools.mockRejectedValue(new Error('the page blew up'));
    anchor().register('agile-page', client);

    const reply = await ask(sent, { id: 1, kind: 'call', endpoint: 'agile-page', method: 'listTools' });

    expect(reply).toMatchObject({ ok: false, reason: 'the page blew up' });
  });

  it('不是本窗口发来的消息一律不理：可能是别的页面在冒充内容脚本', async () => {
    const { sent } = captureOutbound();
    loadAnchor();
    const client = fakeClient();
    anchor().register('agile-page', client);
    // 注册产生的「清单变了」是下一个微任务才发的，先让它落地再取基线
    await flush();
    const before = sent.length;

    window.dispatchEvent(
      new MessageEvent('message', {
        source: {} as MessageEventSource,
        data: { channel: PAGE_MCP_BRIDGE_CHANNEL, id: 9, kind: 'call', endpoint: 'agile-page', method: 'listTools' }
      })
    );
    await flush();

    expect(client.listTools).not.toHaveBeenCalled();
    expect(sent.slice(before)).toEqual([]);
  });
});

describe('站点自荐数据源（0.14.0 分册 21）', () => {
  it('页面调 declareDataSources 时把提议原样送出，条数封顶', async () => {
    const { sent } = captureOutbound();
    loadAnchor();

    const many = Array.from({ length: PAGE_DATA_SOURCES_LIMIT + 5 }, (_, i) => ({ id: `s${i}` }));
    (anchor() as unknown as { declareDataSources(s: readonly unknown[]): void }).declareDataSources(many);

    const message = sent.find((m) => m?.kind === 'data-sources');
    expect(message.channel).toBe(PAGE_MCP_BRIDGE_CHANNEL);
    // 页面可以喊一万条，桥不替宿主承担这份内存
    expect(message.sources).toHaveLength(PAGE_DATA_SOURCES_LIMIT);
    expect(message.sources[0]).toEqual({ id: 's0' });
  });

  it('提议走的是另一种信封，不会被当成「清单变了」通知', async () => {
    const { sent } = captureOutbound();
    loadAnchor();

    (anchor() as unknown as { declareDataSources(s: readonly unknown[]): void }).declareDataSources([{ id: 'a' }]);
    await flush();

    expect(sent.filter((m) => m?.kind === 'changed')).toEqual([]);
  });

  it('内容脚本晚到时能要求重播：站点在解析期就喊完了，那一次没人接', async () => {
    const { sent } = captureOutbound();
    loadAnchor();
    (anchor() as unknown as { declareDataSources(s: readonly unknown[]): void }).declareDataSources([{ id: 'a' }]);
    const before = sent.length;

    window.dispatchEvent(
      new MessageEvent('message', {
        source: window as unknown as MessageEventSource,
        data: { channel: PAGE_MCP_BRIDGE_CHANNEL, kind: 'data-sources-pull' }
      })
    );
    await flush();

    expect(sent.slice(before)).toEqual([
      { channel: PAGE_MCP_BRIDGE_CHANNEL, kind: 'data-sources', sources: [{ id: 'a' }] }
    ]);
  });

  it('页面什么都没声明时，重播请求不产生空提议', async () => {
    const { sent } = captureOutbound();
    loadAnchor();
    const before = sent.length;

    window.dispatchEvent(
      new MessageEvent('message', {
        source: window as unknown as MessageEventSource,
        data: { channel: PAGE_MCP_BRIDGE_CHANNEL, kind: 'data-sources-pull' }
      })
    );
    await flush();

    // 空数组与「这站没提供」是同一件事，但多发一条会让面板白闪一次
    expect(sent.slice(before)).toEqual([]);
  });
});

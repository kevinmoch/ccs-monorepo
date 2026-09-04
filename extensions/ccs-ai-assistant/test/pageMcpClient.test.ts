/**
 * 页面宿主握手的扩展侧（分册 18）。
 *
 * 判据都对着 FR-18.7 的信任边界与 FR-18.8 的降级：
 * 「能转发」是最容易做对的部分，「不该转发什么」和「拿不到时说不出真话」才是会出事的地方。
 */
import { describe, expect, it } from 'vitest';
import { PAGE_MCP_CHANNEL, isPageMcpRequest } from '../src/shared/messages';
import { createRemotePageClient, createRemoteWebMcp, listPageEndpoints } from '../src/shared/pageMcpClient';
import type { PageMcpTransport } from '../src/shared/pageMcpClient';

const ok = (value: unknown) => ({ channel: PAGE_MCP_CHANNEL, ok: true, value });

function recordingTransport(reply: (message: any) => unknown): PageMcpTransport & { sent: any[] } {
  const sent: any[] = [];
  return {
    sent,
    send: async (message) => {
      sent.push(message);
      return reply(message);
    }
  };
}

describe('远程端点替身（AC-18.4）', () => {
  it('六个方法各自带着自己的名字与参数过桥', async () => {
    const transport = recordingTransport(() => ok({ tools: [] }));
    const client = createRemotePageClient(transport, 'agile-page');

    await client.listTools();
    await client.callTool({ name: 'get_view', arguments: { id: 7 } });
    await client.listPrompts();
    await client.getPrompt({ name: 'triage' });
    await client.listResources();
    await client.readResource({ uri: 'mcp://x/1' });

    expect(transport.sent.map((m) => m.method)).toEqual([
      'listTools',
      'callTool',
      'listPrompts',
      'getPrompt',
      'listResources',
      'readResource'
    ]);
    expect(transport.sent[1].params).toEqual({ name: 'get_view', arguments: { id: 7 } });
    expect(transport.sent.every((m) => m.endpoint === 'agile-page')).toBe(true);
  });

  it('过桥的消息真能被结构化克隆：跨进程送的是拷贝，不是引用', async () => {
    const transport = recordingTransport(() => ok({ tools: [{ name: 'get_view' }] }));

    await createRemotePageClient(transport, 'agile-page').callTool({ name: 'get_view', arguments: { id: 7 } });

    // 用真的 structuredClone 断言，而不是「看起来像 JSON」
    expect(() => structuredClone(transport.sent[0])).not.toThrow();
    expect(structuredClone(transport.sent[0])).toEqual(transport.sent[0]);
  });

  it('每条消息都过得了入站类型卫：桥两头认的是同一份协议', async () => {
    const transport = recordingTransport(() => ok({}));
    await createRemotePageClient(transport, 'agile-page').listTools();

    expect(isPageMcpRequest(transport.sent[0])).toBe(true);
  });

  it('页面答的不是握手信封时报结构化错误，而不是把垃圾当结果收下', async () => {
    const transport = recordingTransport(() => ({ whatever: true }));

    await expect(createRemotePageClient(transport, 'agile-page').listTools()).rejects.toMatchObject({
      code: 'MCP_ENDPOINT_UNAVAILABLE'
    });
  });

  it('页面回了失败时把原因带出来，不压成一句通用错误', async () => {
    const transport = recordingTransport(() => ({
      channel: PAGE_MCP_CHANNEL,
      ok: false,
      reason: 'Endpoint "agile-page" is no longer registered on this page.'
    }));

    await expect(createRemotePageClient(transport, 'agile-page').listTools()).rejects.toThrow(/no longer registered/);
  });
});

describe('清单查询', () => {
  it('端点名与 WebMCP 有无一起回来', async () => {
    const transport = recordingTransport(() => ok({ endpoints: ['agile-page', 'ops'], webMcp: true }));

    await expect(listPageEndpoints(transport)).resolves.toEqual({ endpoints: ['agile-page', 'ops'], webMcp: true });
    expect(transport.sent[0].kind).toBe('list');
    // 「问有哪些端点」不该带任何内容出去
    expect(transport.sent[0].method).toBeUndefined();
  });

  it('页面回的清单里混进非字符串时只丢掉那一项，不整体作废', async () => {
    const transport = recordingTransport(() => ok({ endpoints: ['agile-page', 42, null], webMcp: false }));

    await expect(listPageEndpoints(transport)).resolves.toEqual({ endpoints: ['agile-page'], webMcp: false });
  });
});

describe('WebMCP 替身（D-18-5：它不经锚点）', () => {
  it('调用不带 endpoint，由桥那头走 WebMCP 分支', async () => {
    const transport = recordingTransport(() => ok({ content: [] }));

    await createRemoteWebMcp(transport).executeTool('agile_get_current_view', '{"verbose":true}');

    expect(transport.sent[0].endpoint).toBeUndefined();
    expect(transport.sent[0].method).toBe('callTool');
    expect(transport.sent[0].params).toEqual({
      name: 'agile_get_current_view',
      argumentsJson: '{"verbose":true}'
    });
  });

  it('适配器传描述符对象时只把名字送过去：跨进程的拷贝在页面那边找不回原始对象', async () => {
    const transport = recordingTransport(() => ok({ content: [] }));

    await createRemoteWebMcp(transport).executeTool({ name: 'agile_get_current_view', origin: 'x' }, '{}');

    expect(transport.sent[0].params).toEqual({ name: 'agile_get_current_view', argumentsJson: '{}' });
  });

  it('页面没有 WebMCP 时给空清单，不抛错——「没有」不是「坏了」', async () => {
    const transport = recordingTransport(() => ok({ tools: undefined }));

    await expect(createRemoteWebMcp(transport).getTools()).resolves.toEqual([]);
  });
});

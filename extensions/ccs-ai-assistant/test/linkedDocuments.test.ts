/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import { checkFetchAllowed } from '../src/shared/fetchGate';
import { createTabLinkedDocumentReader } from '../src/shared/linkedDocuments';
import { fetchDocumentInPage, MAX_DOCUMENT_BYTES } from '../src/shared/documentFetch';
import { DOCUMENT_FETCH_CHANNEL, isDocumentFetchResult } from '../src/shared/messages';

describe('取件闸门（分册 17 FR-17.2）', () => {
  it('AC-17.4：同注册域的子域放行', () => {
    expect(checkFetchAllowed('https://files.acme.com/a.xlsx', 'https://erp.acme.com/orders')).toEqual({
      allowed: true
    });
  });

  it('同一主机自然放行', () => {
    expect(checkFetchAllowed('https://acme.com/a.pdf', 'https://acme.com/orders').allowed).toBe(true);
  });

  it('AC-17.6：多段公共后缀下的两个不同注册域必须拒绝', () => {
    // 「取最后两段」的实现会把这两个都算成 `com.cn`，从而放行——放宽方向的错
    const result = checkFetchAllowed('https://evil.com.cn/x.xlsx', 'https://victim.com.cn/orders');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('evil.com.cn');
  });

  it('AC-17.6：`.com.cn` 下的同注册域子域仍然放行', () => {
    expect(checkFetchAllowed('https://cdn.victim.com.cn/x.xlsx', 'https://victim.com.cn/orders').allowed).toBe(true);
  });

  it('跨注册域拒绝', () => {
    expect(checkFetchAllowed('https://evil.example/x.xlsx', 'https://acme.com/orders').allowed).toBe(false);
  });

  it('AC-17.7：非 http(s) 协议一律拒绝', () => {
    for (const target of ['file:///etc/passwd', 'chrome-extension://abc/x', 'data:text/plain,hi']) {
      const result = checkFetchAllowed(target, 'https://acme.com/orders');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('http(s)');
    }
  });

  it('AC-17.7：https 页面上的 http 附件按降级拒绝', () => {
    const result = checkFetchAllowed('http://acme.com/a.xlsx', 'https://acme.com/orders');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('downgrade');
  });

  it('http 页面上的同域 http 附件放行', () => {
    expect(checkFetchAllowed('http://acme.com/a.xlsx', 'http://acme.com/orders').allowed).toBe(true);
  });

  it('无注册域的主机（IP / localhost）退回严格同主机', () => {
    expect(checkFetchAllowed('http://127.0.0.1:8080/a.xlsx', 'http://127.0.0.1:8080/orders').allowed).toBe(true);
    expect(checkFetchAllowed('http://127.0.0.2:8080/a.xlsx', 'http://127.0.0.1:8080/orders').allowed).toBe(false);
    expect(checkFetchAllowed('http://intranet/a.xlsx', 'http://intranet/orders').allowed).toBe(true);
    expect(checkFetchAllowed('http://other/a.xlsx', 'http://intranet/orders').allowed).toBe(false);
  });

  it('没有绑定 tab 时拒绝', () => {
    const result = checkFetchAllowed('https://acme.com/a.xlsx', undefined);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('No tab is bound');
  });

  it('非法地址拒绝而不是抛异常', () => {
    expect(checkFetchAllowed('not a url', 'https://acme.com/orders').allowed).toBe(false);
  });
});

describe('内容脚本取件（分册 17 FR-17.1 / D-17-1）', () => {
  const reply = (body: BodyInit, init?: ResponseInit): Response => new Response(body, init);

  it('带页面登录态取件：必须是 credentials: include', async () => {
    const fetchMock = vi.fn(async () => reply(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'text/csv' } }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await fetchDocumentInPage('https://acme.com/a.csv');
    expect(fetchMock).toHaveBeenCalledWith('https://acme.com/a.csv', { credentials: 'include' });
    expect(result).toMatchObject({ ok: true, mimeType: 'text/csv' });
    vi.unstubAllGlobals();
  });

  it('字节内容经 base64 往返不变', async () => {
    // 0x00 与 0xff 是逐字节编码写错时最先崩的两个值
    const bytes = new Uint8Array([0, 1, 127, 128, 255, 65]);
    vi.stubGlobal('fetch', async () => reply(bytes, { headers: { 'content-type': 'application/octet-stream' } }));
    const reader = createTabLinkedDocumentReader({
      pageUrl: () => 'https://acme.com/orders',
      fetchInTab: async (url) => await fetchDocumentInPage(url)
    });
    const document = await reader.read('https://acme.com/a.bin');
    expect(Array.from(document.bytes)).toEqual(Array.from(bytes));
    vi.unstubAllGlobals();
  });

  it('HTTP 非 2xx 如实报错，而不是把错误页当成文档内容', async () => {
    vi.stubGlobal('fetch', async () => reply('<html>login</html>', { status: 403 }));
    const result = await fetchDocumentInPage('https://acme.com/a.xlsx');
    expect(result).toMatchObject({ ok: false });
    expect(isDocumentFetchResult(result) && !result.ok && result.reason).toContain('403');
    vi.unstubAllGlobals();
  });

  it('超过体积上限时报超限，而不是截断', async () => {
    vi.stubGlobal('fetch', async () => reply(new Uint8Array(MAX_DOCUMENT_BYTES + 1)));
    const result = await fetchDocumentInPage('https://acme.com/big.xlsx');
    expect(result).toMatchObject({ ok: false });
    expect(isDocumentFetchResult(result) && !result.ok && result.reason).toContain('limit');
    vi.unstubAllGlobals();
  });

  it('网络异常收敛成结构化失败而不是抛到消息通道外', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new Error('boom');
    });
    const result = await fetchDocumentInPage('https://acme.com/a.xlsx');
    expect(result).toMatchObject({ channel: DOCUMENT_FETCH_CHANNEL, ok: false });
    expect(isDocumentFetchResult(result) && !result.ok && result.reason).toContain('boom');
    vi.unstubAllGlobals();
  });

  it('content-type 缺失时不猜格式', async () => {
    vi.stubGlobal('fetch', async () => new Response(new Uint8Array([1]), { headers: {} }));
    const result = await fetchDocumentInPage('https://acme.com/a');
    expect(isDocumentFetchResult(result) && result.ok && result.mimeType).toBe('application/octet-stream');
    vi.unstubAllGlobals();
  });
});

describe('side panel 侧的链接文档读取', () => {
  it('闸门拒绝时不发起任何取件', async () => {
    const fetchInTab = vi.fn();
    const reader = createTabLinkedDocumentReader({ pageUrl: () => 'https://acme.com/orders', fetchInTab });
    await expect(reader.read('https://evil.example/a.xlsx')).rejects.toThrow(/evil\.example/);
    expect(fetchInTab).not.toHaveBeenCalled();
  });

  it('origin 报的是**页面**的源，而不是扩展自己的', () => {
    const reader = createTabLinkedDocumentReader({ pageUrl: () => 'https://acme.com/orders', fetchInTab: vi.fn() });
    expect(reader.origin).toBe('https://acme.com');
  });

  it('未绑定 tab 时 origin 为 undefined', () => {
    const reader = createTabLinkedDocumentReader({ pageUrl: () => undefined, fetchInTab: vi.fn() });
    expect(reader.origin).toBeUndefined();
  });

  it('内容脚本返回的不是取件结果时明确失败，而不是当成空文档', async () => {
    const reader = createTabLinkedDocumentReader({
      pageUrl: () => 'https://acme.com/orders',
      fetchInTab: async () => undefined
    });
    await expect(reader.read('https://acme.com/a.xlsx')).rejects.toThrow(/not a document fetch result/);
  });

  it('取件失败的原因原样上抛给引擎', async () => {
    const reader = createTabLinkedDocumentReader({
      pageUrl: () => 'https://acme.com/orders',
      fetchInTab: async () => ({
        channel: DOCUMENT_FETCH_CHANNEL,
        ok: false,
        reason: 'The document responded with HTTP 401.'
      })
    });
    await expect(reader.read('https://acme.com/a.xlsx')).rejects.toThrow(/HTTP 401/);
  });
});

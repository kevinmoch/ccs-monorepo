// @vitest-environment jsdom
/**
 * 页面自己知道的原件直链（0.21.0 分册 12 FR-12.5f / AC-12.14）。
 *
 * 这条通道之所以存在：实测客户站点上 weboffice 是服务端渲染的，
 * 整份 PDF 一个字节都不过网，嗅探器永远空手；而宿主页面的 `downloadurl`
 * 一取就是 `%PDF-1.7`。用例按**纪律**分条写——每一条都是「猜错时不许干什么」。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { findOriginalFileLinks, takeLinkedPdf, takeLinkedPresentation } from '../src/content/mainWorld/webOfficeFileLink';

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
const NOT_PDF = new Uint8Array([0x3c, 0x21, 0x44, 0x4f, 0x43]); // "<!DOC"

/** 只实现被测代码用到的那几个成员：`Response` 在各环境里的可得性不该成为判据的一部分 */
function respond(bytes: Uint8Array, headers: Record<string, string> = {}): unknown {
  return {
    ok: true,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    arrayBuffer: () => Promise.resolve(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
  };
}

const globals: string[] = [];
function pageDefines(name: string, value: unknown): void {
  globals.push(name);
  (window as unknown as Record<string, unknown>)[name] = value;
}

afterEach(() => {
  for (const name of globals.splice(0)) Reflect.deleteProperty(window, name);
  vi.unstubAllGlobals();
});

describe('找出页面握着的原件直链', () => {
  it('认得出客户站点那个 `downloadurl`——它是普通的全局 var，不是什么特殊约定', () => {
    pageDefines('downloadurl', `${location.origin}/ierp/servlet/wps/download?requestkey=abc&fileId=f1`);

    expect(findOriginalFileLinks()).toEqual([`${location.origin}/ierp/servlet/wps/download?requestkey=abc&fileId=f1`]);
  });

  it('跨源的直链不碰：那等于拿用户的 cookie 替页面去别处取件', () => {
    pageDefines('downloadurl', 'https://evil.example.com/steal?requestkey=abc');

    expect(findOriginalFileLinks()).toEqual([]);
  });

  it('非 http(s) 的不碰，`javascript:` / `data:` 一律出局', () => {
    pageDefines('downloadurl', 'javascript:alert(1)');
    pageDefines('fileUrl', 'data:application/pdf;base64,JVBERi0=');

    expect(findOriginalFileLinks()).toEqual([]);
  });

  it('名字不像取件链接的同源字符串一概不试：GET 无副作用只是约定，不是保证', () => {
    pageDefines('apiBase', `${location.origin}/ierp/kapi/purge`);
    pageDefines('nextStepUrl', `${location.origin}/ierp/submit`);

    expect(findOriginalFileLinks()).toEqual([]);
  });

  it('名字像、值不像的一概不试：`isdownload = "2"` 曾被解成 `.../web/2` 并真发了一次请求', async () => {
    pageDefines('isdownload', '2');
    pageDefines('downloadType', 'pdf');
    const fetchMock = vi.fn(() => Promise.resolve(respond(PDF)));
    vi.stubGlobal('fetch', fetchMock);

    expect(findOriginalFileLinks()).toEqual([]);
    await expect(takeLinkedPdf()).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('根相对的写法照收：它指向哪一站是确定的', () => {
    pageDefines('downloadurl', '/ierp/servlet/wps/download?requestkey=abc');

    expect(findOriginalFileLinks()).toEqual([`${location.origin}/ierp/servlet/wps/download?requestkey=abc`]);
  });

  it('候选有上限，页面塞再多也只试前三条', () => {
    for (let i = 0; i < 8; i += 1) pageDefines(`downloadUrl${String(i)}`, `${location.origin}/d/${String(i)}`);

    expect(findOriginalFileLinks()).toHaveLength(3);
  });
});

describe('取回字节', () => {
  it('取到就是取到：带凭据的同源 GET，回来的字节原样交出', async () => {
    pageDefines('downloadurl', `${location.origin}/servlet/wps/download?requestkey=secret`);
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) =>
      Promise.resolve(respond(PDF, { 'content-type': 'application/x-download' }))
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(takeLinkedPdf()).resolves.toEqual(PDF);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'GET', credentials: 'include' });
  });

  it('`Content-Type` 说是 PDF 也不算数，只有 `%PDF-` 字节算', async () => {
    pageDefines('downloadurl', `${location.origin}/servlet/wps/download`);
    vi.stubGlobal('fetch', () => Promise.resolve(respond(NOT_PDF, { 'content-type': 'application/pdf' })));

    await expect(takeLinkedPdf()).resolves.toBeUndefined();
  });

  it('猜错第一条就试下一条，第一条 PDF 出现即停', async () => {
    pageDefines('downloadUrlA', `${location.origin}/a`);
    pageDefines('downloadUrlB', `${location.origin}/b`);
    pageDefines('downloadUrlC', `${location.origin}/c`);
    const fetchMock = vi.fn((url: string) => Promise.resolve(respond(url.endsWith('/b') ? PDF : NOT_PDF)));
    vi.stubGlobal('fetch', fetchMock);

    await expect(takeLinkedPdf()).resolves.toEqual(PDF);
    expect(fetchMock.mock.calls.map((call) => String(call[0]).slice(-2))).toEqual(['/a', '/b']);
  });

  it('声称超过上限的响应体不读：不为一条兜底把页面拖垮', async () => {
    pageDefines('downloadurl', `${location.origin}/huge`);
    const arrayBuffer = vi.fn(() => Promise.resolve(PDF.buffer));
    vi.stubGlobal('fetch', () =>
      Promise.resolve({ ok: true, headers: { get: () => String(9 * 1024 * 1024) }, arrayBuffer })
    );

    await expect(takeLinkedPdf()).resolves.toBeUndefined();
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it('取件失败不外抛：这段代码在别人的页面里跑，抛出去会打断页面自己的初始化', async () => {
    pageDefines('downloadurl', `${location.origin}/boom`);
    vi.stubGlobal('fetch', () => Promise.reject(new Error(`blocked ${location.origin}/boom?requestkey=secret`)));

    await expect(takeLinkedPdf()).resolves.toBeUndefined();
  });
});

/**
 * 演示文稿走同一批候选链接，只是收件标准不同（AC-12.17 第一条）。
 * zip 魔数是**必要不充分**的：只看它等于把任何一个压缩包都当成幻灯片。
 */
describe('演示文稿原件（FR-12.4d）', () => {
  const zipOf = (entryName: string): Uint8Array =>
    Uint8Array.from([0x50, 0x4b, 0x03, 0x04, ...Array.from(entryName, (c) => c.charCodeAt(0))]);

  it('包里报出 ppt/presentation.xml 才算演示文稿', async () => {
    pageDefines('downloadurl', `${location.origin}/servlet/wps/download`);
    const deck = zipOf('ppt/presentation.xml');
    vi.stubGlobal('fetch', () => Promise.resolve(respond(deck)));

    await expect(takeLinkedPresentation()).resolves.toEqual(deck);
  });

  it('只有 zip 魔数的普通压缩包当作没取到', async () => {
    pageDefines('downloadurl', `${location.origin}/servlet/wps/download`);
    vi.stubGlobal('fetch', () => Promise.resolve(respond(zipOf('word/document.xml'))));

    await expect(takeLinkedPresentation()).resolves.toBeUndefined();
  });

  it('PDF 不会被当成演示文稿，演示文稿也不会被当成 PDF', async () => {
    pageDefines('downloadurl', `${location.origin}/servlet/wps/download`);
    const deck = zipOf('ppt/presentation.xml');
    vi.stubGlobal('fetch', () => Promise.resolve(respond(deck)));
    await expect(takeLinkedPdf()).resolves.toBeUndefined();

    vi.stubGlobal('fetch', () => Promise.resolve(respond(PDF)));
    await expect(takeLinkedPresentation()).resolves.toBeUndefined();
  });
});

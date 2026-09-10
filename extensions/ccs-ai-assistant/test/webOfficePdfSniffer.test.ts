// @vitest-environment jsdom
/**
 * PDF 字节窥探（0.21.0 分册 12 FR-12.5b / 12.5c）。
 *
 * 这段代码跑在**别人的页面**里并且包住页面自己的网络调用，
 * 因此用例的重点有两半：一半是「该抄的抄到了」，
 * 另一半是「页面自己的请求没被我们弄坏」——后者出问题是我们制造的故障，比读不到严重。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** `new Uint8Array(n)` 在 TS 5.7+ 里是 `Uint8Array<ArrayBufferLike>`，喂不进 `BodyInit`；显式给它一个 `ArrayBuffer` */
function bytesOf(...values: number[]): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(values.length));
  bytes.set(values);
  return bytes;
}

const PDF = bytesOf(0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37);
const NOT_PDF = bytesOf(0x89, 0x50, 0x4e, 0x47, 0x0d);

let parentPost: ReturnType<typeof vi.fn>;
let takeSniffedPdf: () => Uint8Array | undefined;
let nativeXhr: typeof XMLHttpRequest;
let nativeSend: (body?: unknown) => void;
let nativeOpen: (method: string, url: string | URL, ...rest: unknown[]) => void;

/**
 * jsdom 里 `window.top === window`；嗅探器只装在顶层帧的直接子帧，先把这一帧伪装成子帧。
 *
 * 假顶层帧得有 `length` 与索引：归属完全靠「本帧是 `window.frames` 里的第几个」，
 * 不再靠任何跨窗口消息（DV-18）。`postMessage` 放一个间谍在这里，
 * 就是为了让「我们一条都没发」变成可断言的事实——发一条就会把父帧里的 WPS SDK 打死。
 */
function pretendChildFrame(): void {
  parentPost = vi.fn();
  const fakeTop = { length: 1, 0: window, postMessage: parentPost };
  Object.defineProperty(window, 'top', { configurable: true, value: fakeTop });
  Object.defineProperty(window, 'parent', { configurable: true, value: fakeTop });
}

/** 抄到的字节是异步落到模块里的，而 `takeSniffedPdf` 取一次就清空；轮询时得把结果接住 */
async function waitForSniffed(): Promise<Uint8Array | undefined> {
  let bytes: Uint8Array | undefined;
  await vi.waitFor(() => {
    bytes ??= takeSniffedPdf();
    expect(bytes).toBeDefined();
  });
  return bytes;
}

function respond(bytes: Uint8Array<ArrayBuffer>, contentType: string, url: string): Response {
  const response = new Response(bytes, { headers: { 'content-type': contentType } });
  Object.defineProperty(response, 'url', { value: url });
  return response;
}

async function install(): Promise<void> {
  vi.resetModules();
  const sniffer = await import('../src/content/mainWorld/webOfficePdfSniffer');
  takeSniffedPdf = sniffer.takeSniffedPdf;
  sniffer.installWebOfficePdfSniffer();
}

/** 最小可用的 XHR 替身：真 XHR 在 jsdom 里要走网络，而这里要验的是包装层的行为 */
class FakeXhr extends EventTarget {
  responseType = '';
  response: unknown = null;
  opened: { method: string; url: string } | undefined;
  sentBody: unknown;
  headers: Record<string, string> = {};
  /** 由用例摆好，`send` 时原样交出去 */
  static nextResponse: unknown = null;
  static nextHeaders: Record<string, string> = {};

  open(method: string, url: string | URL): void {
    this.opened = { method, url: String(url) };
  }
  send(body?: unknown): void {
    this.sentBody = body;
    this.response = FakeXhr.nextResponse;
    this.headers = FakeXhr.nextHeaders;
    this.dispatchEvent(new Event('load'));
  }
  getResponseHeader(name: string): string | null {
    return this.headers[name.toLowerCase()] ?? null;
  }
}

beforeEach(() => {
  parentPost = vi.fn();
  nativeXhr = window.XMLHttpRequest;
  // 嗅探器改的是**原型**，而 FakeXhr 是模块级的：不还原的话下一个用例会跑在
  // 「被包了两层」的 send 上，一次请求出两份字节，看起来像重复外发
  nativeSend = FakeXhr.prototype.send;
  nativeOpen = FakeXhr.prototype.open;
  FakeXhr.nextResponse = null;
  FakeXhr.nextHeaders = {};
});

afterEach(() => {
  window.XMLHttpRequest = nativeXhr;
  FakeXhr.prototype.send = nativeSend;
  FakeXhr.prototype.open = nativeOpen;
  Reflect.deleteProperty(window, 'top');
  Reflect.deleteProperty(window, 'parent');
});

describe('fetch 侧', () => {
  it('顶层帧不装：文档 iframe 才是字节流过的地方', async () => {
    const original = window.fetch;

    await install();

    expect(window.fetch).toBe(original);
  });

  it('更深的帧也不装：它在顶层帧的 frames 里没有位置，抄了也认领不到（DV-18）', async () => {
    const original = window.fetch;
    const fakeTop = { length: 0 };
    Object.defineProperty(window, 'top', { configurable: true, value: fakeTop });
    Object.defineProperty(window, 'parent', { configurable: true, value: { length: 1, 0: window } });

    await install();

    expect(window.fetch).toBe(original);
  });

  it('以 %PDF- 开头的响应被抄下来，取一次就没了', async () => {
    pretendChildFrame();
    window.fetch = (): Promise<Response> => Promise.resolve(respond(PDF, 'application/pdf', 'https://w.test/a.pdf'));
    await install();

    await window.fetch('https://w.test/a.pdf');
    const bytes = await waitForSniffed();

    expect([...bytes!]).toEqual([...PDF]);
    expect(takeSniffedPdf()).toBeUndefined();
  });

  it('整个过程一条跨窗口消息都不发（DV-18）', async () => {
    pretendChildFrame();
    const selfPost = vi.spyOn(window, 'postMessage');
    window.fetch = (): Promise<Response> => Promise.resolve(respond(PDF, 'application/pdf', 'https://w.test/a.pdf'));
    await install();

    // 装载时没发握手，抄到字节之后也没发：父帧里的 WPS SDK 收到任何一条就会坏掉
    expect(parentPost).not.toHaveBeenCalled();
    await window.fetch('https://w.test/a.pdf');
    await waitForSniffed();

    expect(parentPost).not.toHaveBeenCalled();
    expect(selfPost).not.toHaveBeenCalled();
  });

  it('Content-Type 说是 PDF 但字节不是，就不抄（FR-12.5c）', async () => {
    pretendChildFrame();
    window.fetch = (): Promise<Response> =>
      Promise.resolve(respond(NOT_PDF, 'application/pdf', 'https://w.test/a.pdf'));
    await install();

    await window.fetch('https://w.test/a.pdf');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(takeSniffedPdf()).toBeUndefined();
  });

  it('页面自己仍拿到可读的响应体', async () => {
    pretendChildFrame();
    window.fetch = (): Promise<Response> => Promise.resolve(respond(PDF, 'application/pdf', 'https://w.test/a.pdf'));
    await install();

    const bytes = new Uint8Array(await (await window.fetch('https://w.test/a.pdf')).arrayBuffer());

    expect([...bytes]).toEqual([...PDF]);
  });

  it('与 PDF 无关的请求不被 clone', async () => {
    pretendChildFrame();
    let cloned = 0;
    window.fetch = (): Promise<Response> => {
      const response = respond(NOT_PDF, 'image/png', 'https://w.test/page-1.png');
      const nativeClone = response.clone.bind(response);
      response.clone = (): Response => {
        cloned += 1;
        return nativeClone();
      };
      return Promise.resolve(response);
    };
    await install();

    await window.fetch('https://w.test/page-1.png');

    expect(cloned).toBe(0);
  });
});

describe('XHR 侧（FR-12.5b 点名的第二条）', () => {
  it('arraybuffer 且魔数正确的 PDF 被抄下来', async () => {
    pretendChildFrame();
    window.XMLHttpRequest = FakeXhr as unknown as typeof XMLHttpRequest;
    FakeXhr.nextResponse = PDF.buffer;
    FakeXhr.nextHeaders = { 'content-type': 'application/pdf' };
    await install();

    const xhr = new window.XMLHttpRequest();
    xhr.responseType = 'arraybuffer';
    xhr.open('GET', 'https://w.test/a.pdf');
    xhr.send();

    const bytes = await waitForSniffed();
    expect([...bytes!]).toEqual([...PDF]);
    expect(parentPost).not.toHaveBeenCalled();
  });

  it('responseType 不是 arraybuffer 时不去读响应，免得多一份拷贝', async () => {
    pretendChildFrame();
    window.XMLHttpRequest = FakeXhr as unknown as typeof XMLHttpRequest;
    FakeXhr.nextResponse = PDF.buffer;
    FakeXhr.nextHeaders = { 'content-type': 'application/pdf' };
    await install();

    const xhr = new window.XMLHttpRequest();
    xhr.open('GET', 'https://w.test/a.pdf');
    xhr.send();

    expect(takeSniffedPdf()).toBeUndefined();
  });

  it('页面自己的 load 回调与 open 参数都不受影响', async () => {
    pretendChildFrame();
    window.XMLHttpRequest = FakeXhr as unknown as typeof XMLHttpRequest;
    FakeXhr.nextResponse = PDF.buffer;
    FakeXhr.nextHeaders = { 'content-type': 'application/pdf' };
    await install();

    const seen: string[] = [];
    const xhr = new window.XMLHttpRequest() as unknown as FakeXhr;
    xhr.responseType = 'arraybuffer';
    xhr.addEventListener('load', () => seen.push('page'));
    xhr.open('POST', 'https://w.test/a.pdf');
    xhr.send('body');

    expect(seen).toEqual(['page']);
    expect(xhr.opened).toEqual({ method: 'POST', url: 'https://w.test/a.pdf' });
    expect(xhr.sentBody).toBe('body');
  });
});

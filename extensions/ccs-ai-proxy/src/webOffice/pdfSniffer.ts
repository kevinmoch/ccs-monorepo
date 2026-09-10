/**
 * PDF 字节窥探（0.21.0 分册 12，读取路线的第 ② 级）。
 *
 * 只装在**顶层帧的直接子帧**：WPS 的文档 iframe 自己去取 PDF，那份字节从我们这边过一次，
 * 抄下来就能用 pdf.js 抽出带位置的文本——比截屏后 OCR 准得多，也比什么都读不到强。
 *
 * ## 三条纪律
 *
 * 1. **先判断值不值得，再 clone**：clone 一份响应意味着整份内容在内存里多一份，
 *    对所有请求都这么干，重的站点会被我们拖垮。
 * 2. **只认 `%PDF-` 开头**：`Content-Type` 是服务器说的，不能当事实用。
 * 3. **失败即放弃**：任何异常都吞掉并原样返回响应。我们在别人的页面里，
 *    读不到 PDF 的后果只是降级到截屏；把页面自己的请求搞坏则是我们制造的故障。
 */

import { frameIndexInTop } from './frameIndex';

/** 超过这个大小不抄：再大的文档走截屏更划算，也免得一条消息把页面卡住 */
export const MAX_PDF_BYTES = 8 * 1024 * 1024;

/**
 * 抄到的字节就地存着，**一条跨窗口消息都不发**（DV-18）。
 *
 * 父帧里住着 WPS SDK，而它的应答分发器收到**任何**一条 message 就会把自己的
 * 请求队列推错位。DV-17 当时以为握手发在 `document_start` 就落在「早发无害」区间里，
 * 实际上恰好相反：本帧之所以存在，就是因为 SDK 刚刚在 `renderWebOffice` 里建了它，
 * 那一瞬正是它在等自己的帧回话。真实站点上的后果是整份文档直接打不开。
 *
 * 现在反过来：字节留在本帧等宿主来取，两侧各自算一次帧序号来对上是哪一帧（`frameIndexInTop`）。
 */
let captured: Uint8Array | undefined;

/** 取走本帧抄到的字节。取一次就没了：一份字节只能当一次读取的依据 */
export function takeSniffedPdf(): Uint8Array | undefined {
  const bytes = captured;
  captured = undefined;
  return bytes;
}

function looksLikePdfRequest(url: string, contentType: string | null): boolean {
  if (contentType !== null && contentType.includes('pdf')) return true;
  const path = url.split('?')[0] ?? '';
  return path.toLowerCase().endsWith('.pdf');
}

function publish(bytes: Uint8Array): void {
  captured = bytes;
}

/** `%PDF-` 魔数。`Content-Type` 是服务器说的，只有字节本身能作数 */
export function hasPdfMagic(bytes: Uint8Array): boolean {
  return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
}

async function sniff(response: Response): Promise<void> {
  try {
    const length = response.headers.get('content-length');
    if (length !== null && Number(length) > MAX_PDF_BYTES) return;
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_PDF_BYTES) return;
    const bytes = new Uint8Array(buffer);
    // 魔数校验放在这里而不是发出去之后：不是 PDF 就没有理由把页面的字节送出这一帧
    if (!hasPdfMagic(bytes)) return;
    publish(bytes);
  } catch {
    // 流被别处消费掉、或响应体不可读；放弃
  }
}

/**
 * XHR 侧（FR-12.5b 点名了 `fetch` 与 `XMLHttpRequest` 两条）。
 *
 * 与 fetch 侧的差别：XHR 没有 `clone()`，只能在 `load` 之后读 `xhr.response`，
 * 且只有 `responseType === 'arraybuffer'` 时读得到字节。页面若用 `blob`，
 * 读它要异步且会多一份拷贝——那种情况让给截屏，不为一条兜底把页面拖慢。
 */
function installXhrSniffer(): void {
  const nativeOpen = XMLHttpRequest.prototype.open;
  const nativeSend = XMLHttpRequest.prototype.send;
  type Tracked = XMLHttpRequest & { __webOfficeUrl?: string };

  XMLHttpRequest.prototype.open = function patchedOpen(
    this: Tracked,
    method: string,
    url: string | URL,
    ...rest: unknown[]
  ): void {
    this.__webOfficeUrl = String(url);
    (nativeOpen as unknown as (this: XMLHttpRequest, ...a: unknown[]) => void).call(this, method, url, ...rest);
  } as typeof XMLHttpRequest.prototype.open;

  XMLHttpRequest.prototype.send = function patchedSend(
    this: Tracked,
    body?: Parameters<XMLHttpRequest['send']>[0]
  ): void {
    this.addEventListener('load', () => {
      try {
        if (this.responseType !== 'arraybuffer') return;
        const url = this.__webOfficeUrl ?? '';
        if (!looksLikePdfRequest(url, this.getResponseHeader('content-type'))) return;
        const buffer: unknown = this.response;
        if (!(buffer instanceof ArrayBuffer) || buffer.byteLength > MAX_PDF_BYTES) return;
        const bytes = new Uint8Array(buffer);
        if (!hasPdfMagic(bytes)) return;
        publish(bytes);
      } catch {
        // 跨源 XHR 读不到响应；放弃
      }
    });
    nativeSend.call(this, body ?? null);
  };
}

export function installWebOfficePdfSniffer(): void {
  // 只装在顶层帧的**直接子帧**：实例登记在顶层帧，更深的帧在它的 `frames` 里没有位置，
  // 抄下来也无从认领——不如不包页面的网络调用
  if (frameIndexInTop() === undefined) return;
  const nativeFetch = window.fetch;
  if (typeof nativeFetch === 'function') {
    window.fetch = function patchedFetch(this: unknown, ...args: Parameters<typeof fetch>): Promise<Response> {
      const promise = nativeFetch.apply(this ?? window, args) as Promise<Response>;
      return promise.then((response) => {
        try {
          if (looksLikePdfRequest(response.url, response.headers.get('content-type'))) {
            // clone 必须在页面自己读之前做，且只对值得看的响应做
            void sniff(response.clone());
          }
        } catch {
          // clone 失败（body 已被读）不影响页面拿到原响应
        }
        return response;
      });
    } as typeof fetch;
  }
  installXhrSniffer();
}

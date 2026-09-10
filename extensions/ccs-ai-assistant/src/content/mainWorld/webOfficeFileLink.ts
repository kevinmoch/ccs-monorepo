/**
 * 页面自己知道的原件直链（0.21.0 分册 12 FR-12.5f，读取路线的第 ②b 级）。
 *
 * WPS 的 weboffice 是**服务端渲染**的：正常浏览一份 PDF，整份文件一个字节都不过网。
 * 所以 `webOfficePdfSniffer` 在这类站点上永远抓不到东西，读取只能退到「截当前一屏」——
 * 用户看到的症状就是「让它翻下一页，它跑去够阅读器左下角的翻页箭头」。
 *
 * 但宿主页面自己往往握着一条原件直链。实测客户站点的 `wpsIndex.html`：
 *
 * ```js
 * downloadurl = origin + "/ierp/servlet/wps/download?requestkey=" + token + "&fileId=" + docid;
 * function downloadfile() { window.open(downloadurl, '_self'); }
 * ```
 *
 * 右上角那个下载图标点的就是它。取回来的字节交给既有的 ⓪ 级逐页读取，
 * 翻页照旧走 `from` 游标——不需要教模型去点任何东西。
 *
 * ## 四条纪律
 *
 * 1. **只同源、只 GET**：跨源直链不碰，那等于拿用户的 cookie 替页面去别处取件。
 * 2. **只认 `%PDF-` 字节**：猜错的代价必须是「什么也没拿到」，
 *    而不是「拿了一份别的东西冒充这份文档」。
 * 3. **链接本身不出这一帧**：那条 URL 里带着 `requestkey`，是**凭据**（分册 13 §4.1）。
 *    只把字节交出去；URL 不进日志、不进审计、不进错误消息。
 * 4. **只在嗅探器空手时才找**：正常站点上一次多余请求都不会发出。
 */

import { MAX_PDF_BYTES, hasPdfMagic } from './webOfficePdfSniffer';

/** 最多试几条。猜错要付一次请求，代价得有上限 */
const MAX_CANDIDATES = 3;

/**
 * 变量名里出现这些词，才当它是一条取件链接。
 *
 * 卡在名字上而不是只看 URL 形状：GET **按约定**无副作用，但那只是约定，
 * 页面上任何一个同源字符串都拿去试一遍是我们不该替用户做的决定。
 */
const LINK_NAME_HINT = /download|fileurl|origin(al)?url|docurl/i;

/**
 * 值本身还得**长得像**一条链接。只靠「`new URL` 解析得出且同源」不成立：
 * 相对解析会把**任何**字符串都变成一条同源 URL。实测客户站点上的
 * `isdownload = "2"` 名字命中了关键词，于是被解成 `.../web/2` 并真的发了一次 GET（回 404），
 * 直接违反上面第 4 条纪律。只认绝对 `http(s)://` 与根相对 `/…` 两种写法：
 * 漏掉一条写成相对路径的真链接，代价是退回截屏；试错一条，代价是在别人站上发请求。
 */
const LINK_VALUE_SHAPE = /^(?:https?:\/\/|\/)/;

function sameOriginHttp(raw: string): string | undefined {
  try {
    const url = new URL(raw, location.href);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
    if (url.origin !== location.origin) return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

/** 宿主页面全局里像「原件直链」的那几个。顺序取 `Object.keys`，同一页面每次一致 */
export function findOriginalFileLinks(): string[] {
  const found: string[] = [];
  for (const name of Object.keys(window)) {
    if (found.length >= MAX_CANDIDATES) break;
    if (!LINK_NAME_HINT.test(name)) continue;
    let value: unknown;
    try {
      value = (window as unknown as Record<string, unknown>)[name];
    } catch {
      continue; // 取值就抛的属性（跨源 frame 的代理之类）跳过
    }
    if (typeof value !== 'string' || !LINK_VALUE_SHAPE.test(value)) continue;
    const href = sameOriginHttp(value);
    if (href !== undefined && !found.includes(href)) found.push(href);
  }
  return found;
}

async function fetchOriginal(
  href: string,
  accept: (bytes: Uint8Array) => boolean
): Promise<Uint8Array | undefined> {
  const response = await fetch(href, { method: 'GET', credentials: 'include' });
  if (!response.ok) return undefined;
  const length = response.headers.get('content-length');
  if (length !== null && Number(length) > MAX_PDF_BYTES) return undefined;
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > MAX_PDF_BYTES) return undefined;
  const bytes = new Uint8Array(buffer);
  // `Content-Type` 是服务器说的（实测这条直链回的是 `application/x-download`），
  // 只有字节本身能作数
  return accept(bytes) ? bytes : undefined;
}

/** 逐条试，第一条取到 PDF 就停。全试完还没有就返回 `undefined`，上层降级到截屏 */
export async function takeLinkedPdf(): Promise<Uint8Array | undefined> {
  return await takeLinked(hasPdfMagic);
}

/**
 * 演示文稿原件（FR-12.4d）。候选链接与 PDF 同一批，只是收件标准不同。
 *
 * 只看 zip 魔数会把任何一个压缩包都当成幻灯片，所以还要确认包里真有
 * `ppt/presentation.xml`。zip 的条目名是**明文**存的，不解包就能确认；
 * 严格校验（真能解出那一部件）在解包那一侧做，那里本来就要解包。
 */
export async function takeLinkedPresentation(): Promise<Uint8Array | undefined> {
  return await takeLinked(looksLikePresentation);
}

async function takeLinked(accept: (bytes: Uint8Array) => boolean): Promise<Uint8Array | undefined> {
  for (const href of findOriginalFileLinks()) {
    try {
      const bytes = await fetchOriginal(href, accept);
      if (bytes !== undefined) return bytes;
    } catch {
      // 网络失败、被 CSP 挡下、响应体读不了：换下一条
    }
  }
  return undefined;
}

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];
const PRESENTATION_ENTRY = 'ppt/presentation.xml';

export function looksLikePresentation(bytes: Uint8Array): boolean {
  if (!ZIP_MAGIC.every((byte, index) => bytes[index] === byte)) return false;
  return containsAscii(bytes, PRESENTATION_ENTRY);
}

function containsAscii(bytes: Uint8Array, needle: string): boolean {
  const pattern = Array.from(needle, (character) => character.charCodeAt(0));
  outer: for (let start = 0; start + pattern.length <= bytes.length; start += 1) {
    for (let offset = 0; offset < pattern.length; offset += 1) {
      if (bytes[start + offset] !== pattern[offset]) continue outer;
    }
    return true;
  }
  return false;
}

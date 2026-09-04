import { DOCUMENT_FETCH_CHANNEL } from './messages';
import type { DocumentFetchResult } from './messages';

/** 取件上限；超限如实报错而不是截断——半个 xlsx 解不出来，只会让模型以为文件损坏 */
export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;

/**
 * 内容脚本侧的取件（分册 17 FR-17.1 / D-17-1）。
 *
 * 单独一个文件而不是和 `linkedDocuments.ts` 放一起：那边要 import `tldts`
 * 做注册域判定，而内容脚本注进**每一个页面的每一帧**，多背一份 PSL 快照没有道理。
 *
 * 同注册域闸门在 side panel 侧过（`fetchGate.ts`），这里**不复判**——
 * 内容脚本跑在页面的 renderer 里，被 XSS 的页面能改它的行为，
 * 闸门放在这一侧等于没放。
 */
export async function fetchDocumentInPage(url: string): Promise<DocumentFetchResult> {
  const fail = (reason: string): DocumentFetchResult => ({ channel: DOCUMENT_FETCH_CHANNEL, ok: false, reason });
  try {
    // `credentials: 'include'` 是这条路径存在的**全部理由**：业务系统的附件几乎都要登录态，
    // 而 side panel 跑在 chrome-extension:// 源下，它的 fetch 带的是扩展自己的 cookie jar
    const response = await fetch(url, { credentials: 'include' });
    if (!response.ok) {
      return fail(`The document responded with HTTP ${response.status}.`);
    }
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_DOCUMENT_BYTES) {
      return fail(
        `The document is ${buffer.byteLength} bytes, over the ${MAX_DOCUMENT_BYTES}-byte limit for linked documents.`
      );
    }
    return {
      channel: DOCUMENT_FETCH_CHANNEL,
      ok: true,
      // content-type 缺失时不猜格式：上游按「不支持的类型」明确拒绝，
      // 比把二进制当文本塞给模型好
      mimeType: response.headers.get('content-type') ?? 'application/octet-stream',
      data: toBase64(new Uint8Array(buffer))
    };
  } catch (e) {
    return fail(`Fetching the document failed: ${e instanceof Error ? e.message : String(e)}.`);
  }
}

/** 二进制转 base64；`btoa` 只吃 latin1，必须逐字节喂而不是先 decode 成字符串 */
function toBase64(bytes: Uint8Array): string {
  let binary = '';
  // 分块喂：`String.fromCharCode(...bytes)` 在几 MB 的附件上会直接爆栈
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

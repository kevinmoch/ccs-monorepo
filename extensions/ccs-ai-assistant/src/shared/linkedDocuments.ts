import { WebSkillError } from '@webskill/core';
import type { LinkedDocumentReader } from '@webskill/runtime';
import { checkFetchAllowed } from './fetchGate';
import { isDocumentFetchResult } from './messages';

/**
 * 带页面登录态的链接文档读取（分册 17 FR-17.1 / D-17-1）。
 *
 * 取件交给**内容脚本**而不是 side panel 直接 `fetch`：业务系统的附件几乎都要登录态，
 * 而 side panel 跑在 `chrome-extension://` 源下，它的 `fetch` 带的是扩展自己的 cookie jar，
 * 不是用户在那个站点上的会话。结果就是 401/403 或者一张登录页的 HTML ——
 * 模型拿到的是「读到了内容」，内容却是登录页，比失败更坏。
 *
 * 取不到时**不静默降级**：调用方拿到的是带原因的错误（FR-17.3 的回退由装配层决定）。
 */
export interface TabLinkedDocumentOptions {
  /** 当前绑定 tab 的地址；同注册域判定的基准 */
  pageUrl: () => string | undefined;
  /** 向绑定 tab 的主帧投递一次取件请求 */
  fetchInTab: (url: string) => Promise<unknown>;
}

export function createTabLinkedDocumentReader(options: TabLinkedDocumentOptions): LinkedDocumentReader {
  return {
    // origin 交给引擎做同源判定（跨源要用户确认）；这里给的是**页面**的 origin，
    // 不是扩展的——引擎判的是「模型要读的东西是不是用户正在看的那个站点的」
    get origin(): string | undefined {
      const pageUrl = options.pageUrl();
      if (pageUrl === undefined) return undefined;
      try {
        return new URL(pageUrl).origin;
      } catch {
        return undefined;
      }
    },

    async read(url: string): Promise<{ mimeType: string; bytes: Uint8Array }> {
      const gate = checkFetchAllowed(url, options.pageUrl());
      if (!gate.allowed) {
        throw new WebSkillError('TOOL_EXECUTION_FAILED', gate.reason ?? 'The document is outside the allowed site.');
      }

      const raw = await options.fetchInTab(url);
      if (!isDocumentFetchResult(raw)) {
        throw new WebSkillError(
          'TOOL_EXECUTION_FAILED',
          'The content script returned a payload that is not a document fetch result.'
        );
      }
      if (!raw.ok) {
        throw new WebSkillError('TOOL_EXECUTION_FAILED', raw.reason);
      }
      return { mimeType: raw.mimeType, bytes: fromBase64(raw.data) };
    }
  };
}

/** `toBase64` 的逆；跨上下文传回来的附件字节靠它还原 */
function fromBase64(data: string): Uint8Array {
  return Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
}

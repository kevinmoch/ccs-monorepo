import { getDomain } from 'tldts';

/**
 * 链接文档的取件闸门（分册 17 FR-17.2）。
 *
 * 判定放在**side panel 侧**而不是内容脚本里：内容脚本跑在页面的 renderer 里，
 * 被 XSS 的页面能改它的行为；闸门必须在页面碰不到的那一侧。
 */

/** 取件上限见 `documentFetch.ts`：那是真正执行取件的一侧，常量跟着使用方走 */

export interface FetchGateResult {
  allowed: boolean;
  /** 拒绝理由；英文，会进模型上下文并被转述给用户 */
  reason?: string;
}

/**
 * 注册域（eTLD+1）。
 *
 * 用 `tldts` 而不是「取最后两段」：后者在 `.com.cn` / `.co.uk` 上必错，
 * 且错的方向是**放宽**——会把 `evil.com.cn` 判成与 `victim.com.cn` 同域。
 * 它带的是一份随构建固化的 Public Suffix List 快照（AGENTS.md：禁止手写协议解析器）。
 */
function registrableDomainOf(url: URL): string | undefined {
  return getDomain(url.hostname) ?? undefined;
}

/**
 * 允许取这个地址吗。
 *
 * 判据是「与**当前绑定 tab** 同注册域」而不是同源（D-17-2 复核放宽）：
 * 业务系统的附件普遍挂在 `files.x.com` / CDN 子域上，严格同源会把正常场景全挡掉。
 * 但注册域是边界的**尽头**——跨到别的注册域就不再是同一个责任主体。
 */
export function checkFetchAllowed(target: string, pageUrl: string | undefined): FetchGateResult {
  if (pageUrl === undefined) {
    return { allowed: false, reason: 'No tab is bound, so there is no page to inherit the session from.' };
  }
  let url: URL;
  let page: URL;
  try {
    url = new URL(target);
    page = new URL(pageUrl);
  } catch {
    return { allowed: false, reason: `"${target}" is not a valid absolute URL.` };
  }
  // file: / chrome-extension: / data: 一律拒绝：它们没有「站点」可言，
  // 而扩展的取件权限比页面大得多，放行等于把本地文件系统接到模型上
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { allowed: false, reason: `Only http(s) documents can be read; "${url.protocol}" is not allowed.` };
  }
  if (page.protocol === 'https:' && url.protocol === 'http:') {
    // 降级取件会把带 cookie 的请求发到明文信道上
    return {
      allowed: false,
      reason: `The page is https but the document is http; reading it would downgrade the connection.`
    };
  }

  const pageDomain = registrableDomainOf(page);
  const targetDomain = registrableDomainOf(url);
  if (pageDomain === undefined || targetDomain === undefined) {
    // IP 地址、`localhost`、内网单标签主机名都落在这里：PSL 给不出注册域。
    // 退回严格同站，宁可多问一次也不放宽
    if (page.host !== url.host) {
      return {
        allowed: false,
        reason:
          `"${url.host}" has no registrable domain (it may be an IP address or an intranet host), ` +
          `so only documents on exactly "${page.host}" can be read.`
      };
    }
    return { allowed: true };
  }
  if (pageDomain !== targetDomain) {
    return {
      allowed: false,
      reason:
        `"${url.host}" is outside the bound tab's site ("${pageDomain}"). ` +
        `Ask the user to bind the side panel to a tab on that site first.`
    };
  }
  return { allowed: true };
}

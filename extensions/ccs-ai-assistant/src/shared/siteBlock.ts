/**
 * 被站点白名单挡下之后的两句话：一句给模型，一句给用户。
 *
 * 单独成文件而不是留在 `assembly.ts` 里，是因为后者拖着 `virtual:webskill-config`
 * 这条构建期虚拟模块，跨不过测试环境；而这两句话恰恰是最该被钉住的部分。
 */
import type { TabBindingSnapshot } from './tabBinding';

/** 取主机名；畸形地址原样回报比吞掉强 */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/**
 * 被白名单挡下时给模型的说明。返回 `undefined` 表示「不是白名单的事」，
 * 由调用方沿用它原本的措辞——把两种原因合成一句会让用户按错的方向去排查。
 *
 * 必须写明「不读也不操作」：只说一句失败，模型会换个工具接着试。
 */
export function describeSiteBlock(snapshot: TabBindingSnapshot, allowedHosts: readonly string[]): string | undefined {
  if (snapshot.blockedUrl === undefined) return undefined;
  return (
    `This assistant is restricted to an allowlist of sites, and "${hostOf(snapshot.blockedUrl)}" is not on it. ` +
    `It will not read or act on this page. Allowed: ${allowedHosts.join(', ')}.`
  );
}

/** 同一件事的界面说法，双语。`undefined` 即当前页没有被拦 */
export function siteBlockNotice(snapshot: TabBindingSnapshot, locale: 'en' | 'zh'): string | undefined {
  if (snapshot.blockedUrl === undefined) return undefined;
  const host = hostOf(snapshot.blockedUrl);
  return locale === 'zh'
    ? `当前站点「${host}」不在允许列表内，助手不会读取也不会操作这一页。`
    : `“${host}” is not on the allowlist. The assistant will not read or act on this page.`;
}

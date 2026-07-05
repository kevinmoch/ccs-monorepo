/**
 * URL 配置
 *
 * 启动流程：main.ts 中调用 initUrlConfig() → 加载 url-config.json →
 * 各页面通过 getIframeUrl('<页面文件夹名>') 同步获取配置。
 *
 * 部署后修改 dist/url-config.json 即可切换 URL，无需重新构建。
 */

export type UrlConfig = Record<string, string>;

let _config: UrlConfig | null = null;

/**
 * 初始化 URL 配置（必须在 app.mount() 之前调用）
 */
export async function initUrlConfig(): Promise<void> {
  const response = await fetch(`${import.meta.env.BASE_URL}url-config.json`);
  if (!response.ok) {
    throw new Error(`加载 URL 配置失败: HTTP ${response.status}`);
  }
  _config = await response.json();
}

/**
 * 获取完整 URL 配置（同步，需先调用 initUrlConfig）
 */
export function getUrlConfig(): UrlConfig {
  if (!_config) {
    throw new Error('URL 配置尚未初始化，请先调用 initUrlConfig()');
  }
  return _config;
}

/**
 * 获取指定页面的 iframe URL（同步，需先调用 initUrlConfig）
 *
 * 拼接规则：CCS_BASE_URL（环境变量） + url-config.json 中配置的相对路径。
 * 例如 CCS_BASE_URL=https://ccs.huaweicloud.com/CCS_Tenant_Gray，
 * 配置值为 /ierp/?formId=xxx，最终返回完整 URL。
 *
 * @param page - 页面标识，如 'ccs-module-common/settings'
 */
export function getIframeUrl(page: string): string {
  const path = _config?.[page] ?? '';
  if (!path) return '';
  const baseUrl = import.meta.env.CCS_BASE_URL || '';
  return `${baseUrl}${path}`;
}

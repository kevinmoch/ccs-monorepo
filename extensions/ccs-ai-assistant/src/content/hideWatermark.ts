import { CCS_HOSTS } from '../shared/ccsHosts';

const STYLE_ID = 'ccs-ai-hide-watermark';

/**
 * 隐藏 CCS 自家页面上的全屏平铺水印（移植自 ccs-ai-proxy）。
 *
 * ERP 子系统页会往 body 挂一层全屏平铺水印（inline style：data:image/png 平铺背景 +
 * pointer-events:none + 高 z-index，类名是每次构建可变的哈希）。它盖在正文之上，
 * 既影响阅读，也会污染视觉通道拿到的画面。
 *
 * 用声明式 CSS 而不是删节点：页面带防篡改逻辑，节点被 remove 后会被重建，而
 * display:none 不触发重建；CSS 规则常驻 <head>，页面重建多少次节点都依然被盖住，
 * 也无需 MutationObserver 轮询。选择器按「inline style 特征」匹配而非哈希类名，
 * 对 ERP 侧换类名免疫。
 *
 * 只在 CCS 自家 host 上生效（清单由 `.env` 生成），用户浏览的其他站点不留任何痕迹。
 */
export function hideCcsWatermark(): void {
  if (!CCS_HOSTS.includes(location.host)) return;
  if (document.getElementById(STYLE_ID) !== null) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent =
    'body > div[style*="data:image/png"][style*="pointer-events: none"] { display: none !important; }';
  (document.head ?? document.documentElement).appendChild(style);
}

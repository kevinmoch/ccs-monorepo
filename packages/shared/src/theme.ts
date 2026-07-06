export type ThemeMode = 'light' | 'dark';
export interface ThemeTokens {
  mode: ThemeMode;
  primaryColor: string;
  background: string;
  text: string;
}
export const themeTokens: Record<ThemeMode, ThemeTokens> = {
  light: { mode: 'light', primaryColor: '#006fd6', background: '#f8fafc', text: '#0f172a' },
  dark: { mode: 'dark', primaryColor: '#46a3ff', background: '#0f172a', text: '#e2e8f0' }
};
/** 卡片背景色，与首页 (ccs-framework) 保持统一 */
const cardBackground: Record<ThemeMode, string> = {
  light: '#ffffff',
  dark: '#191919'
};
/** 链接文字颜色，与首页 (ccs-framework) 保持统一 */
const linkColor: Record<ThemeMode, string> = {
  light: '#2563eb',
  dark: '#46A3FF'
};
export function applyTheme(mode: ThemeMode, root: HTMLElement = document.documentElement) {
  const tokens = themeTokens[mode];
  root.dataset.theme = mode;
  root.classList.toggle('dark', mode === 'dark');
  root.style.setProperty('--ccs-primary', tokens.primaryColor);
  root.style.setProperty('--ccs-bg', tokens.background);
  root.style.setProperty('--ccs-text', tokens.text);
  root.style.setProperty('--ccs-card-background', cardBackground[mode]);
  root.style.setProperty('--ccs-link-color', linkColor[mode]);
  root.style.setProperty('--ccs-link-hover-color', linkColor[mode]);
}

export type ThemeMode = 'light' | 'dark';
export interface ThemeTokens {
  mode: ThemeMode;
  primaryColor: string;
  background: string;
  text: string;
}
export const themeTokens: Record<ThemeMode, ThemeTokens> = {
  light: { mode: 'light', primaryColor: '#2563eb', background: '#f8fafc', text: '#0f172a' },
  dark: { mode: 'dark', primaryColor: '#60a5fa', background: '#0f172a', text: '#e2e8f0' }
};
export function applyTheme(mode: ThemeMode, root: HTMLElement = document.documentElement) {
  const tokens = themeTokens[mode];
  root.dataset.theme = mode;
  root.classList.toggle('dark', mode === 'dark');
  root.style.setProperty('--ccs-primary', tokens.primaryColor);
  root.style.setProperty('--ccs-bg', tokens.background);
  root.style.setProperty('--ccs-text', tokens.text);
}

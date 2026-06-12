import { applyTheme, CCS_EVENTS, initI18n, type Language, type ThemeMode } from '@ccs/shared';
import type { CcsRuntimeProps } from './index';

export interface IframeRuntimeOptions {
  onTheme?: (theme: ThemeMode) => void;
  onLanguage?: (language: Language) => void;
  onNavigate?: (routePath: string) => void;
}

function normalizeTheme(value: unknown): ThemeMode | undefined {
  return value === 'dark' || value === 'light' ? value : undefined;
}

function normalizeLanguage(value: unknown): Language | undefined {
  if (value === 'zh-CN' || value === 'zh') return 'zh-CN';
  if (value === 'en-US' || value === 'en') return 'en-US';
  return undefined;
}

export function readIframeProps(win: Window = window): Partial<CcsRuntimeProps> {
  const params = new URLSearchParams(win.location.search);
  const theme = normalizeTheme(params.get('__ccs_theme'));
  const language = normalizeLanguage(params.get('__ccs_language'));
  const routePath = params.get('__ccs_route') ?? undefined;
  return { ...(theme ? { theme } : {}), ...(language ? { language } : {}), ...(routePath ? { routePath } : {}) };
}

export async function applyRuntimeProps(props: Partial<CcsRuntimeProps>) {
  if (props.theme) applyTheme(props.theme);
  await initI18n(props.language);
}

export function bindIframeMessageHandlers(options: IframeRuntimeOptions, win: Window = window) {
  const handler = (event: MessageEvent) => {
    const data = event.data;
    if (!data || typeof data !== 'object') return;

    if (data.type === 'SYNC_STATE') {
      const payload = data.payload ?? {};
      const theme = normalizeTheme(payload.theme ?? (typeof payload.isDark === 'boolean' ? (payload.isDark ? 'dark' : 'light') : undefined));
      const language = normalizeLanguage(payload.language);
      if (theme) options.onTheme?.(theme);
      if (language) options.onLanguage?.(language);
      return;
    }

    if (data.type === 'CCS_NAVIGATE' && typeof data.routePath === 'string') {
      options.onNavigate?.(data.routePath);
      return;
    }

    if (data.type !== 'CCS_EVENT') return;
    if (data.event === CCS_EVENTS.THEME_CHANGE) {
      const theme = normalizeTheme(data.payload?.theme);
      if (theme) options.onTheme?.(theme);
    }
    if (data.event === CCS_EVENTS.LANGUAGE_CHANGE) {
      const language = normalizeLanguage(data.payload?.language);
      if (language) options.onLanguage?.(language);
    }
    if (data.event === CCS_EVENTS.NAVIGATE && typeof data.payload?.routePath === 'string') {
      options.onNavigate?.(data.payload.routePath);
    }
  };
  win.addEventListener('message', handler);
  return () => {
    win.removeEventListener('message', handler);
  };
}

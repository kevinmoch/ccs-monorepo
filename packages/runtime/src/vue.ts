import { applyTheme, CCS_EVENTS, initCcsI18n, type Language, type ThemeMode } from '@ccs/shared';
import type { CcsRuntimeProps } from './index';
export interface WujieWindow extends Window {
  __POWERED_BY_WUJIE__?: boolean;
  __WUJIE_MOUNT?: () => void;
  __WUJIE_UNMOUNT?: () => void;
  $wujie?: {
    props?: Partial<CcsRuntimeProps>;
    bus?: { $on: (event: string, handler: (payload: any) => void) => void; $off?: (event: string, handler: (payload: any) => void) => void; $emit?: (event: string, payload?: any) => void };
  };
}
export function readWujieProps(win: WujieWindow = window): Partial<CcsRuntimeProps> {
  return win.$wujie?.props ?? {};
}
export async function applyRuntimeProps(props: Partial<CcsRuntimeProps>) {
  if (props.theme) applyTheme(props.theme);
  if (props.language) await initCcsI18n(props.language);
}
export function bindWujieSyncHandlers(options: { onTheme?: (theme: ThemeMode) => void; onLanguage?: (language: Language) => void }, win: WujieWindow = window) {
  const themeHandler = (payload: { theme: ThemeMode }) => options.onTheme?.(payload.theme);
  const languageHandler = (payload: { language: Language }) => options.onLanguage?.(payload.language);
  win.$wujie?.bus?.$on(CCS_EVENTS.THEME_CHANGE, themeHandler);
  win.$wujie?.bus?.$on(CCS_EVENTS.LANGUAGE_CHANGE, languageHandler);
  return () => {
    win.$wujie?.bus?.$off?.(CCS_EVENTS.THEME_CHANGE, themeHandler);
    win.$wujie?.bus?.$off?.(CCS_EVENTS.LANGUAGE_CHANGE, languageHandler);
  };
}

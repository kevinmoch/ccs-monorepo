import React, { useEffect, useMemo } from 'react';
import WujieReact from 'wujie-react';
import { CCS_EVENTS, type Language, type MicroModuleManifest, type ThemeMode } from '@ccs/shared';
import type { CcsRuntimeProps } from './index';
export interface MicroAppProps {
  app: MicroModuleManifest;
  theme: ThemeMode;
  language: Language;
  routePath: string;
  user?: CcsRuntimeProps['user'];
}
export function registerMicroApps(apps: MicroModuleManifest[], propsFactory: () => Omit<CcsRuntimeProps, 'routePath'>) {
  apps.forEach((app) => {
    WujieReact.setupApp({ name: app.name, url: app.url, alive: true, sync: true, exec: true, props: propsFactory() });
    WujieReact.preloadApp({ name: app.name, url: app.url });
  });
}
export function emitToMicroApps<T>(event: string, payload: T) {
  WujieReact.bus.$emit(event, payload);
}
export function syncThemeToMicroApps(theme: ThemeMode) {
  emitToMicroApps(CCS_EVENTS.THEME_CHANGE, { theme });
}
export function syncLanguageToMicroApps(language: Language) {
  emitToMicroApps(CCS_EVENTS.LANGUAGE_CHANGE, { language });
}
export function MicroApp({ app, theme, language, routePath, user }: MicroAppProps) {
  const props = useMemo<CcsRuntimeProps>(() => ({ theme, language, routePath, user }), [theme, language, routePath, user]);
  useEffect(() => {
    syncThemeToMicroApps(theme);
  }, [theme]);
  useEffect(() => {
    syncLanguageToMicroApps(language);
  }, [language]);
  useEffect(() => {
    WujieReact.bus.$emit(CCS_EVENTS.NAVIGATE, { routePath });
  }, [routePath]);
  const Wujie = WujieReact as React.ComponentType<Record<string, unknown>>;
  return <Wujie name={app.name} url={app.url} sync alive props={props} width="100%" height="100%" />;
}
export { WujieReact };

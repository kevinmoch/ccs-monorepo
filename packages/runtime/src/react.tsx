import React, { useEffect, useMemo, useRef, useState } from 'react';
import WujieReact from 'wujie-react';
import { CCS_EVENTS, type Language, type MicroModuleManifest, type ThemeMode } from '@ccs/shared';
import type { CcsRuntimeProps } from './index';

function isCapacitorOrAndroid(): boolean {
  if (typeof window === 'undefined') return false;
  if ((window as any).Capacitor) return true;
  return /android/i.test(navigator.userAgent);
}

export interface MicroAppProps {
  app: MicroModuleManifest;
  theme: ThemeMode;
  language: Language;
  routePath: string;
  user?: CcsRuntimeProps['user'];
}

export function registerMicroApps(apps: MicroModuleManifest[], propsFactory: () => Omit<CcsRuntimeProps, 'routePath'>) {
  apps.forEach((app) => {
    // Skip wujie preload on Android/Capacitor — use iframe fallback instead
    if (!isCapacitorOrAndroid()) {
      WujieReact.setupApp({ name: app.name, url: app.url, alive: true, sync: true, exec: true, props: propsFactory() });
      WujieReact.preloadApp({ name: app.name, url: app.url });
    }
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

/** Build an iframe src URL that combines the app URL with the target route.
 *  Uses an absolute URL + explicit index.html to avoid any ambiguity
 *  in Capacitor's path resolution, and a hash fragment for the route
 *  so the server only ever sees the base path. */
function buildIframeSrc(appUrl: string, routePath: string): string {
  const pathOnly = routePath.startsWith('/') ? routePath : '/' + routePath;
  const base = (typeof window !== 'undefined' ? window.location.origin : '') + appUrl;
  // Explicitly target index.html so Capacitor's asset loader doesn't
  // need to resolve directory → index.html on its own
  const htmlUrl = base.endsWith('/') ? base + 'index.html' : base;
  return `${htmlUrl}#__ccs_route=${encodeURIComponent(pathOnly)}`;
}

export function MicroApp({ app, theme, language, routePath, user }: MicroAppProps) {
  const props = useMemo<CcsRuntimeProps>(() => ({ theme, language, routePath, user }), [theme, language, routePath, user]);
  const [useIframe] = useState(() => isCapacitorOrAndroid());
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [iframeError, setIframeError] = useState<string | null>(null);

  useEffect(() => {
    console.log('[MicroApp] rendering app=%s routePath=%s useIframe=%s url=%s', app.name, routePath, useIframe, app.url);
  }, [app.name, routePath, useIframe, app.url]);

  useEffect(() => {
    syncThemeToMicroApps(theme);
  }, [theme]);

  useEffect(() => {
    syncLanguageToMicroApps(language);
  }, [language]);

  useEffect(() => {
    if (useIframe) {
      // Send route change to iframe via postMessage
      iframeRef.current?.contentWindow?.postMessage(
        { type: 'CCS_NAVIGATE', routePath },
        '*'
      );
    } else {
      WujieReact.bus.$emit(CCS_EVENTS.NAVIGATE, { routePath });
    }
  }, [routePath, useIframe]);

  // Android/Capacitor: use plain iframe (wujie has compatibility issues with Capacitor WebView)
  if (useIframe) {
    const src = buildIframeSrc(app.url, routePath);
    return (
      <div style={{ width: '100%', height: '100%', position: 'relative' }}>
        {!iframeLoaded && !iframeError && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: '#f8fafc', color: '#64748b', fontSize: 14, zIndex: 1,
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ marginBottom: 8, fontWeight: 600, color: '#334155' }}>Loading: {app.title}</div>
              <div style={{ fontSize: 12, fontFamily: 'monospace', opacity: 0.7 }}>{src}</div>
            </div>
          </div>
        )}
        {iframeError && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: '#fef2f2', color: '#991b1b', fontSize: 13, zIndex: 2,
          }}>
            <div style={{ textAlign: 'center', maxWidth: 320 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Module Load Failed</div>
              <div style={{ fontSize: 11, fontFamily: 'monospace', wordBreak: 'break-all', opacity: 0.8 }}>{iframeError}</div>
            </div>
          </div>
        )}
        <iframe
          ref={iframeRef}
          src={src}
          sandbox="allow-scripts allow-same-origin"
          style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
          title={app.title}
          onLoad={() => { console.log('[MicroApp] iframe onLoad src=' + src); setIframeLoaded(true); setIframeError(null); }}
          onError={(e) => { console.error('[MicroApp] iframe onError src=' + src, e); setIframeError('iframe onError: ' + (e as any).toString()); }}
        />
      </div>
    );
  }

  const Wujie = WujieReact as React.ComponentType<Record<string, unknown>>;
  return <Wujie name={app.name} url={app.url} sync alive props={props} width="100%" height="100%" />;
}

export { WujieReact };

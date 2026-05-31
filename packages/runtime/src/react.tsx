import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CCS_EVENTS, type Language, type MicroModuleManifest, type ThemeMode } from '@ccs/shared';
import type { CcsRuntimeProps } from './index';

const microAppFrames = new Set<HTMLIFrameElement>();

export interface MicroAppProps {
  app: MicroModuleManifest;
  theme: ThemeMode;
  language: Language;
  routePath: string;
  user?: CcsRuntimeProps['user'];
}

export function registerMicroApps(_apps: MicroModuleManifest[], _propsFactory: () => Omit<CcsRuntimeProps, 'routePath'>) {
  // Iframe mode loads modules on demand through their iframe src.
}

export function emitToMicroApps<T>(event: string, payload: T) {
  microAppFrames.forEach((iframe) => {
    iframe.contentWindow?.postMessage({ type: 'CCS_EVENT', event, payload }, '*');
  });
}

export function syncThemeToMicroApps(theme: ThemeMode) {
  emitToMicroApps(CCS_EVENTS.THEME_CHANGE, { theme });
}

export function syncLanguageToMicroApps(language: Language) {
  emitToMicroApps(CCS_EVENTS.LANGUAGE_CHANGE, { language });
}

function buildIframeSrc(appUrl: string, props: CcsRuntimeProps): string {
  const { routePath, theme, language } = props;
  const pathOnly = routePath.startsWith('/') ? routePath : '/' + routePath;
  const baseOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
  const url = new URL(appUrl, baseOrigin);
  if (url.pathname.endsWith('/')) url.pathname += 'index.html';
  url.searchParams.set('__ccs_route', pathOnly);
  url.searchParams.set('__ccs_theme', theme);
  url.searchParams.set('__ccs_language', language);
  return url.toString();
}

export function MicroApp({ app, theme, language, routePath, user }: MicroAppProps) {
  const props = useMemo<CcsRuntimeProps>(() => ({ theme, language, routePath, user }), [theme, language, routePath, user]);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [iframeError, setIframeError] = useState<string | null>(null);

  const postRuntimeState = useCallback(() => {
    iframeRef.current?.contentWindow?.postMessage({ type: 'SYNC_STATE', payload: { theme, language, user } }, '*');
  }, [language, theme, user]);

  useEffect(() => {
    console.log('[MicroApp] rendering app=%s routePath=%s url=%s', app.name, routePath, app.url);
  }, [app.name, routePath, app.url]);

  useEffect(() => {
    iframeRef.current?.contentWindow?.postMessage({ type: 'CCS_EVENT', event: CCS_EVENTS.THEME_CHANGE, payload: { theme } }, '*');
    postRuntimeState();
  }, [postRuntimeState, theme]);

  useEffect(() => {
    iframeRef.current?.contentWindow?.postMessage({ type: 'CCS_EVENT', event: CCS_EVENTS.LANGUAGE_CHANGE, payload: { language } }, '*');
    postRuntimeState();
  }, [language, postRuntimeState]);

  useEffect(() => {
    iframeRef.current?.contentWindow?.postMessage({ type: 'CCS_NAVIGATE', routePath }, '*');
  }, [routePath]);

  const setIframeRef = useCallback((iframe: HTMLIFrameElement | null) => {
    if (iframeRef.current) microAppFrames.delete(iframeRef.current);
    iframeRef.current = iframe;
    if (iframe) microAppFrames.add(iframe);
  }, []);

  const src = buildIframeSrc(app.url, props);
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
        ref={setIframeRef}
        src={src}
        sandbox="allow-scripts allow-same-origin"
        style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
        title={app.title}
        onLoad={() => { console.log('[MicroApp] iframe onLoad src=' + src); setIframeLoaded(true); setIframeError(null); postRuntimeState(); }}
        onError={(e) => { console.error('[MicroApp] iframe onError src=' + src, e); setIframeError('iframe onError: ' + (e as any).toString()); }}
      />
    </div>
  );
}

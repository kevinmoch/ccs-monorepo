import { createApp, type App as VueApp } from 'vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { applyRuntimeProps, bindWujieSyncHandlers, readWujieProps } from '@ccs/runtime/vue';
import { applyTheme, CCS_EVENTS, resources, type Language, type ThemeMode } from '@ccs/shared';
import App from './App.vue';
import router from './router';
import { useRuntimeStore } from './stores/runtime';
import './styles.css';
let app: VueApp | null = null;
let disposeSync: (() => void) | undefined;
let disposeRouteSync: (() => void) | undefined;
const i18n = createI18n({ legacy: false, locale: 'zh-CN', fallbackLocale: 'zh-CN', messages: { 'zh-CN': resources['zh-CN'].translation, 'en-US': resources['en-US'].translation } as any });
async function render() {
  const props = readWujieProps();
  await applyRuntimeProps(props);
  app = createApp(App);
  app.use(createPinia());
  app.use(router);
  app.use(i18n);
  app.mount('#app');
  const runtime = useRuntimeStore();
  if (props.theme) runtime.setTheme(props.theme as ThemeMode);
  if (props.language) runtime.setLanguage(props.language as Language);
  disposeSync = bindWujieSyncHandlers({
    onTheme(theme) {
      runtime.setTheme(theme);
      applyTheme(theme);
    },
    onLanguage(language) {
      runtime.setLanguage(language);
      (i18n.global.locale as any).value = language;
    }
  });
  // Navigate to the correct route when mounted in wujie / iframe
  navigateToRoute(props.routePath);
  // Listen for route changes from the host app (wujie bus)
  disposeRouteSync = bindWujieRouteHandler();
  // Also listen for postMessage-based navigation from iframe parent
  disposePostMessage = bindPostMessageRouteHandler();
}
if (window.__POWERED_BY_WUJIE__) {
  window.__WUJIE_MOUNT = () => render();
  window.__WUJIE_UNMOUNT = () => {
    disposeSync?.();
    disposeRouteSync?.();
    app?.unmount();
    app = null;
  };
} else {
  render();
}

/** Read the __ccs_route param used by the iframe fallback.
 *  It is passed via hash fragment (e.g. #__ccs_route=%2Fmodules%2Fdemo%2Fdashboard) */
function getIframeRoute(): string | undefined {
  try {
    const hash = window.location.hash;
    if (!hash || !hash.startsWith('#__ccs_route=')) return undefined;
    const encoded = hash.slice('#__ccs_route='.length);
    return decodeURIComponent(encoded);
  } catch {
    return undefined;
  }
}

function navigateToRoute(routePath?: string) {
  if (routePath && typeof routePath === 'string') {
    const target = routePath.replace('/modules/demo', '') || '/dashboard';
    router.replace(target);
  } else if (!window.__POWERED_BY_WUJIE__) {
    // Check if launched via iframe fallback with a __ccs_route param
    const iframeRoute = getIframeRoute();
    if (iframeRoute) {
      const target = iframeRoute.replace('/modules/demo', '') || '/dashboard';
      router.replace(target);
      return;
    }
    router.replace('/dashboard');
  } else {
    router.replace('/dashboard');
  }
}

function bindPostMessageRouteHandler(): () => void {
  const handler = (event: MessageEvent) => {
    if (event.data?.type === 'CCS_NAVIGATE' && event.data?.routePath) {
      navigateToRoute(event.data.routePath);
    }
  };
  window.addEventListener('message', handler);
  return () => window.removeEventListener('message', handler);
}

// In non-wujie standalone / iframe mode, listen for postMessage navigation
// The listener is bound after the app is mounted via a microtask in render()
let disposePostMessage: (() => void) | undefined;

function bindWujieRouteHandler(): () => void {
  const wujieWin = window as any;
  const handler = (payload: { routePath: string }) => navigateToRoute(payload.routePath);
  wujieWin.$wujie?.bus?.$on(CCS_EVENTS.NAVIGATE, handler);
  return () => wujieWin.$wujie?.bus?.$off?.(CCS_EVENTS.NAVIGATE, handler);
}
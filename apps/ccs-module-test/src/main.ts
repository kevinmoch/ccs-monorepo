import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { applyRuntimeProps, bindIframeMessageHandlers, readIframeProps } from '@ccs/runtime/vue';
import { applyTheme, initI18n, type Language, type ThemeMode } from '@ccs/shared';
import App from './App.vue';
import router from './router';
import { useRuntimeStore } from './stores/runtime';
import { i18n } from './i18n/instance';
import './styles.css';

const initialIframeRoute = getIframeRoute();

async function render() {
  // 确保 i18next 始终初始化（不受 query 参数影响）
  await initI18n();
  const props = readIframeProps();
  // Fallback: read theme from localStorage or system preference when not provided via URL param
  if (!props.theme) {
    const fallback = getFallbackTheme();
    props.theme = fallback;
    applyTheme(fallback);
  }
  await applyRuntimeProps(props);
  const app = createApp(App);
  app.use(createPinia());
  app.use(router);
  app.use(i18n);
  app.mount('#app');

  const runtime = useRuntimeStore();
  if (props.theme) runtime.setTheme(props.theme as ThemeMode);
  if (props.language) {
    runtime.setLanguage(props.language as Language);
    (i18n.global.locale as any).value = props.language;
    await initI18n(props.language);
  }

  bindIframeMessageHandlers({
    onTheme(theme) {
      runtime.setTheme(theme);
      applyTheme(theme);
    },
    onLanguage(language) {
      runtime.setLanguage(language);
      (i18n.global.locale as any).value = language;
      initI18n(language);
    },
    onNavigate(routePath) {
      navigateToRoute(routePath);
    }
  });

  navigateToRoute(props.routePath);
}

render();

function getIframeRoute(): string | undefined {
  try {
    const queryRoute = new URLSearchParams(window.location.search).get('__ccs_route');
    if (queryRoute) return queryRoute;

    const hash = window.location.hash;
    if (!hash || !hash.startsWith('#__ccs_route=')) return undefined;
    return decodeURIComponent(hash.slice('#__ccs_route='.length));
  } catch {
    return undefined;
  }
}

function navigateToRoute(routePath?: string) {
  if (routePath && typeof routePath === 'string') {
    const target = routePath.replace('/modules/test', '') || '/';
    router.replace(target);
  } else {
    const iframeRoute = initialIframeRoute ?? getIframeRoute();
    if (iframeRoute) {
      const target = iframeRoute.replace('/modules/test', '') || '/';
      router.replace(target);
      return;
    }

    try {
      if (window.top !== window.self) {
        router.replace('/');
      }
    } catch {
      router.replace('/');
    }
  }
}

function getFallbackTheme(): ThemeMode {
  try {
    const stored = localStorage.getItem('ccs-theme');
    if (stored === 'dark') return 'dark';
    if (stored === 'light') return 'light';
  } catch {
    /* ignore */
  }
  return 'light';
}

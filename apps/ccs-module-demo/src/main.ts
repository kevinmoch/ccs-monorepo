import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { applyRuntimeProps, bindIframeMessageHandlers, readIframeProps } from '@ccs/runtime/vue';
import { applyTheme, resources, type Language, type ThemeMode } from '@ccs/shared';
import App from './App.vue';
import router from './router';
import { useRuntimeStore } from './stores/runtime';
import './styles.css';
const i18n = createI18n({ legacy: false, locale: 'zh-CN', fallbackLocale: 'zh-CN', messages: { 'zh-CN': resources['zh-CN'].translation, 'en-US': resources['en-US'].translation } as any });
const initialIframeRoute = getIframeRoute();
async function render() {
  const props = readIframeProps();
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
  }
  bindIframeMessageHandlers({
    onTheme(theme) {
      runtime.setTheme(theme);
      applyTheme(theme);
    },
    onLanguage(language) {
      runtime.setLanguage(language);
      (i18n.global.locale as any).value = language;
    },
    onNavigate(routePath) {
      navigateToRoute(routePath);
    }
  });
  navigateToRoute(props.routePath);
}
render();

/** Read the __ccs_route param used by the iframe fallback.
 *  It is passed via query string to avoid conflicting with Vue hash history. */
function getIframeRoute(): string | undefined {
  try {
    const queryRoute = new URLSearchParams(window.location.search).get('__ccs_route');
    if (queryRoute) return queryRoute;

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
    const target = routePath.replace('/modules/demo', '') || '/';
    router.replace(target);
  } else {
    const iframeRoute = initialIframeRoute ?? getIframeRoute();
    if (iframeRoute) {
      const target = iframeRoute.replace('/modules/demo', '') || '/';
      router.replace(target);
      return;
    }
    router.replace('/');
  }
}
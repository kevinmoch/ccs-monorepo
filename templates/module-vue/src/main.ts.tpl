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
  // 提前注册消息监听，确保在异步初始化完成前不会错过宿主的 SYNC_STATE 消息
  // 用于缓存初始阶段收到的语言/主题设定，待 store 就绪后再应用
  let pendingLanguage: Language | undefined;
  let pendingTheme: ThemeMode | undefined;

  bindIframeMessageHandlers({
    onTheme(theme) {
      pendingTheme = theme;
      applyTheme(theme);
      try {
        const runtime = useRuntimeStore();
        if (runtime) runtime.setTheme(theme);
      } catch {
        /* store 尚未初始化 */
      }
    },
    onLanguage(language) {
      pendingLanguage = language;
      try {
        (i18n.global.locale as any).value = language;
        initI18n(language);
      } catch {
        /* i18n 尚未初始化 */
      }
      try {
        const runtime = useRuntimeStore();
        if (runtime) runtime.setLanguage(language);
      } catch {
        /* store 尚未初始化 */
      }
    },
    onNavigate(routePath) {
      navigateToRoute(routePath);
    }
  });

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
  // 优先使用提前收到的 pending 状态，其次使用 URL 参数
  const effectiveTheme = pendingTheme ?? props.theme;
  const effectiveLanguage = pendingLanguage ?? (props.language as Language | undefined);

  if (effectiveTheme) runtime.setTheme(effectiveTheme as ThemeMode);
  if (effectiveLanguage) {
    runtime.setLanguage(effectiveLanguage);
    (i18n.global.locale as any).value = effectiveLanguage;
    await initI18n(effectiveLanguage);
  } else if (props.language) {
    runtime.setLanguage(props.language as Language);
    (i18n.global.locale as any).value = props.language;
    await initI18n(props.language);
  }

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
    const target = routePath.replace('__MODULE_BASE_ROUTE__', '') || '/';
    router.replace(target);
  } else {
    const iframeRoute = initialIframeRoute ?? getIframeRoute();
    if (iframeRoute) {
      const target = iframeRoute.replace('__MODULE_BASE_ROUTE__', '') || '/';
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

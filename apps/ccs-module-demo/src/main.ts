import { createApp, type App as VueApp } from 'vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { applyRuntimeProps, bindWujieSyncHandlers, readWujieProps } from '@ccs/runtime/vue';
import { applyTheme, resources, type Language, type ThemeMode } from '@ccs/shared';
import App from './App.vue';
import router from './router';
import { useRuntimeStore } from './stores/runtime';
import './styles.css';
let app: VueApp | null = null;
let disposeSync: (() => void) | undefined;
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
  if (props.routePath && typeof props.routePath === 'string') router.replace(props.routePath.replace('/modules/demo', '') || '/dashboard');
}
if (window.__POWERED_BY_WUJIE__) {
  window.__WUJIE_MOUNT = () => render();
  window.__WUJIE_UNMOUNT = () => {
    disposeSync?.();
    app?.unmount();
    app = null;
  };
} else {
  render();
}

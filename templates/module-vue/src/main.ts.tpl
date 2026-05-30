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
let disposePostMessage: (() => void) | undefined;
const i18n = createI18n({ legacy: false, locale: 'zh-CN', fallbackLocale: 'zh-CN', messages: { 'zh-CN': resources['zh-CN'].translation, 'en-US': resources['en-US'].translation } as any });
const initialIframeRoute = getIframeRoute();

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

	navigateToRoute(props.routePath);
	disposeRouteSync = bindWujieRouteHandler();
	disposePostMessage = bindPostMessageRouteHandler();
}

if (window.__POWERED_BY_WUJIE__) {
	window.__WUJIE_MOUNT = () => render();
	window.__WUJIE_UNMOUNT = () => {
		disposeSync?.();
		disposeRouteSync?.();
		disposePostMessage?.();
		app?.unmount();
		app = null;
	};
} else {
	render();
}

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
		const target = routePath.replace('__MODULE_BASE_ROUTE__', '') || '/dashboard';
		router.replace(target);
	} else if (!window.__POWERED_BY_WUJIE__) {
		const iframeRoute = initialIframeRoute ?? getIframeRoute();
		if (iframeRoute) {
			const target = iframeRoute.replace('__MODULE_BASE_ROUTE__', '') || '/dashboard';
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

function bindWujieRouteHandler(): () => void {
	const handler = (payload: { routePath: string }) => navigateToRoute(payload.routePath);
	window.$wujie?.bus?.$on(CCS_EVENTS.NAVIGATE, handler);
	return () => window.$wujie?.bus?.$off?.(CCS_EVENTS.NAVIGATE, handler);
}

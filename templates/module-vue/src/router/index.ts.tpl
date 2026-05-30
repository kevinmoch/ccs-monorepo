import { createRouter, createWebHashHistory, createWebHistory } from 'vue-router';
import DashboardPage from '../pages/dashboard/DashboardPage.vue';

function isPlainIframe(): boolean {
	try {
		return !window.__POWERED_BY_WUJIE__ && window.top !== window.self;
	} catch {
		return false;
	}
}

function detectBasePath(): string {
	if (window.__POWERED_BY_WUJIE__) return '__MODULE_BASE_ROUTE__';

	const pathname = window.location.pathname;
	if (pathname === '/') return '/';

	const parts = pathname.split('/').filter(Boolean);
	return parts.length > 0 ? `/${parts[0]}` : '/';
}

const BASE = detectBasePath();
const iframeMode = isPlainIframe();
const redirectTarget = iframeMode ? '/dashboard' : `${BASE}/dashboard`;

const router = createRouter({
	history: iframeMode ? createWebHashHistory(BASE) : createWebHistory(BASE),
	routes: [
		{ path: '/', redirect: redirectTarget },
		{ path: '/dashboard', name: 'Dashboard', component: DashboardPage }, // ccs-cli:route
	]
});
export default router;

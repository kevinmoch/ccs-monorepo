import { createRouter, createWebHashHistory, createWebHistory } from 'vue-router';
import DashboardPage from '../pages/dashboard/DashboardPage.vue';

function isIframe(): boolean {
	try {
		return window.top !== window.self;
	} catch {
		return false;
	}
}

function detectBasePath(): string {
	const pathname = window.location.pathname;
	if (pathname === '/') return '/';

	const parts = pathname.split('/').filter(Boolean);
	return parts.length > 0 ? `/${parts[0]}` : '/';
}

const BASE = detectBasePath();
const iframeMode = isIframe();
const redirectTarget = iframeMode ? '/dashboard' : `${BASE}/dashboard`;

const router = createRouter({
	history: iframeMode ? createWebHashHistory(BASE) : createWebHistory(BASE),
	routes: [
		{ path: '/', redirect: redirectTarget },
		{ path: '/dashboard', name: 'Dashboard', component: DashboardPage }, // ccs-cli:route
	]
});
export default router;

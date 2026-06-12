import { createRouter, createWebHashHistory, createWebHistory } from 'vue-router';
import HomePage from '../pages/home/HomePage.vue';

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

const router = createRouter({
	history: iframeMode ? createWebHashHistory(BASE) : createWebHistory(BASE),
	routes: [
		{ path: '/', name: 'Home', component: HomePage },
    {
      path: '/test',
      name: 'Test',
      component: () => import('../pages/attendance/AttendancePage.vue')
    },
    {
      path: '/offline-docs',
      name: 'OfflineDocs',
      component: () => import('../pages/offline-docs/OfflineDocsPage.vue')
    },
		// ccs-cli:route
	]
});
export default router;

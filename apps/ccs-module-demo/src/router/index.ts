import { createRouter, createWebHistory, createWebHashHistory } from 'vue-router';
import DashboardPage from '../pages/dashboard/DashboardPage.vue';
import OrdersPage from '../pages/orders/OrdersPage.vue';

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
  if (parts.length > 0) return '/' + parts[0];
  return '/';
}

const BASE = detectBasePath();
const iframeMode = isIframe();

const redirectTarget = iframeMode ? '/dashboard' : BASE + '/dashboard';

const router = createRouter({
  history: iframeMode
    ? createWebHashHistory(BASE)
    : createWebHistory(BASE),
  routes: [
    { path: '/', redirect: redirectTarget },
    { path: '/dashboard', name: 'Dashboard', component: DashboardPage },
    { path: '/orders', name: 'Orders', component: OrdersPage } // ccs-cli:route
  ]
});
export default router;
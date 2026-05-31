import { createRouter, createWebHistory, createWebHashHistory } from 'vue-router';
import HomePage from '../pages/home/HomePage.vue';
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
  if (parts.length > 0) return '/' + parts[0];
  return '/';
}

const BASE = detectBasePath();
const iframeMode = isIframe();

const router = createRouter({
  history: iframeMode
    ? createWebHashHistory(BASE)
    : createWebHistory(BASE),
  routes: [
    { path: '/', name: 'Home', component: HomePage },
    { path: '/dashboard', name: 'Dashboard', component: DashboardPage },
    // ccs-cli:route
  ]
});
export default router;
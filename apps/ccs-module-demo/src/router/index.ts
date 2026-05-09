import { createRouter, createWebHistory, createWebHashHistory } from 'vue-router';
import DashboardPage from '../pages/dashboard/DashboardPage.vue';
import OrdersPage from '../pages/orders/OrdersPage.vue';

/** Detect whether we're running inside a plain iframe (not wujie).
 *  In iframe mode, use hash history so that internal navigation only
 *  changes the URL hash — preventing Capacitor's WebView from
 *  intercepting path changes as top-level navigations. */
function isPlainIframe(): boolean {
  try {
    return !window.__POWERED_BY_WUJIE__ && window.top !== window.self;
  } catch {
    // window.top may throw in sandboxed contexts without allow-same-origin
    return false;
  }
}

/** Detect the base URL path for the router.
 *  - Inside wujie: always `/modules/demo`
 *  - Standalone dev (port 5174): `/`
 *  - Iframe fallback / production: derived from `window.location.pathname`
 *    e.g. `/ccs-module-demo/dashboard` → `/ccs-module-demo`
 */
function detectBasePath(): string {
  if (window.__POWERED_BY_WUJIE__) return '/modules/demo';
  const pathname = window.location.pathname;
  if (pathname === '/') return '/';
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length > 0) return '/' + parts[0];
  return '/';
}

const BASE = detectBasePath();
const iframeMode = isPlainIframe();

// In hash mode the redirect must be just `/dashboard` (→ `#/dashboard`),
// not an absolute path that would change `window.location.pathname`.
const redirectTarget = iframeMode ? '/dashboard' : BASE + '/dashboard';

const router = createRouter({
  // Use hash history inside a plain iframe so that Vue Router navigation
  // only mutates `#/...` — the path stays `/ccs-module-demo/` and
  // Capacitor does not intercept it as a main-frame navigation.
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
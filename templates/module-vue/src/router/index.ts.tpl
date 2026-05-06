import { createRouter, createWebHistory } from 'vue-router';
import DashboardPage from '../pages/dashboard/DashboardPage.vue';
const router = createRouter({ history: createWebHistory(window.__POWERED_BY_WUJIE__ ? '__MODULE_BASE_ROUTE__' : '/'), routes: [ { path: '/', redirect: '/dashboard' }, { path: '/dashboard', name: 'Dashboard', component: DashboardPage }, // ccs-cli:route
] });
export default router;

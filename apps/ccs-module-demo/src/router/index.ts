import { createRouter, createWebHistory } from 'vue-router';
import DashboardPage from '../pages/dashboard/DashboardPage.vue';
import OrdersPage from '../pages/orders/OrdersPage.vue';

const BASE = window.__POWERED_BY_WUJIE__ ? '/modules/demo' : '/';
const router = createRouter({
  history: createWebHistory(BASE),
  routes: [
    { path: '/', redirect: BASE + '/dashboard' },
    { path: '/dashboard', name: 'Dashboard', component: DashboardPage },
    { path: '/orders', name: 'Orders', component: OrdersPage } // ccs-cli:route
  ]
});
export default router;

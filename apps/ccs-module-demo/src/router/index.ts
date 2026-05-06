import { createRouter, createWebHistory } from 'vue-router';
import DashboardPage from '../pages/dashboard/DashboardPage.vue';
import OrdersPage from '../pages/orders/OrdersPage.vue';
const router = createRouter({
  history: createWebHistory(window.__POWERED_BY_WUJIE__ ? '/modules/demo' : '/'),
  routes: [
    { path: '/', redirect: '/dashboard' },
    { path: '/dashboard', name: 'Dashboard', component: DashboardPage },
    { path: '/orders', name: 'Orders', component: OrdersPage } // ccs-cli:route
  ]
});
export default router;

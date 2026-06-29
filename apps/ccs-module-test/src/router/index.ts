import { createRouter, createWebHashHistory, createWebHistory } from 'vue-router';
import HomePage from '../pages/home/HomePage.vue';

function isIframe(): boolean {
  try {
    return window.top !== window.self;
  } catch {
    return false;
  }
}

const BASE = import.meta.env.BASE_URL;
const iframeMode = isIframe();

const router = createRouter({
  history: iframeMode ? createWebHashHistory(BASE) : createWebHistory(BASE),
  routes: [
    { path: '/', name: 'Home', component: HomePage },
    {
      path: '/attendance',
      name: 'Attendance',
      component: () => import('../pages/attendance/AttendancePage.vue')
    },
    {
      path: '/offline-docs',
      name: 'OfflineDocs',
      component: () => import('../pages/offline-docs/OfflineDocsPage.vue')
    },
    {
      path: '/offline-photo',
      name: 'OfflinePhoto',
      component: () => import('../pages/offline-photo/OfflinePhotoPage.vue')
    },
    {
      path: '/sample',
      name: 'Sample',
      component: () => import('../pages/sample/SamplePage.vue')
    }
    // ccs-cli:route
  ]
});
export default router;

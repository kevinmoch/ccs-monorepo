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
      path: '/overview',
      name: 'Overview',
      component: () => import('../pages/overview/OverviewPage.vue')
    },
    {
      path: '/my-workspace',
      name: 'MyWorkspace',
      component: () => import('../pages/my-workspace/MyWorkspacePage.vue')
    },
    {
      path: '/my-projects',
      name: 'MyProjects',
      component: () => import('../pages/my-projects/MyProjectsPage.vue')
    },
    {
      path: '/my-todos',
      name: 'MyTodos',
      component: () => import('../pages/my-todos/MyTodosPage.vue')
    },
    {
      path: '/severely-overdue',
      name: 'SeverelyOverdue',
      component: () => import('../pages/severely-overdue/SeverelyOverduePage.vue')
    },
    {
      path: '/overdue',
      name: 'Overdue',
      component: () => import('../pages/overdue/OverduePage.vue')
    },
    {
      path: '/notification',
      name: 'Notification',
      component: () => import('../pages/notification/NotificationPage.vue')
    },
    {
      path: '/settings',
      name: 'Settings',
      component: () => import('../pages/settings/SettingsPage.vue')
    },
    {
      path: '/it-support',
      name: 'ItSupport',
      component: () => import('../pages/it-support/ItSupportPage.vue')
    },
    {
      path: '/help-guide',
      name: 'HelpGuide',
      component: () => import('../pages/help-guide/HelpGuidePage.vue')
    },
		// ccs-cli:route
	]
});
export default router;

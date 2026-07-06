import { createRouter, createWebHashHistory, createWebHistory } from 'vue-router';

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
    {
      path: '/iframe',
      name: 'Iframe',
      component: () => import('../pages/iframe/IframePage.vue')
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
      path: '/notifications',
      name: 'Notifications',
      component: () => import('../pages/notifications/NotificationsPage.vue')
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
    {
      path: '/portal-investment',
      name: 'PortalInvestment',
      component: () => import('../pages/portal-investment/PortalInvestmentPage.vue')
    },
    {
      path: '/portal-architecture',
      name: 'PortalArchitecture',
      component: () => import('../pages/portal-architecture/PortalArchitecturePage.vue')
    },
    {
      path: '/portal-civil-engineering',
      name: 'PortalCivilEngineering',
      component: () => import('../pages/portal-civil-engineering/PortalCivilEngineeringPage.vue')
    },
    {
      path: '/portal-curtain-wall',
      name: 'PortalCurtainWall',
      component: () => import('../pages/portal-curtain-wall/PortalCurtainWallPage.vue')
    },
    {
      path: '/portal-hvac',
      name: 'PortalHvac',
      component: () => import('../pages/portal-hvac/PortalHvacPage.vue')
    },
    {
      path: '/portal-power-electrical',
      name: 'PortalPowerElectrical',
      component: () => import('../pages/portal-power-electrical/PortalPowerElectricalPage.vue')
    },
    {
      path: '/portal-weak-current',
      name: 'PortalWeakCurrent',
      component: () => import('../pages/portal-weak-current/PortalWeakCurrentPage.vue')
    },
    {
      path: '/portal-interior-fit-out',
      name: 'PortalInteriorFitOut',
      component: () => import('../pages/portal-interior-fit-out/PortalInteriorFitOutPage.vue')
    },
    {
      path: '/portal-soft-furnishing',
      name: 'PortalSoftFurnishing',
      component: () => import('../pages/portal-soft-furnishing/PortalSoftFurnishingPage.vue')
    },
    {
      path: '/portal-landscape',
      name: 'PortalLandscape',
      component: () => import('../pages/portal-landscape/PortalLandscapePage.vue')
    },
    {
      path: '/portal-process-mechanical',
      name: 'PortalProcessMechanical',
      component: () => import('../pages/portal-process-mechanical/PortalProcessMechanicalPage.vue')
    },
    {
      path: '/portal-engineering',
      name: 'PortalEngineering',
      component: () => import('../pages/portal-engineering/PortalEngineeringPage.vue')
    },
    {
      path: '/portal-procurement',
      name: 'PortalProcurement',
      component: () => import('../pages/portal-procurement/PortalProcurementPage.vue')
    },
    {
      path: '/portal-acceptance',
      name: 'PortalAcceptance',
      component: () => import('../pages/portal-acceptance/PortalAcceptancePage.vue')
    },
    {
      path: '/portal-ehs',
      name: 'PortalEhs',
      component: () => import('../pages/portal-ehs/PortalEhsPage.vue')
    },
    {
      path: '/portal-cost',
      name: 'PortalCost',
      component: () => import('../pages/portal-cost/PortalCostPage.vue')
    }
    // ccs-cli:route
  ]
});
export default router;

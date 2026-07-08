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
    },
    {
      path: '/portal-asset-library',
      name: 'PortalAssetLibrary',
      component: () => import('../pages/portal-asset-library/PortalAssetLibraryPage.vue')
    },
    {
      path: '/portal-operations-center',
      name: 'PortalOperationsCenter',
      component: () => import('../pages/portal-operations-center/PortalOperationsCenterPage.vue')
    }
    // ccs-cli:route
  ]
});
export default router;

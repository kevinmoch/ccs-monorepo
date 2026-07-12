importScripts('workbox-v7.4.1/workbox-sw.js');

workbox.setConfig({ debug: false, modulePathPrefix: 'workbox-v7.4.1/' });

const { precacheAndRoute, matchPrecache, createHandlerBoundToURL } = workbox.precaching;
const { NavigationRoute, registerRoute } = workbox.routing;
const { CacheFirst } = workbox.strategies;
const { ExpirationPlugin } = workbox.expiration;
const { CacheableResponsePlugin } = workbox.cacheableResponse;

// Dynamically compute the app base path from the SW's own location.
// e.g., /ccs-monorepo/sw.js → BASE = '/ccs-monorepo/'
//       /sw.js                → BASE = '/'
const BASE = self.location.pathname.replace(/\/sw\.js$/, '/');
const escapedBase = BASE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

precacheAndRoute([{"revision":"327e2f80b8cf341ff6694a62d9fe8bf1","url":"manifest.json"},{"revision":"7d04719ea5560e32489c4302eaf7b698","url":"index.html"},{"revision":"12c5facbd6455d1c408311781f785cfe","url":"ccs.svg"},{"revision":"2c7e7af02bd9e3ca514c9702a640d935","url":"ccs.png"},{"revision":"449247a455c03ac8b359871eb6124ce4","url":"ccs.ico"},{"revision":"b8a8d9e913434b102ec8bdfe5d65c470","url":"ccs-module-test/index.html"},{"revision":"5318ece04ef3c672f8d8e2addbe9e5e7","url":"ccs-module-test/assets/vendor-DPmiLhLA.js"},{"revision":"c52e7d1ed4b3a2fe11653819569d0319","url":"ccs-module-test/assets/rolldown-runtime-DK3Fl9T5.js"},{"revision":"2c5d0748dd5f5b98ab5042a4250dc0ca","url":"ccs-module-test/assets/index-Dk1sne9I.css"},{"revision":"bebaf6b44c74798e097243ca82186982","url":"ccs-module-test/assets/index-Ca9P11Y6.js"},{"revision":"1500c5e0bab2c0c7b39742c9c99c5a13","url":"ccs-module-test/assets/cards-CCXJV4sC.css"},{"revision":"a8d61702e14f1d85cb31c71cf82b953f","url":"ccs-module-test/assets/cards-B7JmVCkd.js"},{"revision":"df52bfb99e7fc7e706c8cdf6c46c2388","url":"ccs-module-test/assets/SamplePage-vZL3PM0u.js"},{"revision":"7f5daa66dfd7853678d2742e8d34308b","url":"ccs-module-test/assets/OfflinePhotoPage-nWr8ViIy.js"},{"revision":"a46ea716b389638f61ab9d02afb69f71","url":"ccs-module-test/assets/OfflineDocsPage-eZqswf3g.js"},{"revision":"e33e882b459e027a266c9f356adaa465","url":"ccs-module-test/assets/AttendancePage-T66n_2jj.js"},{"revision":"ead7112be125e9638e6d16324420defc","url":"ccs-module-common/index.html"},{"revision":"fc2179ccaaad4041170dbaf3f921daae","url":"ccs-module-common/assets/vendor-CUtsDp8_.js"},{"revision":"dae9f0843156841bb287dcb28295db43","url":"ccs-module-common/assets/index-BIyLFrWH.js"},{"revision":"8dd1fa7044e68c94af5860319208bc88","url":"ccs-module-common/assets/index-B-XZjTAA.css"},{"revision":"bd4e02ce67a651372ad86ac0cf59a339","url":"ccs-module-common/assets/cards-CoRalQxc.js"},{"revision":"cb2c1b39a8b7722c8c214bb3d4a4eac6","url":"ccs-module-common/assets/cards-BnNpeJ5W.css"},{"revision":"ec4e4d68dd2d83d3bf10f2c9463a9b5d","url":"ccs-module-common/assets/PortalWeakCurrentPage-DFkvZlu0.js"},{"revision":"d654c5d03e57a18588fa91549f14e61a","url":"ccs-module-common/assets/PortalSoftFurnishingPage-CDZOk8Dp.js"},{"revision":"839cb19ed78434624423ce5a7caad4c3","url":"ccs-module-common/assets/PortalProcurementPage-P0EPPdiE.js"},{"revision":"1f3da95f2e78981d6560911d410df02b","url":"ccs-module-common/assets/PortalProcessMechanicalPage-BJMt59Py.js"},{"revision":"7dcaf5d63ea4cad017c98b43555451e8","url":"ccs-module-common/assets/PortalPowerElectricalPage-BcKzRYk-.js"},{"revision":"e95980b2f92320435268dad24cab5d2d","url":"ccs-module-common/assets/PortalPlanningDesignPage-BXD2BfA9.js"},{"revision":"a71469e213e1e886b0e6b743bcc5d03c","url":"ccs-module-common/assets/PortalOperationsCenterPage-C84QZX8o.js"},{"revision":"b9fb01dba4a88ddb062a4364f3f57bed","url":"ccs-module-common/assets/PortalLandscapePage-Bb_o3-zJ.js"},{"revision":"361c8316c76d66cffa341f7016e7554c","url":"ccs-module-common/assets/PortalInvestmentPage-DFAIQ9QF.js"},{"revision":"3a77c1af1956ead123b4c42c6fbfea06","url":"ccs-module-common/assets/PortalInteriorFitOutPage-DaUUCwKY.js"},{"revision":"5c80ae35fb541d0c64497e731e95d120","url":"ccs-module-common/assets/PortalHvacPage-DsyE-5Vm.js"},{"revision":"4c1a31c1d8234dad28e8db010d90108e","url":"ccs-module-common/assets/PortalEngineeringPage-BFYlXutX.js"},{"revision":"ce8531717f4e56517587b836ec10847d","url":"ccs-module-common/assets/PortalEhsPage-BzM41SxE.js"},{"revision":"9d4da2883bff08f0e6681233a0fc3bf8","url":"ccs-module-common/assets/PortalCurtainWallPage-BS58c5hT.js"},{"revision":"cf7b7934b955aca82380c37a195c9d94","url":"ccs-module-common/assets/PortalCostPage-CQR-Owsy.js"},{"revision":"28c71b8f03f73dc1c26502c502d6e105","url":"ccs-module-common/assets/PortalCivilEngineeringPage-BDv830ZU.js"},{"revision":"8aff98b3741e1240b2090dbfbbfd45ed","url":"ccs-module-common/assets/PortalAssetLibraryPage-Cb7khO4F.js"},{"revision":"0fb7a6b85f9d309bae980b840bea75d6","url":"ccs-module-common/assets/PortalArchitecturePage-V4gOjQ6h.js"},{"revision":"9701213824a0f6e1328483207278373a","url":"ccs-module-common/assets/PortalAcceptancePage-DdXwL69I.js"},{"revision":"00df380b6673e323f7be0b1e0288e69c","url":"ccs-module-common/assets/IframePage-DjjFju1x.js"},{"revision":"ca225d205388dffae8549decc5a86365","url":"assets/vendor-CCmfyA3d.js"},{"revision":"47eb6677670791246ef846196dea27ee","url":"assets/rolldown-runtime-Cyuzqnbw.js"},{"revision":"0806fc1a5d58a232910c04cffa81ba3b","url":"assets/index-CQ1HimQD.js"},{"revision":"b06cd3f48e4a35619696db0169bf6642","url":"assets/index-BovxGzAh.css"}]);

// Main framework SPA navigation — serve index.html for non-module navigations
const mainFrameworkHandler = createHandlerBoundToURL('index.html');
registerRoute(
  new NavigationRoute(mainFrameworkHandler, {
    denylist: [new RegExp('^' + escapedBase + 'ccs-module-')]
  })
);

// Module SPAs navigation — serve each module's own index.html
registerRoute(
  ({ request, url }) => {
    if (!url.pathname.startsWith(BASE + 'ccs-module-')) return false;
    return request.mode === 'navigate' || request.destination === 'iframe' || request.destination === 'document';
  },
  async ({ url, request, event }) => {
    try {
      // Extract module name from the path (e.g., /ccs-monorepo/ccs-module-test/ → ccs-module-test)
      const moduleName = url.pathname.slice(BASE.length).split('/')[0];
      const cacheKey = `${moduleName}/index.html`;

      try {
        const handler = createHandlerBoundToURL(cacheKey);
        return await handler({ url, request, event });
      } catch (err) {
        // Fallback to matchPrecache if createHandlerBoundToURL fails
        const response = (await matchPrecache(cacheKey)) || (await matchPrecache(`${moduleName}/index.html`));
        if (response) return response;
        throw err;
      }
    } catch (e) {
      console.error('[SW] Iframe navigation fallback failed for', url.href, e);
      return fetch(request);
    }
  }
);

// Cache external assets
registerRoute(
  /^https:\/\/.*\/assets\/.*/i,
  new CacheFirst({
    cacheName: 'external-assets-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 1000,
        maxAgeSeconds: 60 * 60 * 24 * 30 // 30 Days
      }),
      new CacheableResponsePlugin({
        statuses: [0, 200]
      })
    ]
  })
);

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

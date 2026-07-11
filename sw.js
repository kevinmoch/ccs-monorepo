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

precacheAndRoute([{"revision":"327e2f80b8cf341ff6694a62d9fe8bf1","url":"manifest.json"},{"revision":"cca1ac4bd0504238f72a11de63f2bab3","url":"index.html"},{"revision":"26f53da55b198c8f8d31ab03654cc688","url":"ccs.svg"},{"revision":"c665bdc52bb33a4c5eea61129716dcca","url":"ccs.png"},{"revision":"8633caa23d0fdb5e85c20bff5c35fb82","url":"ccs.ico"},{"revision":"b8a8d9e913434b102ec8bdfe5d65c470","url":"ccs-module-test/index.html"},{"revision":"5318ece04ef3c672f8d8e2addbe9e5e7","url":"ccs-module-test/assets/vendor-DPmiLhLA.js"},{"revision":"c52e7d1ed4b3a2fe11653819569d0319","url":"ccs-module-test/assets/rolldown-runtime-DK3Fl9T5.js"},{"revision":"2c5d0748dd5f5b98ab5042a4250dc0ca","url":"ccs-module-test/assets/index-Dk1sne9I.css"},{"revision":"bebaf6b44c74798e097243ca82186982","url":"ccs-module-test/assets/index-Ca9P11Y6.js"},{"revision":"1500c5e0bab2c0c7b39742c9c99c5a13","url":"ccs-module-test/assets/cards-CCXJV4sC.css"},{"revision":"a8d61702e14f1d85cb31c71cf82b953f","url":"ccs-module-test/assets/cards-B7JmVCkd.js"},{"revision":"df52bfb99e7fc7e706c8cdf6c46c2388","url":"ccs-module-test/assets/SamplePage-vZL3PM0u.js"},{"revision":"7f5daa66dfd7853678d2742e8d34308b","url":"ccs-module-test/assets/OfflinePhotoPage-nWr8ViIy.js"},{"revision":"a46ea716b389638f61ab9d02afb69f71","url":"ccs-module-test/assets/OfflineDocsPage-eZqswf3g.js"},{"revision":"e33e882b459e027a266c9f356adaa465","url":"ccs-module-test/assets/AttendancePage-T66n_2jj.js"},{"revision":"5aa843b235b9a2701025350eceb8cc8c","url":"ccs-module-common/index.html"},{"revision":"fc2179ccaaad4041170dbaf3f921daae","url":"ccs-module-common/assets/vendor-CUtsDp8_.js"},{"revision":"08ca55b355bd83e41057a372c01ef196","url":"ccs-module-common/assets/index-DnjVZOUz.js"},{"revision":"8dd1fa7044e68c94af5860319208bc88","url":"ccs-module-common/assets/index-B-XZjTAA.css"},{"revision":"467f74687ebaecfd1de57e08696fb989","url":"ccs-module-common/assets/cards-UMJxN1go.js"},{"revision":"cb2c1b39a8b7722c8c214bb3d4a4eac6","url":"ccs-module-common/assets/cards-BnNpeJ5W.css"},{"revision":"728de628ea414b754213b0e3ca9ed4af","url":"ccs-module-common/assets/PortalWeakCurrentPage-BjiRuSBe.js"},{"revision":"14d88494ff390cd36e6852976fbdc7e6","url":"ccs-module-common/assets/PortalSoftFurnishingPage-C6NUOWgq.js"},{"revision":"830576a33b6f170a3073d38c82019103","url":"ccs-module-common/assets/PortalProcurementPage-Dw7N3Ciu.js"},{"revision":"dbaa00f8cc40a26b497c7baedea8c6ac","url":"ccs-module-common/assets/PortalProcessMechanicalPage-smoDS5NO.js"},{"revision":"496bc9e3dda8b6a9fe6da613a7ac8d66","url":"ccs-module-common/assets/PortalPowerElectricalPage-BOUmNHDs.js"},{"revision":"257266c8a25ceb09a283480e083d3920","url":"ccs-module-common/assets/PortalPlanningDesignPage-DGgjWe09.js"},{"revision":"61fe4a3e0fe634ff0daf3d9c6ac05c7a","url":"ccs-module-common/assets/PortalOperationsCenterPage-fTPwc5xI.js"},{"revision":"942a58815fded18719532d014923e29a","url":"ccs-module-common/assets/PortalLandscapePage-D-cB4BTM.js"},{"revision":"9d3ae203436f103eed23759a760e702a","url":"ccs-module-common/assets/PortalInvestmentPage-DKVqzroC.js"},{"revision":"0c943d71c4aa4ac11a69670b8e64111b","url":"ccs-module-common/assets/PortalInteriorFitOutPage-CCCnhz6H.js"},{"revision":"71da4b875a5a75e245dd92b018dff929","url":"ccs-module-common/assets/PortalHvacPage-7iRuFhPU.js"},{"revision":"1347431a621a2ec3aae6ab55bf5d3c59","url":"ccs-module-common/assets/PortalEngineeringPage-u7kMgkiL.js"},{"revision":"d3e9ec386d35c9f0274849ca67efa4ac","url":"ccs-module-common/assets/PortalEhsPage-B38T17Ym.js"},{"revision":"11256f907072b36e0161b275b33117d8","url":"ccs-module-common/assets/PortalCurtainWallPage-zhtkqugA.js"},{"revision":"8715193e7373082e52afec0ec33ac451","url":"ccs-module-common/assets/PortalCostPage-B55FoY_E.js"},{"revision":"13f350e64e58cac304122e716f8e5c35","url":"ccs-module-common/assets/PortalCivilEngineeringPage-D87AcLku.js"},{"revision":"5cc22bad527bf38f3617270145daad68","url":"ccs-module-common/assets/PortalAssetLibraryPage-BHBv-lV5.js"},{"revision":"f08a41c04e9e8f3085ea1cb8ff9471b8","url":"ccs-module-common/assets/PortalArchitecturePage-DeNpGv-4.js"},{"revision":"82cb850b6f280eaf816aeb1191b45a7f","url":"ccs-module-common/assets/PortalAcceptancePage-BSOn01z-.js"},{"revision":"fc3dce8654cce1702c406f20f93b134b","url":"ccs-module-common/assets/IframePage-usyTAjBG.js"},{"revision":"f42b7462eb9dd81cc873923fc5886098","url":"assets/vendor-D5E403Gu.js"},{"revision":"47eb6677670791246ef846196dea27ee","url":"assets/rolldown-runtime-Cyuzqnbw.js"},{"revision":"9a9feb7b8f4f62565873ad607cd43da9","url":"assets/index-jiD-aosW.js"},{"revision":"b06cd3f48e4a35619696db0169bf6642","url":"assets/index-BovxGzAh.css"}]);

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

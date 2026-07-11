importScripts('workbox-v7.4.1/workbox-sw.js');

workbox.setConfig({ debug: false, modulePathPrefix: 'workbox-v7.4.1/' });

const { precacheAndRoute, matchPrecache, createHandlerBoundToURL } = workbox.precaching;
const { NavigationRoute, registerRoute } = workbox.routing;
const { CacheFirst } = workbox.strategies;
const { ExpirationPlugin } = workbox.expiration;
const { CacheableResponsePlugin } = workbox.cacheableResponse;

precacheAndRoute([{"revision":"a084d8fd132d354be6cd802cd89fcffc","url":"manifest.json"},{"revision":"86093b324cbe39fc1d12dac15340c859","url":"index.html"},{"revision":"26f53da55b198c8f8d31ab03654cc688","url":"ccs.svg"},{"revision":"c665bdc52bb33a4c5eea61129716dcca","url":"ccs.png"},{"revision":"8633caa23d0fdb5e85c20bff5c35fb82","url":"ccs.ico"},{"revision":"c495c8f228452ecec6c340e6a2b112d2","url":"ccs-module-test/index.html"},{"revision":"6f6df117273576dd4e40db9e831d8ecf","url":"ccs-module-test/assets/vendor-BWtKax2A.js"},{"revision":"c52e7d1ed4b3a2fe11653819569d0319","url":"ccs-module-test/assets/rolldown-runtime-DK3Fl9T5.js"},{"revision":"2c5d0748dd5f5b98ab5042a4250dc0ca","url":"ccs-module-test/assets/index-Dk1sne9I.css"},{"revision":"89a81abe6fc86bddb6dd14baec2bee05","url":"ccs-module-test/assets/index-CtMFBihF.js"},{"revision":"cc327d1931f72f87945c7b96a9dbdc02","url":"ccs-module-test/assets/cards-ChZBeeZP.js"},{"revision":"1500c5e0bab2c0c7b39742c9c99c5a13","url":"ccs-module-test/assets/cards-CCXJV4sC.css"},{"revision":"14bbd87c3eeb583907f1518889bbaa1a","url":"ccs-module-test/assets/SamplePage-CodZqsy0.js"},{"revision":"b5d3fd130d93864d5e63fd73355b9286","url":"ccs-module-test/assets/OfflinePhotoPage-DEKM-dSr.js"},{"revision":"96a910251b5d5bb2bbff2e5ef89d53c6","url":"ccs-module-test/assets/OfflineDocsPage-UH4RSznu.js"},{"revision":"c6e88ca47987418cead2582fe00b0d67","url":"ccs-module-test/assets/AttendancePage-zIhMyVUY.js"},{"revision":"8e9d88ac01e05e541470469d0dd0a9a1","url":"ccs-module-common/index.html"},{"revision":"178c211ad89c1e4741eb8cad3018215d","url":"ccs-module-common/assets/vendor-CV4BM-rl.js"},{"revision":"6482488a5abdaaed0b1ce3989c06e4e7","url":"ccs-module-common/assets/index-BcfszF2H.js"},{"revision":"8dd1fa7044e68c94af5860319208bc88","url":"ccs-module-common/assets/index-B-XZjTAA.css"},{"revision":"c043b510d6ed2b9d78f3569647d4bdce","url":"ccs-module-common/assets/cards-Dm1j3gor.js"},{"revision":"cb2c1b39a8b7722c8c214bb3d4a4eac6","url":"ccs-module-common/assets/cards-BnNpeJ5W.css"},{"revision":"6a0b6ead5cd3cda5091635c3561f4a4d","url":"ccs-module-common/assets/PortalWeakCurrentPage-4ul1E_43.js"},{"revision":"916927a9397e8df8070335f7d9eb7037","url":"ccs-module-common/assets/PortalSoftFurnishingPage-CdzMWP6g.js"},{"revision":"748d178fd32fc025585746ad08124114","url":"ccs-module-common/assets/PortalProcurementPage-D0F9mw-8.js"},{"revision":"4ce87ad21dca9f6eab1f6739fa6a691a","url":"ccs-module-common/assets/PortalProcessMechanicalPage-CKSGNNa_.js"},{"revision":"90e4d3a8af564be2983dbc42c87dbd45","url":"ccs-module-common/assets/PortalPowerElectricalPage-Csxc_Ml8.js"},{"revision":"dd69dbbb1486f17d893bd70d32b3de25","url":"ccs-module-common/assets/PortalPlanningDesignPage-DPyEDKPQ.js"},{"revision":"b1e7c4d7955d67adef1b8b6416116fe9","url":"ccs-module-common/assets/PortalOperationsCenterPage-BWTunykh.js"},{"revision":"73162f5ef47a62d19fd715db821abb90","url":"ccs-module-common/assets/PortalLandscapePage-CNo2r04_.js"},{"revision":"898e024134c03b612e58dd7aecdc5f45","url":"ccs-module-common/assets/PortalInvestmentPage-BliiJ4Db.js"},{"revision":"247450d0ea4d200865c84395e2000d46","url":"ccs-module-common/assets/PortalInteriorFitOutPage-DMVk41u9.js"},{"revision":"c6089a1c0c924647bc6fe1b9185a308f","url":"ccs-module-common/assets/PortalHvacPage-NVMR-68p.js"},{"revision":"955511de15f9bfe24db322a950001fca","url":"ccs-module-common/assets/PortalEngineeringPage-Dv4_gXnu.js"},{"revision":"d0e58b440518008db01ca0f739e90e0e","url":"ccs-module-common/assets/PortalEhsPage-DUdKql_v.js"},{"revision":"a9a28623b28ef56b795b0a8e554cf704","url":"ccs-module-common/assets/PortalCurtainWallPage-CrTa7DAC.js"},{"revision":"be059af99d3b5784722f4dd4d729ed6e","url":"ccs-module-common/assets/PortalCostPage-VaiBf1pI.js"},{"revision":"503a780cb86e3dfb8c0f78447283a47c","url":"ccs-module-common/assets/PortalCivilEngineeringPage-Om4khaMx.js"},{"revision":"1dd7ba925f25f4161ebcf55412967ab9","url":"ccs-module-common/assets/PortalAssetLibraryPage-BOiuibF-.js"},{"revision":"a0a87a2f81d7cb1ba53119bc7849584a","url":"ccs-module-common/assets/PortalArchitecturePage-AbUakPgB.js"},{"revision":"9b2af64a6316bad3a72772afd1b02929","url":"ccs-module-common/assets/PortalAcceptancePage-DoQclntX.js"},{"revision":"c45ffec043faa992ecbb566c389a3175","url":"ccs-module-common/assets/IframePage-DmRDz5qX.js"},{"revision":"1b9c62cc929cbd63477e2f6c34df4944","url":"assets/vendor-DeBNjotc.js"},{"revision":"47eb6677670791246ef846196dea27ee","url":"assets/rolldown-runtime-Cyuzqnbw.js"},{"revision":"98c8050685b2358c6923dabbbb217f12","url":"assets/index-C9Lk41Po.js"},{"revision":"b06cd3f48e4a35619696db0169bf6642","url":"assets/index-BovxGzAh.css"}]);

// Main framework SPA navigation
const mainFrameworkHandler = createHandlerBoundToURL('/index.html');
registerRoute(
  new NavigationRoute(mainFrameworkHandler, {
    denylist: [/^\/ccs-module-/]
  })
);

// Module SPAs navigation
registerRoute(
  ({ request, url }) => {
    if (!url.pathname.match(/^\/ccs-module-/)) return false;
    return request.mode === 'navigate' || request.destination === 'iframe' || request.destination === 'document';
  },
  async ({ url, request, event }) => {
    try {
      const moduleName = url.pathname.split('/')[1];

      // Try to match the module's index.html in the precache
      const cacheKey = `${moduleName}/index.html`;

      try {
        const handler = createHandlerBoundToURL(cacheKey);
        return await handler({ url, request, event });
      } catch (err) {
        // Fallback to matchPrecache if createHandlerBoundToURL fails
        const response = (await matchPrecache(cacheKey)) || (await matchPrecache(`/${cacheKey}`));
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

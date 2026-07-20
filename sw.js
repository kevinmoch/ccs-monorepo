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

precacheAndRoute([{"revision":"327e2f80b8cf341ff6694a62d9fe8bf1","url":"manifest.json"},{"revision":"7ba0f0b040e65d995e3345b424ef287a","url":"index.html"},{"revision":"12c5facbd6455d1c408311781f785cfe","url":"ccs.svg"},{"revision":"2c7e7af02bd9e3ca514c9702a640d935","url":"ccs.png"},{"revision":"449247a455c03ac8b359871eb6124ce4","url":"ccs.ico"},{"revision":"30d0d16f5df20dce187d7aab184fb1d8","url":"ierp/index.html"},{"revision":"e260d4df35b30dac1871a5d088c2490e","url":"ierp/monorepo/proxy.html"},{"revision":"f8865a00df5b6f686f0f014090509f96","url":"ccs-module-test/index.html"},{"revision":"5318ece04ef3c672f8d8e2addbe9e5e7","url":"ccs-module-test/assets/vendor-DPmiLhLA.js"},{"revision":"c52e7d1ed4b3a2fe11653819569d0319","url":"ccs-module-test/assets/rolldown-runtime-DK3Fl9T5.js"},{"revision":"2c5d0748dd5f5b98ab5042a4250dc0ca","url":"ccs-module-test/assets/index-Dk1sne9I.css"},{"revision":"60f4f8e34adf173f5f32f46e7437b86f","url":"ccs-module-test/assets/index-DM1dq0bC.js"},{"revision":"0f91e781a7156b9c8baf660c12f217df","url":"ccs-module-test/assets/cards-yZusEQx5.js"},{"revision":"e9349e4fdad958ba97ef5a033d9fe4dd","url":"ccs-module-test/assets/cards-Cnnw4utO.css"},{"revision":"2798e5a9e6c5240fdfe6875b6c7099cd","url":"ccs-module-test/assets/SamplePage-DDJ9NSJ_.js"},{"revision":"b6a0b43c3925852ee31cf2cbd18bd9e6","url":"ccs-module-test/assets/OfflinePhotoPage-Cyy06xsw.js"},{"revision":"bec68c9028e0c36e8348b0f2e5682dde","url":"ccs-module-test/assets/OfflineDocsPage-B58KJp-c.js"},{"revision":"10dc9e4ec6722a0f392c6860bb056e2f","url":"ccs-module-test/assets/AttendancePage-BQCK-MMy.js"},{"revision":"0a8a6a555139aff63497e39bd19a6e81","url":"ccs-module-common/index.html"},{"revision":"fc2179ccaaad4041170dbaf3f921daae","url":"ccs-module-common/assets/vendor-CUtsDp8_.js"},{"revision":"aa9919650b11e2c169eb7fdd44615d27","url":"ccs-module-common/assets/index-C0cI82uB.js"},{"revision":"8dd1fa7044e68c94af5860319208bc88","url":"ccs-module-common/assets/index-B-XZjTAA.css"},{"revision":"cb2c1b39a8b7722c8c214bb3d4a4eac6","url":"ccs-module-common/assets/cards-BnNpeJ5W.css"},{"revision":"283816577cd6e56c595833086345ee00","url":"ccs-module-common/assets/cards-BekmNh4n.js"},{"revision":"05717a0af717860735b749c425fd7e33","url":"ccs-module-common/assets/PortalWeakCurrentPage-BGnFMFpL.js"},{"revision":"3504c32cd64d02526cb1d8a44c2c800b","url":"ccs-module-common/assets/PortalSoftFurnishingPage-C5APYtBJ.js"},{"revision":"9e7ee2eda98b9b301155ce92cdd59604","url":"ccs-module-common/assets/PortalProcurementPage-DO0Vvk0T.js"},{"revision":"57fc303a03c73849fc0107da6814fe56","url":"ccs-module-common/assets/PortalProcessMechanicalPage-CaEg1M7k.js"},{"revision":"cbec09713481bd36256a92f0a3cbb73b","url":"ccs-module-common/assets/PortalPowerElectricalPage-BzAl8wDb.js"},{"revision":"03e8cc2ae46cab66f95f557d0b2f294f","url":"ccs-module-common/assets/PortalPlanningDesignPage-yPK6DK1a.js"},{"revision":"bb934c1c52934bdcdc2e9ccd67c2e8cc","url":"ccs-module-common/assets/PortalOperationsCenterPage-CXlufi0h.js"},{"revision":"fd3e171ab0733b5001d6d32767c464da","url":"ccs-module-common/assets/PortalLandscapePage-Cy26Vr3C.js"},{"revision":"cd63c0b757ca70d72e56f8d53bb955ab","url":"ccs-module-common/assets/PortalInvestmentPage-vwJWCf5f.js"},{"revision":"178c4e4248ec7330c5c86d70edbbe52a","url":"ccs-module-common/assets/PortalInteriorFitOutPage-gjKaMyRn.js"},{"revision":"ae3f80b5a979c413f768dc3e8703c424","url":"ccs-module-common/assets/PortalHvacPage-DvhcFEh8.js"},{"revision":"725913516f8d00fdf37cecfc26ede004","url":"ccs-module-common/assets/PortalEngineeringPage-DoGoMglA.js"},{"revision":"6e3fa22f2433db7b7d7c9baa168be51f","url":"ccs-module-common/assets/PortalEhsPage-DQuFGImL.js"},{"revision":"ebcc8124a4e8ef3a7461a6aa9277b7f8","url":"ccs-module-common/assets/PortalCurtainWallPage-DCx1bsV3.js"},{"revision":"e06cbc0fc64f8a6194a1667e16264ce2","url":"ccs-module-common/assets/PortalCostPage-LJQr89Op.js"},{"revision":"30fd86d65f30f23260a1a6b07a8def9f","url":"ccs-module-common/assets/PortalCivilEngineeringPage-N7ddLLCD.js"},{"revision":"a97c03f11643812d57694524c5f8fa13","url":"ccs-module-common/assets/PortalAssetLibraryPage-CBYrfyWk.js"},{"revision":"7e56efa8f6a687384fe0f13fad7d1cae","url":"ccs-module-common/assets/PortalArchitecturePage-D9ptnG2C.js"},{"revision":"daf4f7d2652a2bf166c994787b297a23","url":"ccs-module-common/assets/PortalAcceptancePage-d1gHHXOE.js"},{"revision":"19c55aa07eb210dc4143bbc3a35563e3","url":"ccs-module-common/assets/IframePage-CcO0VJQZ.js"},{"revision":"ca225d205388dffae8549decc5a86365","url":"assets/vendor-CCmfyA3d.js"},{"revision":"47eb6677670791246ef846196dea27ee","url":"assets/rolldown-runtime-Cyuzqnbw.js"},{"revision":"ddaa44ce3531d25d4d8b1f57fb483057","url":"assets/index-D25r5IAy.css"},{"revision":"263535881b81a204785bf2e45f6e89aa","url":"assets/index-B6EjPeQD.js"}]);

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

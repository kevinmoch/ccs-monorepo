import { createVueModuleManifest, type MicroModuleManifest } from '@ccs/shared';
export const moduleManifests: MicroModuleManifest[] = [
  createVueModuleManifest({
    name: 'ccs-module-demo', title: '示例业务模块', url: import.meta.env.DEV ? 'http://localhost:5174' : '/ccs-module-demo/', baseRoute: '/modules/demo', devPort: 5174,
    menus: [
      { id: 'demo-dashboard', title: '经营看板', path: '/modules/demo/dashboard', permission: 'module:demo:view' },
      { id: 'demo-orders', title: '订单中心', path: '/modules/demo/orders', permission: 'order:view' }
    ]
  }),
    createVueModuleManifest({
    name: 'ccs-module-order',
    title: 'Order',
    url: import.meta.env.DEV ? 'http://localhost:5175' : '/ccs-module-order/',
    baseRoute: '/modules/order',
    devPort: 5175
  }),
// ccs-cli:module
];
export async function loadModuleManifests(): Promise<MicroModuleManifest[]> {
  const remoteUrl = import.meta.env.VITE_REMOTE_MENU_URL;
  if (!remoteUrl) return moduleManifests;
  try { const remote = await fetch(remoteUrl).then((res) => res.json()); return [...moduleManifests, ...remote.modules]; }
  catch (error) { console.warn('[ccs-framework] remote menu loading failed, fallback to local registry', error); return moduleManifests; }
}

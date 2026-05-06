import { expect, it } from 'vitest';
import { createVueModuleManifest, flattenMenus } from '../src/menu';
it('creates micro module manifest and flattens menus', () => {
  const manifest = createVueModuleManifest({ name: 'ccs-module-order', title: '订单模块', url: 'http://localhost:5175', baseRoute: '/modules/order', devPort: 5175 });
  expect(manifest.menuItems[0].kind).toBe('micro');
  expect(flattenMenus(manifest.menuItems)).toHaveLength(1);
});

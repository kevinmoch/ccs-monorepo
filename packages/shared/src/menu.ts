export type MenuKind = 'local' | 'micro';
export interface PortalMenuItem {
  id: string;
  title: string;
  path: string;
  kind: MenuKind;
  icon?: string;
  permission?: string;
  moduleName?: string;
  children?: PortalMenuItem[];
}
export interface MicroModuleManifest {
  name: string;
  title: string;
  url: string;
  baseRoute: string;
  devPort: number;
  permissions?: string[];
  menuItems: PortalMenuItem[];
}
export function createVueModuleManifest(options: {
  name: string;
  title: string;
  url: string;
  baseRoute: string;
  devPort: number;
  menus?: Array<Omit<PortalMenuItem, 'kind' | 'moduleName'>>;
}): MicroModuleManifest {
  const menuItems = (options.menus?.length ? options.menus : [{ id: `${options.name}-dashboard`, title: options.title, path: options.baseRoute }]).map((item) => ({
    ...item,
    kind: 'micro' as const,
    moduleName: options.name,
    path: item.path.startsWith('/') ? item.path : `${options.baseRoute}/${item.path}`
  }));
  return { name: options.name, title: options.title, url: options.url, baseRoute: options.baseRoute, devPort: options.devPort, menuItems };
}
export function flattenMenus(items: PortalMenuItem[]): PortalMenuItem[] {
  return items.flatMap((item) => [item, ...flattenMenus(item.children ?? [])]);
}

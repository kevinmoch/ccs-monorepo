import type { PortalMenuItem } from './menu';
export interface UserSession {
  id: string;
  name: string;
  roles: string[];
  permissions: string[];
}
export function canAccess(permission: string | undefined, session: UserSession) {
  return !permission || session.permissions.includes(permission) || session.roles.includes('admin');
}
export function filterMenusByPermission(items: PortalMenuItem[], session: UserSession): PortalMenuItem[] {
  return items.filter((item) => canAccess(item.permission, session)).map((item) => ({ ...item, children: item.children ? filterMenusByPermission(item.children, session) : undefined }));
}

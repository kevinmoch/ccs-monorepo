export function toKebabCase(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();
}
export function toPascalCase(value: string) {
  return toKebabCase(value)
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}
export function titleFromName(value: string) {
  return toKebabCase(value)
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
export function moduleBaseRoute(name: string) {
  return `/modules/${toKebabCase(name).replace(/^ccs-module-/, '')}`;
}

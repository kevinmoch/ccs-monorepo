import { expect, it } from 'vitest';
import { moduleBaseRoute, toKebabCase, toPascalCase } from '../src/utils';
it('normalizes names', () => {
  expect(toKebabCase('UserStat')).toBe('user-stat');
  expect(toPascalCase('user-stat')).toBe('UserStat');
  expect(moduleBaseRoute('ccs-module-order')).toBe('/modules/order');
});

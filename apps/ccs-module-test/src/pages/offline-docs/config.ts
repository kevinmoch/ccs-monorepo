import type { CardDefinition } from '@ccs/ui-vue';
export default {
  cards: [
    {
      id: 'offline-docs-title',
      layout: { colSpan: { base: 12, md: 6 }, rowSpan: 2 }
    },
    {
      id: 'offline-docs-cache',
      layout: { colSpan: { base: 12, md: 6 }, rowSpan: 2 }
    },
    {
      id: 'offline-docs-list',
      layout: { colSpan: { base: 12, md: 12 }, rowSpan: 4 }
    }
  ] satisfies CardDefinition[]
};

import type { CardDefinition } from '@ccs/ui-vue';
export default {
  cards: [
    {
      type: 'offline-docs-title',
      layout: { colSpan: { base: 12, md: 6 }, rowSpan: 2 }
    },
    {
      type: 'offline-docs-cache',
      layout: { colSpan: { base: 12, md: 6 }, rowSpan: 2 }
    },
    {
      type: 'offline-docs-list',
      layout: { colSpan: { base: 12, md: 12 }, rowSpan: 4 }
    }
  ] satisfies CardDefinition[]
};

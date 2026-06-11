import type { CardDefinition } from '@ccs/ui-vue';
export default {
  cards: [
    {
      type: 'title',
      layout: { colSpan: { base: 12, md: 12 }, rowSpan: 1 }
    },
    {
      type: 'geolocation',
      layout: { colSpan: { base: 12, md: 6 }, rowSpan: 3 }
    },
    {
      type: 'stat',
      layout: { colSpan: { base: 12, md: 6 }, rowSpan: 3 }
    },
    {
      type: 'list',
      layout: { colSpan: { base: 12, md: 12 }, rowSpan: 2 }
    }
  ] satisfies CardDefinition[]
};

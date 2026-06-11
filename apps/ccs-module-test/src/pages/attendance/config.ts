import type { CardDefinition } from '@ccs/ui-vue';
export default {
  cards: [
    {
      type: 'attendance-title',
      layout: { colSpan: { base: 12, md: 12 }, rowSpan: 2 }
    },
    {
      type: 'attendance-geolocation',
      layout: { colSpan: { base: 12, md: 6 }, rowSpan: 3 }
    },
    {
      type: 'attendance-shift',
      layout: { colSpan: { base: 12, md: 6 }, rowSpan: 3 }
    },
    {
      type: 'attendance-list',
      layout: { colSpan: { base: 12, md: 12 }, rowSpan: 2 }
    }
  ] satisfies CardDefinition[]
};

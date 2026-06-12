import type { CardDefinition } from '@ccs/ui-vue';
export default {
  cards: [
    {
      type: 'offline-photo-title',
      layout: { colSpan: { base: 12, md: 6 }, rowSpan: 2 }
    },
    {
      type: 'offline-photo-cache',
      layout: { colSpan: { base: 12, md: 6 }, rowSpan: 2 }
    },
    {
      type: 'offline-photo-camera',
      layout: { colSpan: { base: 12, md: 6 }, rowSpan: 2 }
    },
    {
      type: 'offline-photo-upload',
      layout: { colSpan: { base: 12, md: 6 }, rowSpan: 2 }
    },
    {
      type: 'offline-photo-list',
      layout: { colSpan: { base: 12, md: 12 }, rowSpan: 3 }
    }
  ] satisfies CardDefinition[]
};

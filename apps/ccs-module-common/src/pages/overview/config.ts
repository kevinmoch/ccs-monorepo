import type { CardDefinition } from '@ccs/card';
export default {
  cards: [
    {
      id: 'test',
      rowSpan: 2,
      colSpan: { base: 6, md: 6 }
    }
  ] satisfies CardDefinition[]
};

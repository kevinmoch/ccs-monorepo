import type { CardDefinition } from '@ccs/card';
export default {
  cards: [
    {
      id: 'iframe',
      rowSpan: 12,
      colSpan: { base: 12, md: 12 },
      props: {
        url: 'https://jijian.huawei.com/'
      }
    }
  ] satisfies CardDefinition[]
};

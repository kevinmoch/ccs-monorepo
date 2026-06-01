import type { CardDefinition } from '@ccs/ui-vue';
export default {
  cards: [
    {
      type: 'user-stat',
      title: { 'zh-CN': '用户规模', 'en-US': 'User Scale' },
      layout: { colSpan: { base: 12, md: 6 }, rowSpan: 3 },
      props: {
        label: { 'zh-CN': '活跃用户', 'en-US': 'Active Users' },
        value: '12,860',
        trend: { 'zh-CN': '+18% 环比增长', 'en-US': '+18% MoM' }
      }
    }
  ] satisfies CardDefinition[]
};

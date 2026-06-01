import type { CardDefinition } from '@ccs/ui-vue';
export default {
  cards: [
    {
      type: 'user-stat',
      title: { 'zh-CN': '订单效率', 'en-US': 'Order Efficiency' },
      layout: { colSpan: { base: 6, md: 4 }, rowSpan: 3 },
      props: {
        label: { 'zh-CN': '本周完成', 'en-US': 'Closed This Week' },
        value: 986,
        trend: { 'zh-CN': '+12% 较上周', 'en-US': '+12% WoW' }
      }
    },
    {
      type: 'user-stat',
      title: { 'zh-CN': '待办负载', 'en-US': 'Todo Load' },
      layout: { colSpan: { base: 6, md: 4 }, rowSpan: 3 },
      props: {
        label: { 'zh-CN': '打开事项', 'en-US': 'Open Items' },
        value: 7,
        trend: { 'zh-CN': '3 项今日到期', 'en-US': '3 due today' }
      }
    }
  ] satisfies CardDefinition[]
};

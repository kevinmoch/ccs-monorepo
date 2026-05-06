import type { CardDefinition } from '@ccs/ui-vue';
export default {
  cards: [
    { type: 'order-chart', props: { total: 2451, growth: 22 } },
    { type: 'todo-list', props: { count: 3 } },
    { type: 'user-stat', props: { total: 8640, growth: 9 } }
  ] satisfies CardDefinition[]
};

import type { CardDefinition } from '@ccs/ui-vue';
export default {
  cards: [
    { type: 'user-stat', props: { total: 12860, growth: 18 } },
    { type: 'order-chart', props: { total: 986, growth: 12 } },
    { type: 'todo-list', props: { count: 7 } }
  ] satisfies CardDefinition[]
};

import { createCardRegistry } from '@ccs/ui-vue';
import UserStatCard from './UserStatCard.vue';
import OrderChartCard from './OrderChartCard.vue';
import TodoListCard from './TodoListCard.vue';
// ccs-cli:card-import
export const cardRegistry = createCardRegistry({
  'user-stat': UserStatCard,
  'order-chart': OrderChartCard,
  'todo-list': TodoListCard // ccs-cli:card-register
});

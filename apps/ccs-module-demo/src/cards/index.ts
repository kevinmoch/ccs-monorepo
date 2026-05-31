import { createCardRegistry } from '@ccs/ui-vue';
import UserStatCard from './UserStatCard.vue';
// ccs-cli:card-import
export const cardRegistry = createCardRegistry({
  'user-stat': UserStatCard,
  // ccs-cli:card-register
});

import { createCardRegistry } from '@ccs/ui-vue';
import UserStatCard from './UserStatCard.vue';
import AdminStatCard from './AdminStatCard.vue';
// ccs-cli:card-import
export const cardRegistry = createCardRegistry({
  'user-stat': UserStatCard,
  'admin-stat': AdminStatCard,
	// ccs-cli:card-register
});

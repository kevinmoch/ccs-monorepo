import { createCardRegistry } from '@ccs/ui-vue';
import StatCard from './StatCard.vue';
import TitleCard from './TitleCard.vue';
import ListCard from './ListCard.vue';
import GeolocationCard from './GeolocationCard.vue';
// ccs-cli:card-import
export const cardRegistry = createCardRegistry({
  stat: StatCard,
  title: TitleCard,
  list: ListCard,
  geolocation: GeolocationCard
  // ccs-cli:card-register
});

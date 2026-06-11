import { createCardRegistry } from '@ccs/ui-vue';
import StatCard from './StatCard.vue';
import TitleCard from './TitleCard.vue';
import ListCard from './ListCard.vue';
import GeolocationCard from './GeolocationCard.vue';
import OfflineDocsCard from './OfflineDocsCard.vue';
import OfflinePhotoCard from './OfflinePhotoCard.vue';
// ccs-cli:card-import
export const cardRegistry = createCardRegistry({
  'stat': StatCard,
  'title': TitleCard,
  'list': ListCard,
  'geolocation': GeolocationCard,
  'offline-docs': OfflineDocsCard,
  'offline-photo': OfflinePhotoCard,
	// ccs-cli:card-register
});

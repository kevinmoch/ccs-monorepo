import { createCardRegistry } from '@ccs/ui-vue';
import AttendanceShiftCard from './AttendanceShiftCard.vue';
import AttendanceTitleCard from './AttendanceTitleCard.vue';
import AttendanceListCard from './AttendanceListCard.vue';
import AttendanceGeolocationCard from './AttendanceGeolocationCard.vue';
import OfflineDocsTitleCard from './OfflineDocsTitleCard.vue';
import OfflineDocsListCard from './OfflineDocsListCard.vue';
import OfflineDocsCacheCard from './OfflineDocsCacheCard.vue';
// ccs-cli:card-import
export const cardRegistry = createCardRegistry({
  'attendance-shift': AttendanceShiftCard,
  'attendance-title': AttendanceTitleCard,
  'attendance-list': AttendanceListCard,
  'attendance-geolocation': AttendanceGeolocationCard,
  'offline-docs-title': OfflineDocsTitleCard,
  'offline-docs-list': OfflineDocsListCard,
  'offline-docs-cache': OfflineDocsCacheCard
  // ccs-cli:card-register
});

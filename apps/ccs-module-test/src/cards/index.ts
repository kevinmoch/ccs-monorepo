import { createCardRegistry } from '@ccs/ui-vue';
import AttendanceShiftCard from './AttendanceShiftCard.vue';
import AttendanceTitleCard from './AttendanceTitleCard.vue';
import AttendanceListCard from './AttendanceListCard.vue';
import AttendanceGeolocationCard from './AttendanceGeolocationCard.vue';
// ccs-cli:card-import
export const cardRegistry = createCardRegistry({
  'attendance-shift': AttendanceShiftCard,
  'attendance-title': AttendanceTitleCard,
  'attendance-list': AttendanceListCard,
  'attendance-geolocation': AttendanceGeolocationCard
  // ccs-cli:card-register
});

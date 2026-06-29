import { createCardRegistry } from '@ccs/card';
import AttendanceShiftCard from './AttendanceShiftCard.vue';
import AttendanceTitleCard from './AttendanceTitleCard.vue';
import AttendanceListCard from './AttendanceListCard.vue';
import AttendanceGeolocationCard from './AttendanceGeolocationCard.vue';
import OfflineDocsTitleCard from './OfflineDocsTitleCard.vue';
import OfflineDocsListCard from './OfflineDocsListCard.vue';
import OfflineDocsCacheCard from './OfflineDocsCacheCard.vue';
import OfflinePhotoTitleCard from './OfflinePhotoTitleCard.vue';
import OfflinePhotoCameraCard from './OfflinePhotoCameraCard.vue';
import OfflinePhotoListCard from './OfflinePhotoListCard.vue';
import OfflinePhotoUploadCard from './OfflinePhotoUploadCard.vue';
import OfflinePhotoCacheCard from './OfflinePhotoCacheCard.vue';
import SampleHeaderCard from './SampleHeaderCard.vue';
import SampleStatCard from './SampleStatCard.vue';
import SampleDrawingCard from './SampleDrawingCard.vue';
// ccs-cli:card-import
export const cardRegistry = createCardRegistry({
  'attendance-shift': AttendanceShiftCard,
  'attendance-title': AttendanceTitleCard,
  'attendance-list': AttendanceListCard,
  'attendance-geolocation': AttendanceGeolocationCard,
  'offline-docs-title': OfflineDocsTitleCard,
  'offline-docs-list': OfflineDocsListCard,
  'offline-docs-cache': OfflineDocsCacheCard,
  'offline-photo-title': OfflinePhotoTitleCard,
  'offline-photo-camera': OfflinePhotoCameraCard,
  'offline-photo-list': OfflinePhotoListCard,
  'offline-photo-upload': OfflinePhotoUploadCard,
  'offline-photo-cache': OfflinePhotoCacheCard,
  'sample-header': SampleHeaderCard,
  'sample-stat-1': SampleStatCard,
  'sample-stat-2': SampleStatCard,
  'sample-stat-3': SampleStatCard,
  'sample-stat-4': SampleStatCard,
  'sample-drawing-1': SampleDrawingCard,
  'sample-drawing-2': SampleDrawingCard
  // ccs-cli:card-register
});

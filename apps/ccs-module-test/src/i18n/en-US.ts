/**
 * English i18n resources
 * Organized by domain with nested structure to avoid key collisions.
 */
export default {
  attendance: {
    // AttendanceShiftCard
    shiftInfo: 'Shift Info',
    flexWindow: 'Flex Window',
    minutes: 'min',
    attendanceRange: 'Range',
    mobilePunch: 'Mobile Punch',
    checkInTitle: 'Check-in',
    checkOutTitle: 'Check-out',
    target: 'Target',
    notPunched: 'Not punched',
    meter: 'm',

    // AttendanceTitleCard
    attendance: 'Attendance',
    locale: 'en-US',
    statusDone: 'Completed today',
    statusIn: 'Checked in, pending check-out',
    statusPending: 'Pending check-in',

    // AttendanceListCard
    locationMethod: 'Location Method',

    // AttendanceGeolocationCard
    currentTime: 'Current Time',
    locating: 'Locating...',
    updateLocation: 'Update Location',
    checkIn: 'Check In',
    checkOut: 'Check Out',
    waitingLocation: 'Acquiring location...',
    accuracyPrefix: 'Accuracy ~'
  },

  offlineDocs: {
    // OfflineDocsTitleCard
    offlineDocs: 'Offline Docs',
    online: 'Online',
    offline: 'Offline',
    usedSpace: 'Used Space',
    quota: 'Quota',
    offlineStorage: 'Storage',
    available: 'Available',
    unavailable: 'Unavailable',

    // OfflineDocsListCard
    docList: 'Document List',
    checking: 'Checking',
    checkUpdates: 'Check Updates',
    documents: 'docs',
    loading: 'Loading documents...',
    selectToClear: 'Select to clear cache',
    noCache: 'No cache',
    updated: 'Updated',
    cached: 'Cached',
    docSite: 'Doc Site',
    remoteDoc: 'Remote',
    resuming: 'Resuming',
    downloading: 'Downloading',
    viewOnline: 'View Online',
    cacheLocal: 'Cache Local',
    viewOffline: 'View Offline',
    updateCache: 'Update Cache',
    deleteCache: 'Delete Cache',
    statusNotDownloaded: 'Not Downloaded',
    statusDownloading: 'Downloading',
    statusOffline: 'Offline',
    statusUpdateAvailable: 'Update Available',
    statusFailed: 'Failed',

    // OfflineDocsCacheCard
    cacheMgmt: 'Cache Management',
    cachedFiles: 'Cached',
    partialFiles: 'Partial',
    metadata: 'Metadata',
    selected: 'Selected',
    lruHint: 'Enable LRU',
    clearSelected: 'Clear Selected',
    clearOldest: 'Clear Oldest',
    clearAll: 'Clear All'
  },

  offlinePhoto: {
    // OfflinePhotoTitleCard
    offlinePhoto: 'Offline Photo',
    total: '',
    photos: 'photos',
    usedSpace: 'Used Space',
    offlineStorage: 'Storage',
    available: 'Available',
    unavailable: 'Unavailable',

    // OfflinePhotoCameraCard
    photoCapture: 'Photo Capture',
    allPhotosOffline: 'Photos saved offline first',
    capturing: 'Processing...',
    nativeCapture: 'Open Camera',
    webCapture: 'Open Camera',
    cancel: 'Cancel',
    saving: 'Saving...',
    takePhoto: 'Capture',

    // OfflinePhotoListCard
    offlinePhotos: 'Offline Photos',
    loading: 'Loading album...',
    noPhotosHint: 'No photos yet, tap capture to start',
    noPreview: 'No Preview',
    view: 'View',
    delete: 'Delete',

    // common
    close: 'Close',

    // OfflinePhotoUploadCard
    uploadPhoto: 'Upload Photo',
    uploadUrl: 'Upload URL',
    uploading: 'Uploading...',
    upload: 'Upload Selected',

    // OfflinePhotoCacheCard
    albumMgmt: 'Album Management',
    selected: 'Selected',
    photoFiles: 'Photo Files',
    metadata: 'Metadata',
    deleteSelected: 'Delete Selected',
    clearAll: 'Clear All'
  }
};

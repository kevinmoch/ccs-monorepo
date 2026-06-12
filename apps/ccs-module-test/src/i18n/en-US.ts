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
    accuracyPrefix: 'Accuracy ~',

    // Store: accuracyLevel
    accuracyHigh: 'High',
    accuracyOk: 'Usable',
    accuracyReview: 'Review',
    accuracyNone: 'No Fix'
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
    clearAll: 'Clear All',

    // Store: pressureLabel
    opfsUnavailable: 'OPFS Unavailable',
    spaceMonitoring: 'Monitoring space...',
    spaceTight: 'Space tight',
    spaceNearWatermark: 'Near watermark',
    spaceNormal: 'Normal',

    // Store: actions & helpers (page messages)
    offlineCantOpenOnline: 'Offline, unable to open online document',
    noCacheAvailable: 'No cache available, please cache locally first',
    cacheMismatch: 'Local cache differs from server manifest, please update cache',
    preparingDownload: 'Preparing download',
    cacheUpdated: 'Cache updated: {title}',
    cacheLocalDone: 'Cached locally: {title}',
    offlineCantCheckUpdates: 'Offline, unable to check for updates',
    updateCheckDone: 'Update check complete',
    lruCleared: 'LRU cleared: {title}',
    notRecorded: 'Not recorded'
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
    cannotOpenCamera: 'Cannot open camera',
    cameraNotReady: 'Camera not ready',
    canvasUnsupported: 'Canvas capture not supported',
    captureFailed: 'Capture failed',

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
    clearAll: 'Clear All',

    // Store: state & actions
    detecting: 'Detecting...',
    storageUnavailable: 'Offline photo storage unavailable',
    photoSavedOffline: 'Photo saved offline',
    selectedPhotosDeleted: 'Selected photos deleted',
    allPhotosCleared: 'All photos cleared',
    selectPhotosFirst: 'Please select photos in the list first',
    enterUploadUrl: 'Please enter upload URL',
    uploadingProgress: 'Uploading ({current}/{total})...',
    photosUploaded: '{count} uploaded',
    photosFailed: '{count} failed',
    uploadComplete: 'Upload complete',

    // Store: display helpers
    localOnly: 'Local only',
    uploaded: 'Uploaded',
    uploadFailed: 'Upload failed',
    camera: 'Camera',
    file: 'File',
    notRecorded: 'Not recorded',
    unknownDimension: 'Unknown'
  }
};

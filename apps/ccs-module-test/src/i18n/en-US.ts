/**
 * English i18n resources
 * Organized by domain with nested structure to avoid key collisions.
 */
export default {
  storage: {
    errorAndroidFsTimeout: 'Android filesystem operation timed out',
    errorAndroidFileOpenTimeout: 'Android file open operation timed out',
    errorAndroidCameraTimeout: 'Android camera operation timed out'
  },

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
    refreshProject: 'Refresh Project',

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
    accuracyNone: 'No Fix',

    // Shared attendance service
    providerAndroidNative: 'Android Native Location',
    providerWindowsSystem: 'Windows System Location',
    providerAndroidWebView: 'Android WebView Location',
    providerBrowser: 'Browser Location',
    errorGeolocationUnavailable: 'Geolocation is not available in this environment',
    errorCapacitorNotInjected: 'Capacitor Geolocation plugin not injected',
    errorAndroidPermissionDenied: 'Please grant precise location permission on Android',
    errorPermissionDenied: 'Location permission denied, please enable in system or browser settings',
    errorPositionUnavailable: 'Unable to get location, please check network, GPS, or system location services',
    errorTimeout: 'Location timeout, please move to an open area and try again',
    errorUnknown: 'Location failed, please try again later',
    errorAndroidTimeoutFallback: 'Android native location timed out, switched to WebView location',
    punchCheckIn: 'Check In',
    punchCheckOut: 'Check Out',
    mapViewInBing: 'View in Bing Maps',
    mapViewInBrowser: 'View Map in Browser'
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
    notRecorded: 'Not recorded',

    // Shared opfs service
    storageUnavailableLabel: 'Unavailable',
    storageAndroidDir: 'Android Private Directory',
    storageLabelWebOpfs: 'Web OPFS',
    storageLabelElectron: 'Electron userData',
    noCacheAvailableViewer: 'No local cache available',
    errorOpfsUnavailable: 'OPFS not supported, cannot cache large files offline',
    errorOfflineNotAllowed: 'This document does not allow offline caching',
    errorNoReadableStream: 'Unable to read download stream in this environment',
    errorDownloadFailed: 'Download failed: HTTP {status}',
    resumingDownload: 'Resuming download',
    downloadingProgress: 'Downloading',
    downloadedOffline: 'Offline',
    errorHtmlResponse: 'Server returned HTML page, document file not available'
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
    unknownDimension: 'Unknown',

    // Shared offline-photos service
    errorNoPhotoData: 'No photo data received',
    errorNoCameraPlugin: 'Camera plugin not injected',
    errorStorageUnavailable: 'Offline photo storage is not available in this environment',
    photoNameTemplate: 'Photo {name}',
    storageUnavailableLabel: 'Unavailable',
    storageAndroidDir: 'Android Private Directory',
    storageLabelWebOpfs: 'Web OPFS',
    errorPhotoNotFound: 'Photo not found',
    errorUploadFailedHttp: 'Upload failed: HTTP {status}',
    uploadSuccess: 'Upload successful',
    errorUploadFailed: 'Upload failed: {message}'
  }
};

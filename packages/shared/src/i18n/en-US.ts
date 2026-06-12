/**
 * English i18n resources (@ccs/shared)
 * Organized by domain with nested structure to avoid key collisions.
 */
export default {
  appName: 'CCS Enterprise Portal',
  storage: {
    errorAndroidFsTimeout: 'Android filesystem operation timed out',
    errorAndroidFileOpenTimeout: 'Android file open operation timed out',
    errorAndroidCameraTimeout: 'Android camera operation timed out'
  },
  attendance: {
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
    mapViewInBrowser: 'View Map in Browser',
    runtimeWebLabel: 'Web Page',
    runtimeWebStrategy: 'Browser Geolocation API + HTTPS',
    runtimeWebAccuracy: 'GPS / Wi-Fi / Cellular fusion',
    runtimeElectronLabel: 'Windows Exe',
    runtimeElectronStrategy: 'Electron Chromium Geolocation, maps open in default browser (Bing)',
    runtimeElectronAccuracy: 'System location services + Wi-Fi / IP assisted',
    runtimeAndroidLabel: 'Android App',
    runtimeAndroidStrategy: 'Capacitor native location + timeout protection, maps open via system browser (Bing)',
    runtimeAndroidAccuracy: 'GPS high-accuracy priority, falls back to WebView location on timeout'
  },
  offlineDocs: {
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
    errorUploadFailed: 'Upload failed: {message}',
    enterUploadUrl: 'Please enter upload URL'
  }
};

import i18next, { Resource } from 'i18next';
import { useI18n } from 'vue-i18n';

export type Language = 'zh-CN' | 'en-US';
export const resources: Resource = {
  'zh-CN': {
    translation: {
      appName: 'CCS 企业门户',
      storage: {
        errorAndroidFsTimeout: 'Android 文件系统操作超时',
        errorAndroidFileOpenTimeout: 'Android 文件打开操作超时',
        errorAndroidCameraTimeout: 'Android 相机操作超时'
      },
      attendance: {
        providerAndroidNative: 'Android 原生定位',
        providerWindowsSystem: 'Windows 系统定位',
        providerAndroidWebView: 'Android WebView 定位',
        providerBrowser: '浏览器定位',
        errorGeolocationUnavailable: '当前环境不支持定位服务',
        errorCapacitorNotInjected: 'Capacitor Geolocation 插件未注入',
        errorAndroidPermissionDenied: '请允许安卓精确定位权限后再打卡',
        errorPermissionDenied: '定位权限被拒绝，请在系统或浏览器设置中允许位置权限',
        errorPositionUnavailable: '暂时无法获取位置，请确认网络、GPS 或系统位置服务已开启',
        errorTimeout: '定位超时，请移动到开阔区域后重试',
        errorUnknown: '定位失败，请稍后重试',
        errorAndroidTimeoutFallback: 'Android 原生定位超时，已切换到 WebView 定位',
        punchCheckIn: '上班打卡',
        punchCheckOut: '下班打卡',
        mapViewInBing: '在 Bing 地图中查看',
        mapViewInBrowser: '在浏览器中查看地图',
        runtimeWebLabel: 'Web 页面',
        runtimeWebStrategy: '浏览器 Geolocation API + HTTPS 权限',
        runtimeWebAccuracy: '优先 GPS / Wi-Fi / 蜂窝网络融合定位',
        runtimeElectronLabel: 'Windows 程序',
        runtimeElectronStrategy: 'Electron 授权 Chromium Geolocation，地图用默认浏览器打开 Bing',
        runtimeElectronAccuracy: '优先系统位置服务和 Wi-Fi/IP 辅助定位',
        runtimeAndroidLabel: 'Android 应用',
        runtimeAndroidStrategy: 'Capacitor 原生定位 + 外层超时保护，地图用系统浏览器能力打开 Bing',
        runtimeAndroidAccuracy: '优先 GPS 高精度定位，超时或异常时回退 WebView 定位'
      },
      offlineDocs: {
        storageUnavailableLabel: '不可用',
        storageAndroidDir: 'Android 私有目录',
        storageLabelWebOpfs: 'Web OPFS',
        storageLabelElectron: 'Electron userData',
        noCacheAvailableViewer: '本地没有可用缓存',
        errorOpfsUnavailable: '当前浏览器不支持 OPFS，无法离线缓存大文件',
        errorOfflineNotAllowed: '该文档未开放离线缓存',
        errorNoReadableStream: '当前环境无法读取下载流',
        errorDownloadFailed: '下载失败：HTTP {status}',
        resumingDownload: '正在续传',
        downloadingProgress: '正在下载',
        downloadedOffline: '已离线',
        errorHtmlResponse: '服务器返回了 HTML 页面，未获取到真实文档文件'
      },
      offlinePhoto: {
        errorNoPhotoData: '未获取到照片数据',
        errorNoCameraPlugin: '当前环境未注入相机插件',
        errorStorageUnavailable: '当前环境不支持离线照片存储',
        photoNameTemplate: '照片 {name}',
        storageUnavailableLabel: '不可用',
        storageAndroidDir: 'Android 私有目录',
        storageLabelWebOpfs: 'Web OPFS',
        errorPhotoNotFound: '照片不存在',
        errorUploadFailedHttp: '上传失败：HTTP {status}',
        uploadSuccess: '上传成功',
        errorUploadFailed: '上传失败：{message}',
        enterUploadUrl: '请填写上传地址'
      }
    }
  },
  'en-US': {
    translation: {
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
    }
  }
};
export async function initCcsI18n(language: Language = 'zh-CN') {
  if (!i18next.isInitialized) await i18next.init({ lng: language, fallbackLng: 'zh-CN', resources, interpolation: { escapeValue: false } });
  else await i18next.changeLanguage(language);
  return i18next;
}

/**
 * 返回一个带命名空间前缀的 t 函数，方便卡片/页面按领域使用。
 * 调用方式：t('key') —— 实际查找的 key 为 `scope.key`。
 *
 * @example
 * const t = useScopedT('attendance');
 * t('shiftInfo') // 查找 vue-i18n 中的 attendance.shiftInfo
 */
export function useScopedT(scope: string) {
  const { t } = useI18n({ useScope: 'global' });
  return (key: string): string => t(`${scope}.${key}`);
}

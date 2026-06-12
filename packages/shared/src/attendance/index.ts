/**
 * 考勤打卡核心逻辑 —— 纯函数，不依赖任何 UI 框架。
 *
 * 使用方式：
 * ```ts
 * import { createAttendanceService } from '@ccs/shared/attendance';
 * import { Geolocation } from '@capacitor/geolocation';
 *
 * const attendance = createAttendanceService({ Geolocation });
 * const location = await attendance.locate('android');
 * const record = await attendance.punch('checkIn', { date: '2026-06-08' });
 * ```
 */

import type { RuntimeKind } from '../runtime';
import { detectRuntime, isAndroidNative, isElectronRuntime } from '../runtime';
import { normalizeError, openExternalLink, withTimeout } from '../utils';
import i18next from 'i18next';
import type { AttendanceRecord, AttendanceDependencies, LocationFix, MapLink, PunchEntry, PunchType } from './types';

// 重新导出类型供外部使用
export type { AttendanceDependencies, AttendanceRecord, CapacitorGeolocation, LocationFix, MapLink, PunchEntry, PunchType } from './types';

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

const CAPACITOR_LOCATION_TIMEOUT = 16000;
const BROWSER_LOCATION_TIMEOUT = 20000;
const ELECTRON_LOCATION_TIMEOUT = 25000;
const STORAGE_PREFIX = 'ccs-demo-attendance:';

// ---------------------------------------------------------------------------
// 工厂函数
// ---------------------------------------------------------------------------

/**
 * 创建考勤服务实例。
 * @param deps 平台特定依赖（Geolocation 插件等）
 */
export function createAttendanceService(deps: AttendanceDependencies = {}) {
  const { Geolocation, electronOpenMap } = deps;
  const runtime = detectRuntime();

  // -----------------------------------------------------------------------
  // 定位
  // -----------------------------------------------------------------------

  /**
   * 获取当前位置，根据平台自动选择最佳定位策略。
   */
  async function locate(): Promise<LocationFix> {
    if (runtime.kind === 'android') {
      try {
        return await withTimeout(locateWithCapacitor(), CAPACITOR_LOCATION_TIMEOUT, i18next.t('attendance.errorAndroidTimeoutFallback'));
      } catch (error) {
        console.warn('Capacitor geolocation failed, falling back to browser geolocation.', error);
      }
    }

    return locateWithBrowser(runtime.kind === 'electron' ? ELECTRON_LOCATION_TIMEOUT : BROWSER_LOCATION_TIMEOUT);
  }

  async function locateWithCapacitor(): Promise<LocationFix> {
    if (!Geolocation) throw new Error(i18next.t('attendance.errorCapacitorNotInjected'));

    const permissions = await Geolocation.checkPermissions();
    if (permissions.location !== 'granted' && permissions.coarseLocation !== 'granted') {
      const requested = await Geolocation.requestPermissions({ permissions: ['location'] });
      if (requested.location !== 'granted' && requested.coarseLocation !== 'granted') {
        throw new Error(i18next.t('attendance.errorAndroidPermissionDenied'));
      }
    }

    const position = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 18000
    });

    return normalizePosition(position.coords.latitude, position.coords.longitude, position.coords.accuracy, position.timestamp, i18next.t('attendance.providerAndroidNative'));
  }

  function locateWithBrowser(timeout: number): Promise<LocationFix> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error(i18next.t('attendance.errorGeolocationUnavailable')));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve(normalizePosition(position.coords.latitude, position.coords.longitude, position.coords.accuracy, position.timestamp, getBrowserLocationProvider()));
        },
        (error) => reject(error),
        { enableHighAccuracy: true, maximumAge: 0, timeout }
      );
    });
  }

  function getBrowserLocationProvider(): string {
    if (runtime.kind === 'electron') return i18next.t('attendance.providerWindowsSystem');
    if (runtime.kind === 'android') return i18next.t('attendance.providerAndroidWebView');
    return i18next.t('attendance.providerBrowser');
  }

  // -----------------------------------------------------------------------
  // 打卡
  // -----------------------------------------------------------------------

  /**
   * 执行打卡操作（上班/下班），返回更新后的出勤记录。
   */
  async function punch(
    type: PunchType,
    currentRecord?: AttendanceRecord
  ): Promise<{
    record: AttendanceRecord;
    location: LocationFix;
  }> {
    const location = await locate();
    const entry: PunchEntry = {
      time: new Intl.DateTimeFormat(i18next.language, {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }).format(new Date()),
      label: type === 'checkIn' ? i18next.t('attendance.punchCheckIn') : i18next.t('attendance.punchCheckOut'),
      location
    };

    const date = currentRecord?.date ?? getTodayKey();
    const record: AttendanceRecord = {
      ...(currentRecord ?? { date }),
      [type]: entry
    };

    return { record, location };
  }

  // -----------------------------------------------------------------------
  // 地图
  // -----------------------------------------------------------------------

  /**
   * 根据定位构建地图链接。
   */
  function buildMapLink(location: LocationFix): MapLink {
    const latitude = location.latitude.toFixed(6);
    const longitude = location.longitude.toFixed(6);
    const bingWebUrl = new URL('https://www.bing.com/maps');
    bingWebUrl.searchParams.set('q', `${latitude},${longitude}`);
    const href = bingWebUrl.toString();
    const label = runtime.kind === 'web' ? i18next.t('attendance.mapViewInBing') : i18next.t('attendance.mapViewInBrowser');

    return { href, fallbackHref: href, label };
  }

  /**
   * 在地图应用中打开指定位置。
   */
  async function openMapLocation(mapLink: MapLink): Promise<void> {
    if (!mapLink) return;

    if (runtime.kind === 'android') {
      try {
        (window.top ?? window).location.assign(mapLink.href);
      } catch {
        window.location.assign(mapLink.href);
      }
      return;
    }

    if (runtime.kind === 'electron') {
      if (electronOpenMap) {
        try {
          await electronOpenMap(mapLink.href);
          return;
        } catch {
          openExternalLink(mapLink.fallbackHref);
          return;
        }
      }
      openExternalLink(mapLink.href);
      return;
    }

    openExternalLink(mapLink.href);
  }

  // -----------------------------------------------------------------------
  // 持久化
  // -----------------------------------------------------------------------

  /**
   * 从 localStorage 加载当天的出勤记录。
   */
  function loadAttendanceRecord(): AttendanceRecord {
    const date = getTodayKey();
    try {
      const stored = window.localStorage.getItem(getStorageKey(date));
      if (stored) return JSON.parse(stored) as AttendanceRecord;
    } catch {
      // 忽略损坏的记录
    }
    return { date };
  }

  /**
   * 保存出勤记录到 localStorage。
   */
  function saveAttendanceRecord(record: AttendanceRecord): void {
    window.localStorage.setItem(getStorageKey(record.date), JSON.stringify(record));
  }

  function getStorageKey(date: string): string {
    return `${STORAGE_PREFIX}${date}`;
  }

  // -----------------------------------------------------------------------
  // 辅助
  // -----------------------------------------------------------------------

  /** 获取最新一条打卡的定位信息 */
  function getLatestAttendanceLocation(record: AttendanceRecord): LocationFix | null {
    return record.checkOut?.location ?? record.checkIn?.location ?? null;
  }

  /** 标准化定位数据 */
  function normalizePosition(latitude: number, longitude: number, accuracy: number | null, timestamp: number, provider: string): LocationFix {
    return {
      latitude,
      longitude,
      accuracy: Math.round(accuracy ?? 0),
      timestamp,
      provider
    };
  }

  /** 获取今日日期键（yyyy-MM-dd） */
  function getTodayKey(): string {
    return new Intl.DateTimeFormat('en-CA').format(new Date());
  }

  /** 标准化定位错误 */
  function normalizeLocationError(error: unknown): string {
    if (typeof error === 'object' && error && 'code' in error) {
      const code = Number((error as { code: number }).code);
      if (code === 1) return i18next.t('attendance.errorPermissionDenied');
      if (code === 2) return i18next.t('attendance.errorPositionUnavailable');
      if (code === 3) return i18next.t('attendance.errorTimeout');
    }

    if (error instanceof Error && error.message) return error.message;
    return i18next.t('attendance.errorUnknown');
  }

  // -----------------------------------------------------------------------
  // 公开 API
  // -----------------------------------------------------------------------

  return {
    /** 当前运行时信息 */
    runtime,
    /** 获取当前位置 */
    locate,
    /** 执行打卡 */
    punch,
    /** 构建地图链接 */
    buildMapLink,
    /** 在地图中打开位置 */
    openMapLocation,
    /** 加载出勤记录 */
    loadAttendanceRecord,
    /** 保存出勤记录 */
    saveAttendanceRecord,
    /** 获取最新定位 */
    getLatestAttendanceLocation,
    /** 标准化定位错误 */
    normalizeLocationError
  };
}

export type AttendanceService = ReturnType<typeof createAttendanceService>;

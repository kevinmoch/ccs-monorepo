/**
 * 运行时检测模块 —— 统一检测 Web / Electron / Android 运行环境。
 *
 * 所有检测均通过 window 全局变量和 navigator 实现，不依赖任何平台 SDK 的 import，
 * 因此可以在 @ccs/shared 包中安全使用。
 */

import i18next from 'i18next';

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

/** 运行时分类 */
export type RuntimeKind = 'android' | 'electron' | 'web';

/** 运行时描述信息 */
export interface RuntimeInfo {
  kind: RuntimeKind;
  label: string;
  strategy: string;
  accuracy: string;
}

/** Capacitor 桥接对象的最小接口 */
export interface CapacitorBridge {
  getPlatform?: () => string;
  isNativePlatform?: () => boolean;
}

/** Electron 桥接对象的最小接口（各模块可扩展 offlineDocs 等字段） */
export interface ElectronBridge {
  platform?: string;
  openMap?: (url: string) => Promise<boolean>;
  offlineDocs?: Record<string, (...args: unknown[]) => unknown>;
}

// ---------------------------------------------------------------------------
// 运行时描述常量
// ---------------------------------------------------------------------------

/**
 * 获取运行时描述选项（含国际化标签）。
 * 返回的 label / strategy / accuracy 会根据当前 i18next 语言动态翻译。
 */
export function getRuntimeOptions(): RuntimeInfo[] {
  return [
    {
      kind: 'web',
      label: i18next.t('attendance.runtimeWebLabel'),
      strategy: i18next.t('attendance.runtimeWebStrategy'),
      accuracy: i18next.t('attendance.runtimeWebAccuracy')
    },
    {
      kind: 'electron',
      label: i18next.t('attendance.runtimeElectronLabel'),
      strategy: i18next.t('attendance.runtimeElectronStrategy'),
      accuracy: i18next.t('attendance.runtimeElectronAccuracy')
    },
    {
      kind: 'android',
      label: i18next.t('attendance.runtimeAndroidLabel'),
      strategy: i18next.t('attendance.runtimeAndroidStrategy'),
      accuracy: i18next.t('attendance.runtimeAndroidAccuracy')
    }
  ];
}

// ---------------------------------------------------------------------------
// Capacitor 相关检测
// ---------------------------------------------------------------------------

/**
 * 获取当前窗口的 Capacitor 桥接对象。
 */
export function getCapacitor(): CapacitorBridge | undefined {
  return (window as Window & { Capacitor?: CapacitorBridge }).Capacitor;
}

/**
 * 获取顶层窗口的 Capacitor 桥接对象（iframe 场景）。
 */
export function getTopCapacitor(): CapacitorBridge | undefined {
  if (window === window.top) return undefined;
  try {
    return (window.top as (Window & { Capacitor?: CapacitorBridge }) | null)?.Capacitor;
  } catch {
    return undefined;
  }
}

/**
 * 获取可用的 Capacitor 桥接对象（优先当前窗口，其次顶层窗口）。
 */
export function getResolvedCapacitor(): CapacitorBridge | undefined {
  return getCapacitor() ?? getTopCapacitor();
}

/**
 * 检测是否为 Android 原生环境（Capacitor Android）。
 */
export function isAndroidNative(): boolean {
  try {
    const capacitor = getCapacitor();
    if (capacitor?.isNativePlatform?.()) {
      return capacitor.getPlatform?.() === 'android';
    }
    const topCapacitor = getTopCapacitor();
    if (topCapacitor?.isNativePlatform?.()) {
      return topCapacitor.getPlatform?.() === 'android';
    }
    return false;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Electron 相关检测
// ---------------------------------------------------------------------------

/**
 * 获取当前窗口的 Electron 桥接对象。
 */
export function getElectron(): ElectronBridge | undefined {
  return (window as Window & { ccsElectron?: ElectronBridge }).ccsElectron;
}

/**
 * 获取顶层窗口的 Electron 桥接对象（iframe 场景）。
 */
export function getTopElectron(): ElectronBridge | undefined {
  if (window === window.top) return undefined;
  try {
    return (window.top as (Window & { ccsElectron?: ElectronBridge }) | null)?.ccsElectron;
  } catch {
    return undefined;
  }
}

/**
 * 获取可用的 Electron 桥接对象（优先当前窗口，其次顶层窗口）。
 */
export function getResolvedElectron(): ElectronBridge | undefined {
  return getElectron() ?? getTopElectron();
}

/**
 * 检测是否运行在 Electron 渲染进程中（主 frame 或 iframe）。
 */
export function isElectronRuntime(): boolean {
  try {
    if (getElectron()?.platform) return true;
    if (getTopElectron()?.platform) return true;
  } catch {
    /* cross-origin top – ignore */
  }
  return /Electron/i.test(navigator.userAgent);
}

/**
 * 获取 Electron 离线文档桥接对象（类型由调用方通过泛型指定）。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getElectronOfflineDocs<T extends Record<string, (...args: any[]) => any> = Record<string, (...args: any[]) => any>>(): T | undefined {
  const current = getElectron()?.offlineDocs as T | undefined;
  if (current) return current;
  try {
    return getTopElectron()?.offlineDocs as T | undefined;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// 综合运行时检测
// ---------------------------------------------------------------------------

/**
 * 综合检测当前运行时环境，返回对应的 RuntimeInfo。
 * 检测优先级：Capacitor Android > Electron > Web
 */
export function detectRuntime(): RuntimeInfo {
  const capacitor = getResolvedCapacitor();

  try {
    if (capacitor?.getPlatform?.() === 'android' || (capacitor?.isNativePlatform?.() && /Android/i.test(navigator.userAgent))) {
      return getRuntimeOptions()[2]; // android
    }
  } catch {
    // 继续后续检测
  }

  if (getResolvedElectron()?.platform || /Electron/i.test(navigator.userAgent)) {
    return getRuntimeOptions()[1]; // electron
  }

  // Capacitor 开发服务器场景
  if ((window.location.protocol === 'http:' || window.location.protocol === 'https:') && window.location.hostname === 'localhost' && /Android/i.test(navigator.userAgent)) {
    return getRuntimeOptions()[2]; // android
  }

  return getRuntimeOptions()[0]; // web
}

let _offlineDocsBaseUrl: string;

/**
 * 设置离线文档服务器地址。
 * 所有平台（Web / Windows / Android）统一读取此地址。
 */
export function setOfflineDocsBaseUrl(url: string): void {
  _offlineDocsBaseUrl = url;
}

/**
 * 获取当前离线文档服务器地址。
 */
export function getOfflineDocsBaseUrl(): string {
  return _offlineDocsBaseUrl;
}

/**
 * 将文档的相对路径解析为绝对 URL。
 * - 已是绝对 URL → 原样返回
 * - 使用 setOfflineDocsBaseUrl() 设置的运行时地址
 */
export function resolveOfflineDocsUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;

  const baseUrl = getOfflineDocsBaseUrl();
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return new URL(url, base).toString();
}

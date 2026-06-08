/**
 * 运行时检测模块 —— 统一检测 Web / Electron / Android 运行环境。
 *
 * 所有检测均通过 window 全局变量和 navigator 实现，不依赖任何平台 SDK 的 import，
 * 因此可以在 @ccs/shared 包中安全使用。
 */

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

export const RUNTIME_OPTIONS: RuntimeInfo[] = [
	{
		kind: 'web',
		label: 'Web 应用',
		strategy: '浏览器 Geolocation API + HTTPS 权限',
		accuracy: '优先 GPS / Wi-Fi / 蜂窝网络融合定位',
	},
	{
		kind: 'electron',
		label: 'Windows 应用',
		strategy: 'Electron 授权 Chromium Geolocation，地图用默认浏览器打开 Bing',
		accuracy: '优先系统位置服务和 Wi-Fi/IP 辅助定位',
	},
	{
		kind: 'android',
		label: '安卓应用',
		strategy: 'Capacitor 原生定位 + 外层超时保护，地图用系统浏览器能力打开 Bing',
		accuracy: '优先 GPS 高精度定位，超时或异常时回退 WebView 定位',
	},
];

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
		return (window.top as Window & { Capacitor?: CapacitorBridge } | null)?.Capacitor;
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
		return (window.top as Window & { ccsElectron?: ElectronBridge } | null)?.ccsElectron;
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
		if (
			capacitor?.getPlatform?.() === 'android'
			|| (capacitor?.isNativePlatform?.() && /Android/i.test(navigator.userAgent))
		) {
			return RUNTIME_OPTIONS[2]; // android
		}
	} catch {
		// 继续后续检测
	}

	if (getResolvedElectron()?.platform || /Electron/i.test(navigator.userAgent)) {
		return RUNTIME_OPTIONS[1]; // electron
	}

	// Capacitor 开发服务器场景
	if (
		(window.location.protocol === 'http:' || window.location.protocol === 'https:')
		&& window.location.hostname === 'localhost'
		&& /Android/i.test(navigator.userAgent)
	) {
		return RUNTIME_OPTIONS[2]; // android
	}

	return RUNTIME_OPTIONS[0]; // web
}

/**
 * 获取当前运行时种类（快捷方法）。
 */
export function getRuntimeKind(): RuntimeKind {
	return detectRuntime().kind;
}

// ---------------------------------------------------------------------------
// 离线文档 URL 解析
// ---------------------------------------------------------------------------

/**
 * 将文档的相对路径解析为绝对 URL。
 * - 已是绝对 URL → 原样返回
 * - Android 平台 → 使用 import.meta.env.OFFLINE_DOCS_ANDROID
 * - Web / Electron → 使用 import.meta.env.OFFLINE_DOCS_SERVER
 * - 均未配置 → 默认 https://{当前主机名}:8080/{路径}
 */
export function resolveOfflineDocsUrl(url: string): string {
	if (/^https?:\/\//i.test(url)) return url;

	// 注意：必须使用 import.meta.env.XXX 的直接属性访问，
	// 以确保 Vite 的 define 插件能正确替换这些值。
	const androidUrl = import.meta.env.OFFLINE_DOCS_ANDROID as string | undefined;
	const serverUrl = import.meta.env.OFFLINE_DOCS_SERVER as string | undefined;
	const baseUrl = import.meta.env.VITE_CCS_DOCS_BASE_URL as string | undefined;

	const configured = (isAndroidNative()
		? androidUrl
		: serverUrl)
		|| (typeof process !== 'undefined'
			&& (process.env as Record<string, string | undefined>).OFFLINE_DOCS_SERVER)
		|| baseUrl;

	if (configured) {
		const base = configured.endsWith('/') ? configured : `${configured}/`;
		return new URL(url, base).toString();
	}

	// 默认：端口 8080，Android 原生环境使用 HTTP
	const scheme = isAndroidNative() ? 'http' : 'https';
	return `${scheme}://${window.location.hostname}:8080/${url}`;
}

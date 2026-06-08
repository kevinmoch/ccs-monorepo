/**
 * 考勤打卡模块 —— 公共类型定义。
 */

/** 打卡类型 */
export type PunchType = 'checkIn' | 'checkOut';

/** 定位结果 */
export interface LocationFix {
	latitude: number;
	longitude: number;
	accuracy: number;
	timestamp: number;
	provider: string;
}

/** 打卡记录 */
export interface PunchEntry {
	time: string;
	label: string;
	location: LocationFix;
}

/** 单日出勤记录 */
export interface AttendanceRecord {
	date: string;
	checkIn?: PunchEntry;
	checkOut?: PunchEntry;
}

/** 地图链接 */
export interface MapLink {
	href: string;
	fallbackHref: string;
	label: string;
}

/** Capacitor Geolocation 插件的最小接口 */
export interface CapacitorGeolocation {
	checkPermissions(): Promise<{ location: string; coarseLocation: string }>;
	requestPermissions(permissions: { permissions: string[] }): Promise<{ location: string; coarseLocation: string }>;
	getCurrentPosition(options: {
		enableHighAccuracy: boolean;
		maximumAge: number;
		timeout: number;
	}): Promise<{
		coords: {
			latitude: number;
			longitude: number;
			accuracy: number;
		};
		timestamp: number;
	}>;
}

/** 考勤模块依赖项（平台特定部分） */
export interface AttendanceDependencies {
	/** Capacitor Geolocation 插件（Android 环境必填，其他环境可选） */
	Geolocation?: CapacitorGeolocation;
	/** Electron 地图打开方法 */
	electronOpenMap?: (url: string) => Promise<boolean>;
}

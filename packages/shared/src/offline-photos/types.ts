/**
 * 离线照片模块 —— 公共类型定义。
 */

export type PhotoSource = 'camera' | 'file';

export type PhotoUploadStatus = 'local' | 'uploaded' | 'failed';

export type PhotoStorageKind = 'opfs' | 'android' | 'unavailable';

/** 离线照片元数据（缩略图以内联 dataURL 形式保存）。 */
export interface OfflinePhoto {
	id: string;
	/** 展示名称 */
	name: string;
	/** 存储文件名（photos 目录内） */
	localName: string;
	mimeType: string;
	sizeBytes: number;
	width?: number;
	height?: number;
	/** 内联缩略图（小尺寸 JPEG dataURL），用于列表渲染 */
	thumbnailDataUrl: string;
	/** 拍摄 / 采集时间（ISO 字符串） */
	capturedAt: string;
	/** 采集来源 */
	source: PhotoSource;
	/** 采集时所处运行时标签 */
	runtimeLabel?: string;
	/** 拍摄位置 —— 纬度 */
	latitude?: number;
	/** 拍摄位置 —— 经度 */
	longitude?: number;
	/** 定位精度（米） */
	locationAccuracy?: number;
	/** 定位来源 */
	locationProvider?: string;
	uploadStatus: PhotoUploadStatus;
	uploadedAt?: string;
	uploadError?: string;
}

export interface PhotoStorageStats {
	count: number;
	usedBytes: number;
	photoBytes: number;
	metadataBytes: number;
	quotaBytes?: number;
	usageBytes?: number;
	opfsAvailable: boolean;
	storageKind: PhotoStorageKind;
	storageLabel: string;
}

export interface CaptureResult {
	blob: Blob;
	mimeType: string;
	source: PhotoSource;
}

export interface UploadResult {
	ok: boolean;
	status?: number;
	message: string;
}

export interface PhotoViewSource {
	url: string;
	/** Web / Electron 为 blob URL，对应 Blob；Android 为 convertFileSrc URL，无 blob */
	blob?: Blob;
}

export interface ThumbnailOptions {
	/** 缩略图最长边像素，默认 320 */
	maxSize?: number;
	/** JPEG 质量 0~1，默认 0.7 */
	quality?: number;
}

/** Capacitor Camera 插件的最小接口（直连原生时使用）。 */
export interface CapacitorCamera {
	getPhoto(options: {
		quality?: number;
		resultType: 'base64' | 'dataUrl' | 'uri';
		source?: 'CAMERA' | 'PHOTOS' | 'PROMPT';
		allowEditing?: boolean;
	}): Promise<{ base64String?: string; dataUrl?: string; format?: string }>;
}

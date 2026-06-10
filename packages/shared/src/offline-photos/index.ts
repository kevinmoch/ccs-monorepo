/**
 * 离线照片存储与上传 —— 跨平台统一 API（离线优先）。
 *
 * Web / Electron 渲染进程 → OPFS
 * Android（iframe 子页面）→ 经父壳桥接到 Capacitor Filesystem / Camera
 * Android（直连原生）     → 直接调用 Capacitor Filesystem / Camera 插件
 *
 * 拍照能力是平台相关的：
 * - Web / Electron 的取景与抓帧（getUserMedia）由 UI 层完成，得到 Blob 后调用 {@link savePhoto}；
 * - Android 调用 {@link captureAndroidPhoto} 获取原生相机照片。
 */

import { isAndroidNative } from '../runtime';
import {
	androidCaptureViaBridge,
	androidConvertFileSrc,
	androidOpenFile,
	base64ToBytes,
	deleteAndroidFile,
	ensureAndroidDir,
	getAndroidDirectoryBytes,
	getAndroidFileUri,
	getOpfsDirectoryBytes,
	getOpfsRoot,
	getOpfsSubDir,
	isWebOpfsAvailable,
	listAndroidFileNames,
	listOpfsFileNames,
	persistOpfsStorage,
	readAndroidBinary,
	readAndroidText,
	readOpfsFile,
	removeOpfsEntry,
	shouldUseParentPostMessageBridge,
	writeAndroidBinary,
	writeAndroidText,
	writeOpfsBlob,
	writeOpfsText,
} from '../storage/native-fs';
import { normalizeError, openExternalLink, sanitizeFileName } from '../utils';
import type {
	CapacitorCamera,
	CaptureResult,
	OfflinePhoto,
	PhotoStorageStats,
	PhotoViewSource,
	ThumbnailOptions,
	UploadResult,
} from './types';

export type {
	CapacitorCamera,
	CaptureResult,
	OfflinePhoto,
	PhotoSource,
	PhotoStorageKind,
	PhotoStorageStats,
	PhotoUploadStatus,
	PhotoViewSource,
	ThumbnailOptions,
	UploadResult,
} from './types';

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

const ROOT_DIR = 'ccs-offline-photos-v1';
const PHOTOS_DIR = 'photos';
const META_DIR = 'meta';

const MIME_EXTENSIONS: Record<string, string> = {
	'image/jpeg': 'jpg',
	'image/jpg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp',
	'image/gif': 'gif',
	'image/heic': 'heic',
};

// ---------------------------------------------------------------------------
// 可用性
// ---------------------------------------------------------------------------

export function isPhotoStorageAvailable(): boolean {
	return isAndroidNative() || isWebOpfsAvailable();
}

// ---------------------------------------------------------------------------
// 采集（Android 原生相机）
// ---------------------------------------------------------------------------

/**
 * 调用 Android 原生相机拍照。
 * - iframe 子页面：通过父壳 postMessage 桥接调用 Camera 插件；
 * - 直连原生：使用注入的 Camera 插件。
 */
export async function captureAndroidPhoto(
	camera?: CapacitorCamera,
): Promise<CaptureResult> {
	if (shouldUseParentPostMessageBridge()) {
		const { base64, mimeType } = await androidCaptureViaBridge();
		if (!base64) throw new Error('未获取到照片数据');
		const blob = new Blob([base64ToBytes(base64) as BlobPart], {
			type: mimeType,
		});
		return { blob, mimeType, source: 'camera' };
	}

	if (!camera) throw new Error('当前环境未注入相机插件');
	const photo = await camera.getPhoto({
		quality: 80,
		resultType: 'base64',
		source: 'CAMERA',
	});
	if (!photo.base64String) throw new Error('未获取到照片数据');
	const mimeType = `image/${photo.format ?? 'jpeg'}`;
	const blob = new Blob([base64ToBytes(photo.base64String) as BlobPart], {
		type: mimeType,
	});
	return { blob, mimeType, source: 'camera' };
}

// ---------------------------------------------------------------------------
// 保存
// ---------------------------------------------------------------------------

export async function savePhoto(
	blob: Blob,
	info: {
		source: CaptureResult['source'];
		runtimeLabel?: string;
		name?: string;
		mimeType?: string;
		/** 拍摄位置（可选） */
		latitude?: number;
		longitude?: number;
		locationAccuracy?: number;
		locationProvider?: string;
	},
): Promise<OfflinePhoto> {
	if (!isPhotoStorageAvailable()) {
		throw new Error('当前环境不支持离线照片存储');
	}

	const capturedAt = new Date();
	const id = `photo-${capturedAt.getTime()}-${Math.random()
		.toString(36)
		.slice(2, 8)}`;
	const mimeType = info.mimeType || blob.type || 'image/jpeg';
	const extension = MIME_EXTENSIONS[mimeType.toLowerCase()] ?? 'jpg';
	const localName = `${sanitizeFileName(id)}.${extension}`;

	const [thumbnailDataUrl, dimensions] = await Promise.all([
		generateThumbnail(blob),
		getImageDimensions(blob),
	]);

	const meta: OfflinePhoto = {
		id,
		name: info.name || `照片 ${formatCaptureName(capturedAt)}`,
		localName,
		mimeType,
		sizeBytes: blob.size,
		width: dimensions?.width,
		height: dimensions?.height,
		thumbnailDataUrl,
		capturedAt: capturedAt.toISOString(),
		source: info.source,
		runtimeLabel: info.runtimeLabel,
		latitude: info.latitude,
		longitude: info.longitude,
		locationAccuracy: info.locationAccuracy,
		locationProvider: info.locationProvider,
		uploadStatus: 'local',
	};

	if (isAndroidNative()) {
		await ensureAndroidDirectories();
		const bytes = new Uint8Array(await blob.arrayBuffer());
		await writeAndroidBinary(getAndroidPhotoPath(localName), bytes);
		await writeAndroidText(
			getAndroidMetaPath(id),
			JSON.stringify(meta, null, 2),
		);
	} else {
		await persistOpfsStorage();
		const photosDir = await getOpfsPhotosDir();
		const metaDir = await getOpfsMetaDir();
		await writeOpfsBlob(photosDir, localName, blob);
		await writeOpfsText(metaDir, getMetaName(id), JSON.stringify(meta, null, 2));
	}

	return meta;
}

// ---------------------------------------------------------------------------
// 读取列表 / 元数据
// ---------------------------------------------------------------------------

export async function listPhotos(): Promise<OfflinePhoto[]> {
	if (!isPhotoStorageAvailable()) return [];
	const photos = isAndroidNative()
		? await listAndroidPhotos()
		: await listOpfsPhotos();
	return photos.sort((left, right) =>
		right.capturedAt.localeCompare(left.capturedAt),
	);
}

export async function getPhotoMeta(
	id: string,
): Promise<OfflinePhoto | undefined> {
	try {
		const text = isAndroidNative()
			? await readAndroidText(getAndroidMetaPath(id))
			: await (
					await readOpfsFile(await getOpfsMetaDir(), getMetaName(id))
				).text();
		return JSON.parse(text) as OfflinePhoto;
	} catch {
		return undefined;
	}
}

// ---------------------------------------------------------------------------
// 查看大图
// ---------------------------------------------------------------------------

export async function getPhotoBlob(id: string): Promise<Blob> {
	const meta = await getPhotoMeta(id);
	if (!meta) throw new Error('照片不存在');

	if (isAndroidNative()) {
		const bytes = await readAndroidBinary(getAndroidPhotoPath(meta.localName));
		return new Blob([bytes as BlobPart], { type: meta.mimeType });
	}

	const photosDir = await getOpfsPhotosDir();
	return readOpfsFile(photosDir, meta.localName);
}

/**
 * 获取可直接用于 `<img src>` 的查看地址。
 * Web / Electron 返回 blob URL（调用方需在不用时 `URL.revokeObjectURL`）；
 * Android 返回 convertFileSrc URL。
 */
export async function getPhotoViewSource(id: string): Promise<PhotoViewSource> {
	const meta = await getPhotoMeta(id);
	if (!meta) throw new Error('照片不存在');

	if (isAndroidNative()) {
		const uri = await getAndroidFileUri(getAndroidPhotoPath(meta.localName));
		return { url: androidConvertFileSrc(uri) };
	}

	const blob = await getPhotoBlob(id);
	return { url: URL.createObjectURL(blob), blob };
}

/** 用系统查看器 / 新窗口打开照片。 */
export async function openPhoto(id: string): Promise<void> {
	const meta = await getPhotoMeta(id);
	if (!meta) throw new Error('照片不存在');

	if (isAndroidNative()) {
		const uri = await getAndroidFileUri(getAndroidPhotoPath(meta.localName));
		await androidOpenFile(uri, meta.mimeType);
		return;
	}

	const blob = await getPhotoBlob(id);
	openExternalLink(URL.createObjectURL(blob));
}

// ---------------------------------------------------------------------------
// 删除
// ---------------------------------------------------------------------------

export async function removePhoto(id: string): Promise<void> {
	const meta = await getPhotoMeta(id);

	if (isAndroidNative()) {
		if (meta?.localName)
			await deleteAndroidFile(getAndroidPhotoPath(meta.localName));
		await deleteAndroidFile(getAndroidMetaPath(id));
		return;
	}

	const photosDir = await getOpfsPhotosDir();
	const metaDir = await getOpfsMetaDir();
	if (meta?.localName) await removeOpfsEntry(photosDir, meta.localName);
	await removeOpfsEntry(metaDir, getMetaName(id));
}

export async function removeManyPhotos(ids: string[]): Promise<void> {
	for (const id of ids) await removePhoto(id);
}

export async function clearAllPhotos(): Promise<void> {
	const photos = await listPhotos();
	await removeManyPhotos(photos.map((photo) => photo.id));
}

// ---------------------------------------------------------------------------
// 存储统计
// ---------------------------------------------------------------------------

export async function getPhotoStorageStats(): Promise<PhotoStorageStats> {
	if (!isPhotoStorageAvailable()) {
		return {
			count: 0,
			usedBytes: 0,
			photoBytes: 0,
			metadataBytes: 0,
			opfsAvailable: false,
			storageKind: 'unavailable',
			storageLabel: '不可用',
		};
	}

	if (isAndroidNative()) {
		await ensureAndroidDirectories();
		const [photoBytes, metadataBytes, names] = await Promise.all([
			getAndroidDirectoryBytes(getAndroidPhotosDir()),
			getAndroidDirectoryBytes(getAndroidMetaDir()),
			listAndroidFileNames(getAndroidMetaDir()),
		]);
		return {
			count: names.filter((name) => name.endsWith('.json')).length,
			usedBytes: photoBytes + metadataBytes,
			photoBytes,
			metadataBytes,
			opfsAvailable: true,
			storageKind: 'android',
			storageLabel: 'Android 私有目录',
		};
	}

	const photosDir = await getOpfsPhotosDir();
	const metaDir = await getOpfsMetaDir();
	const [photoBytes, metadataBytes, metaNames] = await Promise.all([
		getOpfsDirectoryBytes(photosDir),
		getOpfsDirectoryBytes(metaDir),
		listOpfsFileNames(metaDir),
	]);
	const estimate = await navigator.storage?.estimate?.();
	return {
		count: metaNames.filter((name) => name.endsWith('.json')).length,
		usedBytes: photoBytes + metadataBytes,
		photoBytes,
		metadataBytes,
		quotaBytes: estimate?.quota,
		usageBytes: estimate?.usage,
		opfsAvailable: true,
		storageKind: 'opfs',
		storageLabel: 'Web OPFS',
	};
}

// ---------------------------------------------------------------------------
// 上传（离线优先：手动选择一张上传）
// ---------------------------------------------------------------------------

export async function uploadPhoto(
	id: string,
	uploadUrl: string,
	options: { fieldName?: string; signal?: AbortSignal } = {},
): Promise<UploadResult> {
	const meta = await getPhotoMeta(id);
	if (!meta) throw new Error('照片不存在');
	if (!uploadUrl) throw new Error('请填写上传地址');

	try {
		const blob = await getPhotoBlob(id);
		const formData = new FormData();
		formData.append(
			options.fieldName ?? 'file',
			new File([blob], meta.localName, { type: meta.mimeType }),
		);
		formData.append('id', meta.id);
		formData.append('capturedAt', meta.capturedAt);
		if (meta.latitude != null) formData.append('latitude', String(meta.latitude));
		if (meta.longitude != null) formData.append('longitude', String(meta.longitude));
		if (meta.locationAccuracy != null) formData.append('locationAccuracy', String(meta.locationAccuracy));
		if (meta.locationProvider) formData.append('locationProvider', meta.locationProvider);

		const response = await fetch(uploadUrl, {
			method: 'POST',
			body: formData,
			signal: options.signal,
		});

		if (!response.ok) {
			const failed: OfflinePhoto = {
				...meta,
				uploadStatus: 'failed',
				uploadError: `HTTP ${response.status}`,
			};
			await savePhotoMeta(failed);
			return {
				ok: false,
				status: response.status,
				message: `上传失败：HTTP ${response.status}`,
			};
		}

		const uploaded: OfflinePhoto = {
			...meta,
			uploadStatus: 'uploaded',
			uploadedAt: new Date().toISOString(),
			uploadError: undefined,
		};
		await savePhotoMeta(uploaded);
		return { ok: true, status: response.status, message: '上传成功' };
	} catch (error) {
		const message = normalizeError(error);
		const failed: OfflinePhoto = {
			...meta,
			uploadStatus: 'failed',
			uploadError: message,
		};
		await savePhotoMeta(failed);
		return { ok: false, message: `上传失败：${message}` };
	}
}

// ---------------------------------------------------------------------------
// 缩略图 / 尺寸（纯工具，供各平台复用）
// ---------------------------------------------------------------------------

export async function generateThumbnail(
	blob: Blob,
	options: ThumbnailOptions = {},
): Promise<string> {
	const maxSize = options.maxSize ?? 320;
	const quality = options.quality ?? 0.7;

	try {
		const bitmap = await createImageBitmap(blob);
		const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
		const width = Math.max(1, Math.round(bitmap.width * scale));
		const height = Math.max(1, Math.round(bitmap.height * scale));
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		const context = canvas.getContext('2d');
		if (!context) {
			bitmap.close();
			return '';
		}
		context.drawImage(bitmap, 0, 0, width, height);
		bitmap.close();
		return canvas.toDataURL('image/jpeg', quality);
	} catch {
		return '';
	}
}

export async function getImageDimensions(
	blob: Blob,
): Promise<{ width: number; height: number } | undefined> {
	try {
		const bitmap = await createImageBitmap(blob);
		const dimensions = { width: bitmap.width, height: bitmap.height };
		bitmap.close();
		return dimensions;
	} catch {
		return undefined;
	}
}

// ---------------------------------------------------------------------------
// 内部 —— 元数据写入
// ---------------------------------------------------------------------------

async function savePhotoMeta(meta: OfflinePhoto): Promise<void> {
	if (isAndroidNative()) {
		await writeAndroidText(
			getAndroidMetaPath(meta.id),
			JSON.stringify(meta, null, 2),
		);
		return;
	}
	const metaDir = await getOpfsMetaDir();
	await writeOpfsText(metaDir, getMetaName(meta.id), JSON.stringify(meta, null, 2));
}

// ---------------------------------------------------------------------------
// 内部 —— OPFS
// ---------------------------------------------------------------------------

async function getOpfsPhotosDir(): Promise<FileSystemDirectoryHandle> {
	return getOpfsSubDir(await getOpfsRoot(ROOT_DIR), PHOTOS_DIR);
}

async function getOpfsMetaDir(): Promise<FileSystemDirectoryHandle> {
	return getOpfsSubDir(await getOpfsRoot(ROOT_DIR), META_DIR);
}

async function listOpfsPhotos(): Promise<OfflinePhoto[]> {
	const metaDir = await getOpfsMetaDir();
	const names = await listOpfsFileNames(metaDir);
	const photos: OfflinePhoto[] = [];
	for (const name of names) {
		if (!name.endsWith('.json')) continue;
		try {
			photos.push(
				JSON.parse(await (await readOpfsFile(metaDir, name)).text()) as OfflinePhoto,
			);
		} catch {
			// 忽略损坏的元数据
		}
	}
	return photos;
}

// ---------------------------------------------------------------------------
// 内部 —— Android
// ---------------------------------------------------------------------------

async function listAndroidPhotos(): Promise<OfflinePhoto[]> {
	await ensureAndroidDirectories();
	const names = await listAndroidFileNames(getAndroidMetaDir());
	const photos: OfflinePhoto[] = [];
	for (const name of names) {
		if (!name.endsWith('.json')) continue;
		try {
			photos.push(
				JSON.parse(
					await readAndroidText(`${getAndroidMetaDir()}/${name}`),
				) as OfflinePhoto,
			);
		} catch {
			// 忽略损坏的元数据
		}
	}
	return photos;
}

async function ensureAndroidDirectories(): Promise<void> {
	await ensureAndroidDir(ROOT_DIR);
	await ensureAndroidDir(getAndroidPhotosDir());
	await ensureAndroidDir(getAndroidMetaDir());
}

function getAndroidPhotosDir() {
	return `${ROOT_DIR}/${PHOTOS_DIR}`;
}

function getAndroidMetaDir() {
	return `${ROOT_DIR}/${META_DIR}`;
}

function getAndroidPhotoPath(localName: string) {
	return `${getAndroidPhotosDir()}/${localName}`;
}

function getAndroidMetaPath(id: string) {
	return `${getAndroidMetaDir()}/${getMetaName(id)}`;
}

// ---------------------------------------------------------------------------
// 内部 —— 工具
// ---------------------------------------------------------------------------

function getMetaName(id: string) {
	return `${sanitizeFileName(id)}.json`;
}

function formatCaptureName(date: Date): string {
	return new Intl.DateTimeFormat('zh-CN', {
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hour12: false,
	}).format(date);
}

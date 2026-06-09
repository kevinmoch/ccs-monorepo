/**
 * 离线文档 OPFS / 原生存储操作 —— 跨平台统一的离线文档缓存 API。
 *
 * Web    → OPFS (Origin Private File System)
 * Electron → 主进程 Node.js 文件系统（通过 bridge）
 * Android → Capacitor Filesystem 插件
 *
 * 使用方式：
 * ```ts
 * import {
 *   isOpfsAvailable,
 *   downloadDocumentToOpfs,
 *   openCachedDocument,
 *   // ...
 * } from '@ccs/shared/offline-docs';
 * ```
 */

import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import {
	getElectronOfflineDocs,
	isAndroidNative,
	isElectronRuntime,
	resolveOfflineDocsUrl,
} from '../runtime';
import {
	androidFilesystem,
	androidOpenFile,
	bytesToBase64,
	persistOpfsStorage,
} from '../storage/native-fs';
import {
	deriveFileType,
	getFileExtension,
	normalizeError,
	openExternalLink,
	parseNumber,
	sanitizeFileName,
} from '../utils';
import type {
	CachedDocumentMeta,
	DownloadProgress,
	OfflineDocument,
	OfflineStorageKind,
	StorageStats,
	ViewerSource,
} from './types';

// ---------------------------------------------------------------------------
// 内部类型
// ---------------------------------------------------------------------------

type OpfsStorageManager = StorageManager & {
	getDirectory?: () => Promise<FileSystemDirectoryHandle>;
};

type DirectoryWithEntries = FileSystemDirectoryHandle & {
	entries: () => AsyncIterableIterator<[string, FileSystemHandle]>;
};

type ElectronDownloadPayload = {
	downloadId: string;
	progress: DownloadProgress;
};

type ElectronOfflineDocsBridge = {
	getAllMetadata: () => Promise<CachedDocumentMeta[]>;
	getDocumentMeta: (id: string) => Promise<CachedDocumentMeta | undefined>;
	saveDocumentMeta: (meta: CachedDocumentMeta) => Promise<void>;
	writeCatalogSnapshot: (documents: OfflineDocument[]) => Promise<void>;
	getStorageStats: () => Promise<StorageStats>;
	removeDocumentCache: (id: string) => Promise<void>;
	checkDocumentUpdate: (
		document: OfflineDocument,
		absoluteUrl: string,
	) => Promise<CachedDocumentMeta | undefined>;
	getCachedFileUrl: (id: string) => Promise<string | undefined>;
	openCachedDocument: (id: string) => Promise<void>;
	openOnlineDocument: (absoluteUrl: string) => Promise<void>;
	downloadDocument: (request: {
		downloadId: string;
		document: OfflineDocument;
		absoluteUrl: string;
		force?: boolean;
	}) => Promise<CachedDocumentMeta>;
	onDownloadProgress: (
		listener: (payload: ElectronDownloadPayload) => void,
	) => () => void;
};

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

const ROOT_DIR = 'ccs-offline-docs-v1';
const DOCS_DIR = 'docs';
const META_DIR = 'meta';
const CATALOG_FILE = 'catalog.json';

// ---------------------------------------------------------------------------
// 公开 API
// ---------------------------------------------------------------------------

export function isOpfsAvailable(): boolean {
	const nativeKind = getNativeStorageKind();
	if (nativeKind === 'electron' || nativeKind === 'android') {
		return true;
	}
	const webOpfs =
		typeof navigator !== 'undefined'
		&& typeof (navigator.storage as OpfsStorageManager | undefined)
			?.getDirectory === 'function';
	return webOpfs;
}

export async function writeCatalogSnapshot(documents: OfflineDocument[]) {
	const electron = getElectronOfflineDocs<ElectronOfflineDocsBridge>();
	if (electron) return electron.writeCatalogSnapshot(documents);
	if (isAndroidNative())
		return writeAndroidText(CATALOG_FILE, JSON.stringify(documents, null, 2));

	const root = await getRootDirectory();
	await writeTextFile(root, CATALOG_FILE, JSON.stringify(documents, null, 2));
}

export async function getAllMetadata(): Promise<CachedDocumentMeta[]> {
	const electron = getElectronOfflineDocs<ElectronOfflineDocsBridge>();
	if (electron) return electron.getAllMetadata();
	if (isAndroidNative()) return getAllAndroidMetadata();

	const metaDir = await getMetaDirectory();
	const metadata: CachedDocumentMeta[] = [];

	for await (const [name, handle] of (
		metaDir as DirectoryWithEntries
	).entries()) {
		if (handle.kind !== 'file' || !name.endsWith('.json')) continue;
		try {
			metadata.push(
				JSON.parse(
					await (await (handle as FileSystemFileHandle).getFile()).text(),
				) as CachedDocumentMeta,
			);
		} catch {
			// 忽略损坏的元数据文件
		}
	}

	return metadata;
}

export async function getDocumentMeta(
	id: string,
): Promise<CachedDocumentMeta | undefined> {
	const electron = getElectronOfflineDocs<ElectronOfflineDocsBridge>();
	if (electron) return electron.getDocumentMeta(id);
	if (isAndroidNative()) return getAndroidDocumentMeta(id);

	try {
		const metaDir = await getMetaDirectory();
		const handle = await metaDir.getFileHandle(getMetaName(id));
		return JSON.parse(
			await (await handle.getFile()).text(),
		) as CachedDocumentMeta;
	} catch {
		return undefined;
	}
}

export async function saveDocumentMeta(meta: CachedDocumentMeta) {
	const electron = getElectronOfflineDocs<ElectronOfflineDocsBridge>();
	if (electron) return electron.saveDocumentMeta(meta);
	if (isAndroidNative()) return saveAndroidDocumentMeta(meta);

	const metaDir = await getMetaDirectory();
	await writeTextFile(
		metaDir,
		getMetaName(meta.id),
		JSON.stringify(meta, null, 2),
	);
}

export async function getStorageStats(): Promise<StorageStats> {
	const electron = getElectronOfflineDocs<ElectronOfflineDocsBridge>();
	if (electron) {
		return {
			...(await electron.getStorageStats()),
			opfsAvailable: true,
			storageKind: 'electron',
			storageLabel: 'Electron userData',
		};
	}
	if (isAndroidNative()) return getAndroidStorageStats();

	if (!isOpfsAvailable()) {
		return {
			usedBytes: 0,
			metadataBytes: 0,
			cachedBytes: 0,
			partialBytes: 0,
			opfsAvailable: false,
			storageKind: 'unavailable',
			storageLabel: '不可用',
		};
	}

	const metadata = await getAllMetadata();
	const estimate = await navigator.storage?.estimate?.();
	const persisted = await navigator.storage?.persisted?.();
	const cachedBytes = metadata.reduce(
		(total, meta) => total + meta.cachedBytes,
		0,
	);
	const partialBytes = metadata.reduce(
		(total, meta) => total + meta.partialBytes,
		0,
	);
	const metadataBytes = await getMetadataBytes();

	return {
		usedBytes: cachedBytes + partialBytes + metadataBytes,
		cachedBytes,
		partialBytes,
		metadataBytes,
		quotaBytes: estimate?.quota,
		usageBytes: estimate?.usage,
		persisted,
		opfsAvailable: true,
		storageKind: 'opfs',
		storageLabel: 'Web OPFS',
	};
}

export async function createCachedObjectUrl(
	document: OfflineDocument,
): Promise<ViewerSource> {
	const electron = getElectronOfflineDocs<ElectronOfflineDocsBridge>();
	if (electron) {
		try {
			const url = await electron.getCachedFileUrl(document.id);
			if (url) return { kind: 'cache', url };
		} catch {
			// 桥不可用，回退到 OPFS
		}
	}

	if (isAndroidNative()) return createAndroidCachedUrl(document);

	const meta = await getDocumentMeta(document.id);
	if (
		!meta
		|| (meta.status !== 'offline' && meta.status !== 'update-available')
	) {
		return { kind: 'unavailable', message: '本地没有可用缓存' };
	}

	const docsDir = await getDocsDirectory();
	const handle = await docsDir.getFileHandle(meta.localName);
	const file = await handle.getFile();
	await touchDocument(document.id);

	return { kind: 'cache', url: URL.createObjectURL(file), blob: file };
}

export async function openOnlineDocument(document: OfflineDocument) {
	const absoluteUrl = resolveOfflineDocsUrl(document.url);

	const electron = getElectronOfflineDocs<ElectronOfflineDocsBridge>();
	if (electron) {
		try {
			await electron.openOnlineDocument(absoluteUrl);
			return;
		} catch {
			// 回退到 window.open
		}
	}

	if (isElectronRuntime()) {
		openExternalLink(absoluteUrl);
		return;
	}

	if (isAndroidNative()) {
		try {
			(window.top ?? window).location.assign(absoluteUrl);
		} catch {
			window.location.assign(absoluteUrl);
		}
		return;
	}

	openExternalLink(absoluteUrl);
}

export async function openCachedDocument(
	document: OfflineDocument,
): Promise<void> {
	const electron = getElectronOfflineDocs<ElectronOfflineDocsBridge>();
	if (electron) {
		try {
			return await electron.openCachedDocument(document.id);
		} catch {
			// 回退到 blob URL
		}
	}

	if (isAndroidNative()) return openAndroidCachedDocument(document);

	const source = await createCachedObjectUrl(document);
	if (!source.url) throw new Error(source.message ?? '本地没有可用缓存');
	openExternalLink(source.url);
}

export async function touchDocument(id: string) {
	const meta = await getDocumentMeta(id);
	if (!meta) return;
	await saveDocumentMeta({ ...meta, lastAccessedAt: new Date().toISOString() });
}

export async function removeDocumentCache(id: string) {
	const electron = getElectronOfflineDocs<ElectronOfflineDocsBridge>();
	if (electron) return electron.removeDocumentCache(id);
	if (isAndroidNative()) return removeAndroidDocumentCache(id);

	const meta = await getDocumentMeta(id);
	const docsDir = await getDocsDirectory();
	const metaDir = await getMetaDirectory();

	if (meta?.localName) await removeEntryIfExists(docsDir, meta.localName);
	await removeEntryIfExists(metaDir, getMetaName(id));
}

export async function removeManyDocumentCaches(ids: string[]) {
	for (const id of ids) await removeDocumentCache(id);
}

export async function checkDocumentUpdate(
	document: OfflineDocument,
): Promise<CachedDocumentMeta | undefined> {
	const electron = getElectronOfflineDocs<ElectronOfflineDocsBridge>();
	if (electron)
		return electron.checkDocumentUpdate(
			document,
			resolveOfflineDocsUrl(document.url),
		);
	if (isAndroidNative()) return checkNativeDocumentUpdate(document);

	const meta = await getDocumentMeta(document.id);
	if (!meta || !navigator.onLine) return meta;

	try {
		const response = await fetch(resolveOfflineDocsUrl(document.url), {
			method: 'HEAD',
			cache: 'no-store',
		});
		if (!response.ok) return meta;

		const nextEtag = response.headers.get('etag') ?? document.etag;
		const nextLastModified =
			response.headers.get('last-modified') ?? document.lastModified;
		const nextSize =
			parseNumber(response.headers.get('content-length')) ?? document.size;
		const changed = Boolean(
			(nextEtag && meta.etag && nextEtag !== meta.etag)
			|| (nextLastModified
				&& meta.lastModified
				&& nextLastModified !== meta.lastModified)
			|| (typeof nextSize === 'number'
				&& meta.serverSize
				&& nextSize !== meta.serverSize),
		);

		if (!changed) return meta;
		const updated: CachedDocumentMeta = {
			...meta,
			status: 'update-available',
			etag: nextEtag,
			lastModified: nextLastModified,
			serverSize: nextSize,
			error: undefined,
		};
		await saveDocumentMeta(updated);
		return updated;
	} catch {
		return meta;
	}
}

export async function downloadDocumentToOpfs(
	document: OfflineDocument,
	onProgress: (progress: DownloadProgress) => void,
	options: { force?: boolean; signal?: AbortSignal } = {},
): Promise<CachedDocumentMeta> {
	const electron = getElectronOfflineDocs<ElectronOfflineDocsBridge>();
	if (electron) {
		try {
			return await downloadDocumentWithElectron(
				electron,
				document,
				onProgress,
				options,
			);
		} catch (bridgeError) {
			if (isOpfsAvailable()) {
				// 回退到 Web OPFS
			} else {
				throw bridgeError;
			}
		}
	}

	if (isAndroidNative())
		return downloadDocumentWithAndroid(document, onProgress, options);

	if (!isOpfsAvailable())
		throw new Error('当前浏览器不支持 OPFS，无法离线缓存大文件');
	if (document.allowOffline === false) throw new Error('该文档未开放离线缓存');

	await persistOpfsStorage();

	const docsDir = await getDocsDirectory();
	const localName = getLocalFileName(document);
	const fileHandle = await docsDir.getFileHandle(localName, { create: true });
	const previous = await getDocumentMeta(document.id);
	let startByte = getResumeStartByte(
		previous,
		localName,
		options.force,
		await getFileSize(fileHandle),
	);
	const requestHeaders = new Headers();
	if (startByte > 0) requestHeaders.set('Range', `bytes=${startByte}-`);

	let writable: FileSystemWritableFileStream | undefined;

	try {
		const response = await fetch(resolveOfflineDocsUrl(document.url), {
			headers: requestHeaders,
			cache: 'no-store',
			signal: options.signal,
		});
		if (!response.ok && response.status !== 206)
			throw new Error(`下载失败：HTTP ${response.status}`);
		validateDocumentResponse(response, document);
		if (!response.body) throw new Error('当前环境无法读取下载流');

		const canResume = startByte > 0 && response.status === 206;
		if (startByte > 0 && !canResume) startByte = 0;

		const totalBytes =
			getResponseTotalBytes(response, startByte) ?? document.size;
		writable = await fileHandle.createWritable({
			keepExistingData: canResume,
		});
		if (canResume) await writable.seek(startByte);

		let receivedBytes = startByte;
		await saveDocumentMeta(
			createMeta(document, localName, {
				status: 'downloading',
				cachedBytes: 0,
				partialBytes: receivedBytes,
				serverSize: totalBytes,
				etag: response.headers.get('etag') ?? document.etag,
				lastModified:
					response.headers.get('last-modified') ?? document.lastModified,
			}),
		);
		onProgress(
			buildProgress(
				document.id,
				receivedBytes,
				totalBytes,
				canResume,
				canResume ? '正在续传' : '正在下载',
			),
		);

		const reader = response.body.getReader();
		let lastMetaWriteAt = 0;

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			if (!value) continue;
			await writable.write(value);
			receivedBytes += value.byteLength;
			onProgress(
				buildProgress(document.id, receivedBytes, totalBytes, canResume),
			);

			const now = Date.now();
			if (now - lastMetaWriteAt > 1000) {
				lastMetaWriteAt = now;
				await saveDocumentMeta(
					createMeta(document, localName, {
						status: 'downloading',
						cachedBytes: 0,
						partialBytes: receivedBytes,
						serverSize: totalBytes,
						etag: response.headers.get('etag') ?? document.etag,
						lastModified:
							response.headers.get('last-modified')
							?? document.lastModified,
					}),
				);
			}
		}

		await writable.close();
		writable = undefined;

		const completed: CachedDocumentMeta = createMeta(document, localName, {
			status: 'offline',
			cachedBytes: receivedBytes,
			partialBytes: 0,
			serverSize: totalBytes ?? receivedBytes,
			etag: response.headers.get('etag') ?? document.etag,
			lastModified:
				response.headers.get('last-modified') ?? document.lastModified,
			downloadedAt: new Date().toISOString(),
			lastAccessedAt: new Date().toISOString(),
		});

		await saveDocumentMeta(completed);
		onProgress(
			buildProgress(
				document.id,
				receivedBytes,
				totalBytes ?? receivedBytes,
				canResume,
				'已离线',
			),
		);
		return completed;
	} catch (error) {
		if (writable) {
			try {
				await writable.close();
			} catch {
				// 保留部分文件以便续传
			}
		}

		const partialBytes = await getFileSize(fileHandle);
		const failed = createMeta(document, localName, {
			status: 'failed',
			cachedBytes: 0,
			partialBytes,
			error: normalizeError(error),
			serverSize: document.size,
			etag: document.etag,
			lastModified: document.lastModified,
		});
		await saveDocumentMeta(failed);
		throw error;
	}
}

// ---------------------------------------------------------------------------
// 内部 —— 存储种类
// ---------------------------------------------------------------------------

function getNativeStorageKind(): OfflineStorageKind {
	if (getElectronOfflineDocs<ElectronOfflineDocsBridge>()) return 'electron';
	if (isAndroidNative()) return 'android';
	return 'unavailable';
}

// ---------------------------------------------------------------------------
// 内部 —— Electron 下载
// ---------------------------------------------------------------------------

async function downloadDocumentWithElectron(
	electron: ElectronOfflineDocsBridge,
	document: OfflineDocument,
	onProgress: (progress: DownloadProgress) => void,
	options: { force?: boolean; signal?: AbortSignal } = {},
): Promise<CachedDocumentMeta> {
	const downloadId = `${document.id}-${Date.now()}-${Math.random()
		.toString(36)
		.slice(2)}`;
	const unsubscribe = electron.onDownloadProgress((payload) => {
		if (payload.downloadId === downloadId) onProgress(payload.progress);
	});

	try {
		const result = await electron.downloadDocument({
			downloadId,
			document,
			absoluteUrl: resolveOfflineDocsUrl(document.url),
			force: options.force,
		});
		return result;
	} finally {
		unsubscribe();
	}
}

// ---------------------------------------------------------------------------
// 内部 —— Android
// ---------------------------------------------------------------------------

async function getAllAndroidMetadata(): Promise<CachedDocumentMeta[]> {
	await ensureAndroidDirectories();
	let result: Awaited<ReturnType<typeof Filesystem.readdir>>;
	try {
		result = await androidFilesystem('readdir', {
			path: getAndroidMetaDir(),
			directory: Directory.Data,
		});
	} catch {
		return [];
	}

	const files = result.files
		.map((file) => (typeof file === 'string' ? file : file.name))
		.filter((name) => name.endsWith('.json'));
	const metadata: CachedDocumentMeta[] = [];
	for (const file of files) {
		try {
			metadata.push(
				JSON.parse(
					await readAndroidText(`${getAndroidMetaDir()}/${file}`),
				) as CachedDocumentMeta,
			);
		} catch {
			// 忽略损坏的元数据
		}
	}
	return metadata;
}

async function getAndroidDocumentMeta(
	id: string,
): Promise<CachedDocumentMeta | undefined> {
	try {
		return JSON.parse(
			await readAndroidText(getAndroidMetaPath(id)),
		) as CachedDocumentMeta;
	} catch {
		return undefined;
	}
}

async function saveAndroidDocumentMeta(meta: CachedDocumentMeta) {
	await writeAndroidText(
		getAndroidMetaPath(meta.id),
		JSON.stringify(meta, null, 2),
	);
}

async function getAndroidStorageStats(): Promise<StorageStats> {
	const metadata = await getAllAndroidMetadata();
	const cachedBytes = metadata.reduce(
		(total, meta) => total + meta.cachedBytes,
		0,
	);
	const partialBytes = metadata.reduce(
		(total, meta) => total + meta.partialBytes,
		0,
	);
	const metadataBytes = await getAndroidDirectoryBytes(getAndroidMetaDir());
	return {
		usedBytes: cachedBytes + partialBytes + metadataBytes,
		cachedBytes,
		partialBytes,
		metadataBytes,
		opfsAvailable: true,
		storageKind: 'android',
		storageLabel: 'Android 私有目录',
	};
}

async function createAndroidCachedUrl(
	document: OfflineDocument,
): Promise<ViewerSource> {
	const meta = await getAndroidDocumentMeta(document.id);
	if (
		!meta
		|| (meta.status !== 'offline' && meta.status !== 'update-available')
	) {
		return { kind: 'unavailable', message: '本地没有可用缓存' };
	}

	const result = await androidFilesystem<
		Awaited<ReturnType<typeof Filesystem.getUri>>
	>('getUri', {
		path: getAndroidDocPath(meta.localName),
		directory: Directory.Data,
	});
	await touchDocument(document.id);
	return { kind: 'cache', url: Capacitor.convertFileSrc(result.uri) };
}

async function openAndroidCachedDocument(document: OfflineDocument) {
	const meta = await getAndroidDocumentMeta(document.id);
	if (
		!meta
		|| (meta.status !== 'offline' && meta.status !== 'update-available')
	)
		throw new Error('本地没有可用缓存');
	const result = await androidFilesystem<
		Awaited<ReturnType<typeof Filesystem.getUri>>
	>('getUri', {
		path: getAndroidDocPath(meta.localName),
		directory: Directory.Data,
	});
	await touchDocument(document.id);
	await androidOpenFile(result.uri, document.mimeType);
}

async function removeAndroidDocumentCache(id: string) {
	const meta = await getAndroidDocumentMeta(id);
	if (meta?.localName) await deleteAndroidFile(getAndroidDocPath(meta.localName));
	await deleteAndroidFile(getAndroidMetaPath(id));
}

async function checkNativeDocumentUpdate(
	document: OfflineDocument,
): Promise<CachedDocumentMeta | undefined> {
	const meta = await getDocumentMeta(document.id);
	if (!meta || !navigator.onLine) return meta;

	try {
		const response = await fetch(resolveOfflineDocsUrl(document.url), {
			method: 'HEAD',
			cache: 'no-store',
		});
		if (!response.ok) return meta;

		const nextEtag = response.headers.get('etag') ?? document.etag;
		const nextLastModified =
			response.headers.get('last-modified') ?? document.lastModified;
		const nextSize =
			parseNumber(response.headers.get('content-length')) ?? document.size;
		const changed = Boolean(
			(nextEtag && meta.etag && nextEtag !== meta.etag)
			|| (nextLastModified
				&& meta.lastModified
				&& nextLastModified !== meta.lastModified)
			|| (typeof nextSize === 'number'
				&& meta.serverSize
				&& nextSize !== meta.serverSize),
		);

		if (!changed) return meta;
		const updated: CachedDocumentMeta = {
			...meta,
			status: 'update-available',
			etag: nextEtag,
			lastModified: nextLastModified,
			serverSize: nextSize,
			error: undefined,
		};
		await saveDocumentMeta(updated);
		return updated;
	} catch {
		return meta;
	}
}

async function downloadDocumentWithAndroid(
	document: OfflineDocument,
	onProgress: (progress: DownloadProgress) => void,
	options: { force?: boolean; signal?: AbortSignal } = {},
): Promise<CachedDocumentMeta> {
	if (document.allowOffline === false) throw new Error('该文档未开放离线缓存');

	await ensureAndroidDirectories();
	const localName = getLocalFileName(document);
	const localPath = getAndroidDocPath(localName);
	const previous = await getAndroidDocumentMeta(document.id);
	let startByte = getResumeStartByte(
		previous,
		localName,
		options.force,
		await getAndroidFileSize(localPath),
	);
	const requestHeaders = new Headers();
	if (startByte > 0) requestHeaders.set('Range', `bytes=${startByte}-`);

	try {
		const absoluteUrl = resolveOfflineDocsUrl(document.url);
		const response = await fetch(absoluteUrl, {
			headers: requestHeaders,
			cache: 'no-store',
			signal: options.signal,
		});
		if (!response.ok && response.status !== 206)
			throw new Error(`下载失败：HTTP ${response.status}`);
		validateDocumentResponse(response, document);
		if (!response.body) throw new Error('当前环境无法读取下载流');

		const canResume = startByte > 0 && response.status === 206;
		if (startByte > 0 && !canResume) startByte = 0;
		const totalBytes =
			getResponseTotalBytes(response, startByte) ?? document.size;
		let receivedBytes = startByte;
		let hasWrittenChunk = canResume;

		await saveAndroidDocumentMeta(
			createMeta(document, localName, {
				status: 'downloading',
				cachedBytes: 0,
				partialBytes: receivedBytes,
				serverSize: totalBytes,
				etag: response.headers.get('etag') ?? document.etag,
				lastModified:
					response.headers.get('last-modified') ?? document.lastModified,
			}),
		);
		onProgress(
			buildProgress(
				document.id,
				receivedBytes,
				totalBytes,
				canResume,
				canResume ? '正在续传' : '正在下载',
			),
		);

		const reader = response.body.getReader();
		let lastMetaWriteAt = 0;
		const BATCH_BYTES = 512 * 1024;
		const chunks: Uint8Array[] = [];
		let batchBytes = 0;

		async function flushBatch() {
			if (!chunks.length) return;
			const merged = new Uint8Array(batchBytes);
			let offset = 0;
			for (const chunk of chunks) {
				merged.set(chunk, offset);
				offset += chunk.byteLength;
			}
			const data = bytesToBase64(merged);
			if (hasWrittenChunk) {
				await androidFilesystem('appendFile', {
					path: localPath,
					data,
					directory: Directory.Data,
				});
			} else {
				await androidFilesystem('writeFile', {
					path: localPath,
					data,
					directory: Directory.Data,
					recursive: true,
				});
				hasWrittenChunk = true;
			}
			chunks.length = 0;
			batchBytes = 0;
		}

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			if (!value) continue;

			chunks.push(value);
			batchBytes += value.byteLength;

			receivedBytes += value.byteLength;
			onProgress(
				buildProgress(document.id, receivedBytes, totalBytes, canResume),
			);

			if (batchBytes >= BATCH_BYTES) await flushBatch();

			const now = Date.now();
			if (now - lastMetaWriteAt > 1000) {
				lastMetaWriteAt = now;
				await saveAndroidDocumentMeta(
					createMeta(document, localName, {
						status: 'downloading',
						cachedBytes: 0,
						partialBytes: receivedBytes,
						serverSize: totalBytes,
						etag: response.headers.get('etag') ?? document.etag,
						lastModified:
							response.headers.get('last-modified')
							?? document.lastModified,
					}),
				);
			}
		}

		await flushBatch();

		const completed = createMeta(document, localName, {
			status: 'offline',
			cachedBytes: receivedBytes,
			partialBytes: 0,
			serverSize: totalBytes ?? receivedBytes,
			etag: response.headers.get('etag') ?? document.etag,
			lastModified:
				response.headers.get('last-modified') ?? document.lastModified,
			downloadedAt: new Date().toISOString(),
			lastAccessedAt: new Date().toISOString(),
		});
		await saveAndroidDocumentMeta(completed);
		onProgress(
			buildProgress(
				document.id,
				receivedBytes,
				totalBytes ?? receivedBytes,
				canResume,
				'已离线',
			),
		);
		return completed;
	} catch (error) {
		const partialBytes = await getAndroidFileSize(localPath);
		const failed = createMeta(document, localName, {
			status: 'failed',
			cachedBytes: 0,
			partialBytes,
			error: normalizeError(error),
			serverSize: document.size,
			etag: document.etag,
			lastModified: document.lastModified,
		});
		await saveAndroidDocumentMeta(failed);
		throw error;
	}
}

async function ensureAndroidDirectories() {
	await mkdirAndroid(ROOT_DIR);
	await mkdirAndroid(getAndroidDocsDir());
	await mkdirAndroid(getAndroidMetaDir());
}

async function mkdirAndroid(path: string) {
	try {
		await androidFilesystem('mkdir', {
			path,
			directory: Directory.Data,
			recursive: true,
		});
	} catch {
		// 目录已存在则忽略
	}
}

async function readAndroidText(path: string) {
	const result = await androidFilesystem<
		Awaited<ReturnType<typeof Filesystem.readFile>>
	>('readFile', {
		path,
		directory: Directory.Data,
		encoding: Encoding.UTF8,
	});
	return String(result.data);
}

async function writeAndroidText(path: string, text: string) {
	await androidFilesystem('writeFile', {
		path,
		data: text,
		directory: Directory.Data,
		encoding: Encoding.UTF8,
		recursive: true,
	});
}

async function deleteAndroidFile(path: string) {
	try {
		await androidFilesystem('deleteFile', { path, directory: Directory.Data });
	} catch {
		// 已清除
	}
}

async function getAndroidFileSize(path: string) {
	try {
		return (
			(
				await androidFilesystem<
					Awaited<ReturnType<typeof Filesystem.stat>>
				>('stat', { path, directory: Directory.Data })
			).size ?? 0
		);
	} catch {
		return 0;
	}
}

async function getAndroidDirectoryBytes(path: string): Promise<number> {
	try {
		const entries = await androidFilesystem<
			Awaited<ReturnType<typeof Filesystem.readdir>>
		>('readdir', { path, directory: Directory.Data });
		let total = 0;
		for (const entry of entries.files) {
			const name = typeof entry === 'string' ? entry : entry.name;
			const type = typeof entry === 'string' ? undefined : entry.type;
			const childPath = `${path}/${name}`;
			if (type === 'directory') total += await getAndroidDirectoryBytes(childPath);
			else total += await getAndroidFileSize(childPath);
		}
		return total;
	} catch {
		return 0;
	}
}

function getAndroidDocsDir() {
	return `${ROOT_DIR}/${DOCS_DIR}`;
}

function getAndroidMetaDir() {
	return `${ROOT_DIR}/${META_DIR}`;
}

function getAndroidDocPath(localName: string) {
	return `${getAndroidDocsDir()}/${localName}`;
}

function getAndroidMetaPath(id: string) {
	return `${getAndroidMetaDir()}/${getMetaName(id)}`;
}

// ---------------------------------------------------------------------------
// 内部 —— OPFS
// ---------------------------------------------------------------------------

async function getRootDirectory(): Promise<FileSystemDirectoryHandle> {
	if (!isOpfsAvailable()) throw new Error('OPFS unavailable');
	const storage = navigator.storage as OpfsStorageManager;
	const originRoot = await storage.getDirectory?.();
	if (!originRoot) throw new Error('OPFS unavailable');
	return originRoot.getDirectoryHandle(ROOT_DIR, { create: true });
}

async function getDocsDirectory() {
	return (await getRootDirectory()).getDirectoryHandle(DOCS_DIR, {
		create: true,
	});
}

async function getMetaDirectory() {
	return (await getRootDirectory()).getDirectoryHandle(META_DIR, {
		create: true,
	});
}

async function writeTextFile(
	directory: FileSystemDirectoryHandle,
	name: string,
	text: string,
) {
	const handle = await directory.getFileHandle(name, { create: true });
	const writable = await handle.createWritable();
	await writable.write(text);
	await writable.close();
}

async function removeEntryIfExists(
	directory: FileSystemDirectoryHandle,
	name: string,
) {
	try {
		await directory.removeEntry(name);
	} catch {
		// 已清除
	}
}

async function getFileSize(handle: FileSystemFileHandle): Promise<number> {
	try {
		return (await handle.getFile()).size;
	} catch {
		return 0;
	}
}

async function getMetadataBytes(): Promise<number> {
	const metaDir = await getMetaDirectory();
	let total = 0;
	for await (const [, handle] of (
		metaDir as DirectoryWithEntries
	).entries()) {
		if (handle.kind === 'file')
			total += (await (handle as FileSystemFileHandle).getFile()).size;
	}
	return total;
}

// ---------------------------------------------------------------------------
// 内部 —— 共享工具
// ---------------------------------------------------------------------------

function getLocalFileName(document: OfflineDocument) {
	const extension = getFileExtension(document.url)
		|| document.fileType
		|| deriveFileType(document.mimeType);
	return `${sanitizeFileName(document.id)}.${extension}`;
}

function getResumeStartByte(
	previous: CachedDocumentMeta | undefined,
	localName: string,
	force = false,
	existingBytes = 0,
) {
	if (force || !previous || previous.localName !== localName) return 0;
	if (previous.status !== 'failed' && previous.status !== 'downloading')
		return 0;
	return Math.max(previous.partialBytes, existingBytes);
}

function getMetaName(id: string) {
	return `${sanitizeFileName(id)}.json`;
}

function createMeta(
	document: OfflineDocument,
	localName: string,
	overrides: Partial<CachedDocumentMeta>,
): CachedDocumentMeta {
	return {
		id: document.id,
		status: 'not-downloaded',
		localName,
		mimeType: document.mimeType,
		fileType: document.fileType ?? deriveFileType(document.mimeType),
		etag: document.etag,
		lastModified: document.lastModified,
		serverSize: document.size,
		cachedBytes: 0,
		partialBytes: 0,
		...overrides,
	};
}

function buildProgress(
	id: string,
	receivedBytes: number,
	totalBytes: number | undefined,
	resumable: boolean,
	message?: string,
): DownloadProgress {
	return {
		id,
		receivedBytes,
		totalBytes,
		percent:
			totalBytes && totalBytes > 0
				? Math.min(100, Math.round((receivedBytes / totalBytes) * 1000) / 10)
				: undefined,
		resumable,
		message,
	};
}

function getResponseTotalBytes(
	response: Response,
	startByte: number,
): number | undefined {
	const contentRange = response.headers.get('content-range');
	const totalFromRange = contentRange?.match(/\/(\d+)$/)?.[1];
	if (totalFromRange) return Number(totalFromRange);

	const contentLength = parseNumber(response.headers.get('content-length'));
	if (typeof contentLength === 'number') return startByte + contentLength;
	return undefined;
}

function validateDocumentResponse(
	response: Response,
	document: OfflineDocument,
) {
	const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
	if (
		contentType.includes('text/html')
		&& !document.mimeType.toLowerCase().includes('html')
	) {
		throw new Error('服务器返回了 HTML 页面，未获取到真实文档文件');
	}
}

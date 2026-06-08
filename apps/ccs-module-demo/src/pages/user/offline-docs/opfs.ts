import { FileOpener } from '@capacitor-community/file-opener';
import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import type { CachedDocumentMeta, DownloadProgress, OfflineDocument, OfflineStorageKind, StorageStats, ViewerSource } from './types';

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
	checkDocumentUpdate: (document: OfflineDocument, absoluteUrl: string) => Promise<CachedDocumentMeta | undefined>;
	getCachedFileUrl: (id: string) => Promise<string | undefined>;
	openCachedDocument: (id: string) => Promise<void>;
	openOnlineDocument: (absoluteUrl: string) => Promise<void>;
	downloadDocument: (request: { downloadId: string; document: OfflineDocument; absoluteUrl: string; force?: boolean }) => Promise<CachedDocumentMeta>;
	onDownloadProgress: (listener: (payload: ElectronDownloadPayload) => void) => () => void;
};

type ElectronBridge = {
	platform?: string;
	offlineDocs?: ElectronOfflineDocsBridge;
};

type AndroidFilesystemMethod = 'mkdir' | 'readdir' | 'readFile' | 'writeFile' | 'appendFile' | 'deleteFile' | 'stat' | 'getUri';

type AndroidFilesystemResponse<T> = {
	type: 'CCS_ANDROID_FS_RESPONSE';
	id: string;
	result?: T;
	error?: string;
};

type AndroidFileOpenResponse = {
	type: 'CCS_ANDROID_FILE_OPEN_RESPONSE';
	id: string;
	error?: string;
};

const ROOT_DIR = 'ccs-offline-docs-v1';
const DOCS_DIR = 'docs';
const META_DIR = 'meta';
const CATALOG_FILE = 'catalog.json';

export function isOpfsAvailable(): boolean {
	const nativeKind = getNativeStorageKind();
	if (nativeKind === 'electron' || nativeKind === 'android') {
		return true;
	}
	const webOpfs = typeof navigator !== 'undefined' && typeof (navigator.storage as OpfsStorageManager | undefined)?.getDirectory === 'function';
	return webOpfs;
}

export async function persistOpfsStorage(): Promise<boolean> {
	if (!navigator.storage?.persist) return false;
	try {
		return await navigator.storage.persist();
	} catch {
		return false;
	}
}

export async function writeCatalogSnapshot(documents: OfflineDocument[]) {
	const electron = getElectronOfflineDocs();
	if (electron) return electron.writeCatalogSnapshot(documents);
	if (isAndroidNative()) return writeAndroidText(CATALOG_FILE, JSON.stringify(documents, null, 2));

	const root = await getRootDirectory();
	await writeTextFile(root, CATALOG_FILE, JSON.stringify(documents, null, 2));
}

export async function getAllMetadata(): Promise<CachedDocumentMeta[]> {
	const electron = getElectronOfflineDocs();
	if (electron) return electron.getAllMetadata();
	if (isAndroidNative()) return getAllAndroidMetadata();

	const metaDir = await getMetaDirectory();
	const metadata: CachedDocumentMeta[] = [];

	for await (const [name, handle] of (metaDir as DirectoryWithEntries).entries()) {
		if (handle.kind !== 'file' || !name.endsWith('.json')) continue;
		try {
			metadata.push(JSON.parse(await (await (handle as FileSystemFileHandle).getFile()).text()) as CachedDocumentMeta);
		} catch {
			// Ignore corrupt metadata files; the UI can recover when the document is downloaded again.
		}
	}

	return metadata;
}

export async function getDocumentMeta(id: string): Promise<CachedDocumentMeta | undefined> {
	const electron = getElectronOfflineDocs();
	if (electron) return electron.getDocumentMeta(id);
	if (isAndroidNative()) return getAndroidDocumentMeta(id);

	try {
		const metaDir = await getMetaDirectory();
		const handle = await metaDir.getFileHandle(getMetaName(id));
		return JSON.parse(await (await handle.getFile()).text()) as CachedDocumentMeta;
	} catch {
		return undefined;
	}
}

export async function saveDocumentMeta(meta: CachedDocumentMeta) {
	const electron = getElectronOfflineDocs();
	if (electron) return electron.saveDocumentMeta(meta);
	if (isAndroidNative()) return saveAndroidDocumentMeta(meta);

	const metaDir = await getMetaDirectory();
	await writeTextFile(metaDir, getMetaName(meta.id), JSON.stringify(meta, null, 2));
}

export async function getStorageStats(): Promise<StorageStats> {
	const electron = getElectronOfflineDocs();
	if (electron) {
		return { ...await electron.getStorageStats(), opfsAvailable: true, storageKind: 'electron', storageLabel: 'Electron userData' };
	}
	if (isAndroidNative()) return getAndroidStorageStats();

	if (!isOpfsAvailable()) {
		return { usedBytes: 0, metadataBytes: 0, cachedBytes: 0, partialBytes: 0, opfsAvailable: false, storageKind: 'unavailable', storageLabel: '不可用' };
	}

	const metadata = await getAllMetadata();
	const estimate = await navigator.storage?.estimate?.();
	const persisted = await navigator.storage?.persisted?.();
	const cachedBytes = metadata.reduce((total, meta) => total + meta.cachedBytes, 0);
	const partialBytes = metadata.reduce((total, meta) => total + meta.partialBytes, 0);
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
		storageLabel: 'Web OPFS'
	};
}

export async function createCachedObjectUrl(document: OfflineDocument): Promise<ViewerSource> {
	// Electron: try the native bridge first; fall back to OPFS when the
	// document was downloaded via the Web OPFS path (e.g. after a bridge
	// failure during download).
	const electron = getElectronOfflineDocs();
	if (electron) {
		try {
			const url = await electron.getCachedFileUrl(document.id);
			if (url) return { kind: 'cache', url };
		} catch {
			// Bridge unavailable – fall through to OPFS path below.
		}
	}

	// In Electron without a working bridge we can still serve files that
	// were downloaded via the Web OPFS fallback.
	if (isAndroidNative()) return createAndroidCachedUrl(document);

	const meta = await getDocumentMeta(document.id);
	if (!meta || (meta.status !== 'offline' && meta.status !== 'update-available')) {
		return { kind: 'unavailable', message: '本地没有可用缓存' };
	}

	const docsDir = await getDocsDirectory();
	const handle = await docsDir.getFileHandle(meta.localName);
	const file = await handle.getFile();
	await touchDocument(document.id);

	return { kind: 'cache', url: URL.createObjectURL(file), blob: file };
}

export async function openOnlineDocument(document: OfflineDocument) {
	const absoluteUrl = toAbsoluteDocumentUrl(document);

	// Electron: try the native bridge first, then fall back to window.open().
	// In an iframe the contextBridge proxy may not be reachable, so a
	// window.open() fallback (intercepted by Electron's setWindowOpenHandler)
	// guarantees the same behaviour as the attendance map feature.
	const electron = getElectronOfflineDocs();
	if (electron) {
		try {
			await electron.openOnlineDocument(absoluteUrl);
			return;
		} catch {
			// Bridge call failed – fall through to the fallback below.
		}
	}

	// If we are in Electron but the bridge was missing or failed, window.open
	// is the only remaining option.  The main process must be configured to
	// allow external URLs via setWindowOpenHandler.
	if (isElectronRuntime()) {
		openExternalLink(absoluteUrl);
		return;
	}

	// Android: navigate window.top so Capacitor's shouldOverrideUrlLoading
	// intercepts and opens the URL in the system browser.
	if (isAndroidNative()) {
		try {
			(window.top ?? window).location.assign(absoluteUrl);
		} catch {
			window.location.assign(absoluteUrl);
		}
		return;
	}

	// Web: open in new tab
	openExternalLink(absoluteUrl);
}

/** Detect whether we are running inside an Electron renderer (main frame or iframe). */
function isElectronRuntime(): boolean {
	try {
		if ((window as Window & { ccsElectron?: ElectronBridge }).ccsElectron?.platform) return true;
		if ((window.top as Window & { ccsElectron?: ElectronBridge } | null)?.ccsElectron?.platform) return true;
	} catch { /* cross-origin top – ignore */ }
	return /Electron/i.test(navigator.userAgent);
}

export async function openCachedDocument(document: OfflineDocument): Promise<void> {
	// Electron: try the native bridge; it copies the file to a temp directory
	// and opens it with the system default handler.
	const electron = getElectronOfflineDocs();
	if (electron) {
		try {
			return await electron.openCachedDocument(document.id);
		} catch {
			// Bridge unavailable – fall through to the OPFS / blob-URL path below.
		}
	}

	if (isAndroidNative()) return openAndroidCachedDocument(document);

	// Web (and Electron fallback): create a blob URL from OPFS and open in a new tab
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
	const electron = getElectronOfflineDocs();
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

export async function checkDocumentUpdate(document: OfflineDocument): Promise<CachedDocumentMeta | undefined> {
	const electron = getElectronOfflineDocs();
	if (electron) return electron.checkDocumentUpdate(document, toAbsoluteDocumentUrl(document));
	if (isAndroidNative()) return checkNativeDocumentUpdate(document);

	const meta = await getDocumentMeta(document.id);
	if (!meta || !navigator.onLine) return meta;

	try {
		const response = await fetch(toAbsoluteDocumentUrl(document), { method: 'HEAD', cache: 'no-store' });
		if (!response.ok) return meta;

		const nextEtag = response.headers.get('etag') ?? document.etag;
		const nextLastModified = response.headers.get('last-modified') ?? document.lastModified;
		const nextSize = parseNumber(response.headers.get('content-length')) ?? document.size;
		const changed = Boolean(
			(nextEtag && meta.etag && nextEtag !== meta.etag)
			|| (nextLastModified && meta.lastModified && nextLastModified !== meta.lastModified)
			|| (typeof nextSize === 'number' && meta.serverSize && nextSize !== meta.serverSize)
		);

		if (!changed) return meta;
		const updated: CachedDocumentMeta = {
			...meta,
			status: 'update-available',
			etag: nextEtag,
			lastModified: nextLastModified,
			serverSize: nextSize,
			error: undefined
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
	options: { force?: boolean; signal?: AbortSignal } = {}
): Promise<CachedDocumentMeta> {
	// Electron: prefer the native bridge (downloads via Node.js in the main
	// process), but fall back to Web OPFS when the bridge is broken
	// (e.g. contextBridge proxy unreachable from an iframe).
	const electron = getElectronOfflineDocs();
	if (electron) {
		try {
			return await downloadDocumentWithElectron(electron, document, onProgress, options);
		} catch (bridgeError) {
			// When the bridge call itself fails the proxy is likely stale;
			// try the Web OPFS path below instead of surfacing an opaque error.
			if (isOpfsAvailable()) {
			} else {
				throw bridgeError;
			}
		}
	}

	if (isAndroidNative()) return downloadDocumentWithAndroid(document, onProgress, options);

	if (!isOpfsAvailable()) throw new Error('当前浏览器不支持 OPFS，无法离线缓存大文件');
	if (!document.allowOffline) throw new Error('该文档未开放离线缓存');

	await persistOpfsStorage();

	const docsDir = await getDocsDirectory();
	const localName = getLocalFileName(document);
	const fileHandle = await docsDir.getFileHandle(localName, { create: true });
	const previous = await getDocumentMeta(document.id);
	let startByte = getResumeStartByte(previous, localName, options.force, await getFileSize(fileHandle));
	const requestHeaders = new Headers();
	if (startByte > 0) requestHeaders.set('Range', `bytes=${startByte}-`);

	let writable: FileSystemWritableFileStream | undefined;

	try {
		const response = await fetch(toAbsoluteDocumentUrl(document), { headers: requestHeaders, cache: 'no-store', signal: options.signal });
		if (!response.ok && response.status !== 206) throw new Error(`下载失败：HTTP ${response.status}`);
		validateDocumentResponse(response, document);
		if (!response.body) throw new Error('当前环境无法读取下载流');

		const canResume = startByte > 0 && response.status === 206;
		if (startByte > 0 && !canResume) startByte = 0;

		const totalBytes = getResponseTotalBytes(response, startByte) ?? document.size;
		writable = await fileHandle.createWritable({ keepExistingData: canResume });
		if (canResume) await writable.seek(startByte);

		let receivedBytes = startByte;
		await saveDocumentMeta(createMeta(document, localName, {
			status: 'downloading',
			cachedBytes: 0,
			partialBytes: receivedBytes,
			serverSize: totalBytes,
			etag: response.headers.get('etag') ?? document.etag,
			lastModified: response.headers.get('last-modified') ?? document.lastModified
		}));
		onProgress(buildProgress(document.id, receivedBytes, totalBytes, canResume, canResume ? '正在续传' : '正在下载'));

		const reader = response.body.getReader();
		let lastMetaWriteAt = 0;

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			if (!value) continue;
			await writable.write(value);
			receivedBytes += value.byteLength;
			onProgress(buildProgress(document.id, receivedBytes, totalBytes, canResume));

			const now = Date.now();
			if (now - lastMetaWriteAt > 1000) {
				lastMetaWriteAt = now;
				await saveDocumentMeta(createMeta(document, localName, {
					status: 'downloading',
					cachedBytes: 0,
					partialBytes: receivedBytes,
					serverSize: totalBytes,
					etag: response.headers.get('etag') ?? document.etag,
					lastModified: response.headers.get('last-modified') ?? document.lastModified
				}));
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
			lastModified: response.headers.get('last-modified') ?? document.lastModified,
			downloadedAt: new Date().toISOString(),
			lastAccessedAt: new Date().toISOString()
		});

		await saveDocumentMeta(completed);
		onProgress(buildProgress(document.id, receivedBytes, totalBytes ?? receivedBytes, canResume, '已离线'));
		return completed;
	} catch (error) {
		if (writable) {
			try {
				await writable.close();
			} catch {
				// Keep the partial OPFS file; the next download can retry or resume.
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
			lastModified: document.lastModified
		});
		await saveDocumentMeta(failed);
		throw error;
	}
}

function getNativeStorageKind(): OfflineStorageKind {
	if (getElectronOfflineDocs()) return 'electron';
	if (isAndroidNative()) return 'android';
	return 'unavailable';
}

function getElectronOfflineDocs(): ElectronOfflineDocsBridge | undefined {
	const current = (window as Window & { ccsElectron?: ElectronBridge }).ccsElectron?.offlineDocs;
	if (current) {
		return current;
	}

	try {
		const topBridge = (window.top as Window & { ccsElectron?: ElectronBridge } | null)?.ccsElectron;
		return topBridge?.offlineDocs;
	} catch (err) {
		return undefined;
	}
}

function isAndroidNative() {
	try {
		const here = Capacitor.isNativePlatform?.();
		if (here) {
			return Capacitor.getPlatform?.() === 'android';
		}
		const topCapacitor = getTopCapacitor();
		const topNative = topCapacitor?.isNativePlatform?.();
		if (topNative) return topCapacitor?.getPlatform?.() === 'android';
		return false;
	} catch {
		return false;
	}
}

function getTopCapacitor(): Pick<typeof Capacitor, 'getPlatform' | 'isNativePlatform'> | undefined {
	if (window === window.top) return undefined;
	try {
		return (window.top as Window & { Capacitor?: Pick<typeof Capacitor, 'getPlatform' | 'isNativePlatform'> } | null)?.Capacitor;
	} catch {
		return undefined;
	}
}

async function downloadDocumentWithElectron(
	electron: ElectronOfflineDocsBridge,
	document: OfflineDocument,
	onProgress: (progress: DownloadProgress) => void,
	options: { force?: boolean; signal?: AbortSignal } = {}
): Promise<CachedDocumentMeta> {
	const downloadId = `${document.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
	const unsubscribe = electron.onDownloadProgress((payload) => {
		if (payload.downloadId === downloadId) onProgress(payload.progress);
	});

	try {
		const result = await electron.downloadDocument({ downloadId, document, absoluteUrl: toAbsoluteDocumentUrl(document), force: options.force });
		return result;
	} finally {
		unsubscribe();
	}
}

async function getAllAndroidMetadata(): Promise<CachedDocumentMeta[]> {
	await ensureAndroidDirectories();
	let result: Awaited<ReturnType<typeof Filesystem.readdir>>;
	try {
		result = await androidFilesystem('readdir', { path: getAndroidMetaDir(), directory: Directory.Data });
	} catch {
		return [];
	}

	const files = result.files.map((file) => typeof file === 'string' ? file : file.name).filter((name) => name.endsWith('.json'));
	const metadata: CachedDocumentMeta[] = [];
	for (const file of files) {
		try {
			metadata.push(JSON.parse(await readAndroidText(`${getAndroidMetaDir()}/${file}`)) as CachedDocumentMeta);
		} catch {
			// Ignore corrupt metadata files; downloading again can repair them.
		}
	}
	return metadata;
}

async function getAndroidDocumentMeta(id: string): Promise<CachedDocumentMeta | undefined> {
	try {
		return JSON.parse(await readAndroidText(getAndroidMetaPath(id))) as CachedDocumentMeta;
	} catch {
		return undefined;
	}
}

async function saveAndroidDocumentMeta(meta: CachedDocumentMeta) {
	await writeAndroidText(getAndroidMetaPath(meta.id), JSON.stringify(meta, null, 2));
}

async function getAndroidStorageStats(): Promise<StorageStats> {
	const metadata = await getAllAndroidMetadata();
	const cachedBytes = metadata.reduce((total, meta) => total + meta.cachedBytes, 0);
	const partialBytes = metadata.reduce((total, meta) => total + meta.partialBytes, 0);
	const metadataBytes = await getAndroidDirectoryBytes(getAndroidMetaDir());
	return {
		usedBytes: cachedBytes + partialBytes + metadataBytes,
		cachedBytes,
		partialBytes,
		metadataBytes,
		opfsAvailable: true,
		storageKind: 'android',
		storageLabel: 'Android 私有目录'
	};
}

async function createAndroidCachedUrl(document: OfflineDocument): Promise<ViewerSource> {
	const meta = await getAndroidDocumentMeta(document.id);
	if (!meta || (meta.status !== 'offline' && meta.status !== 'update-available')) {
		return { kind: 'unavailable', message: '本地没有可用缓存' };
	}

	const result = await androidFilesystem<Awaited<ReturnType<typeof Filesystem.getUri>>>('getUri', { path: getAndroidDocPath(meta.localName), directory: Directory.Data });
	await touchDocument(document.id);
	return { kind: 'cache', url: Capacitor.convertFileSrc(result.uri) };
}

async function openAndroidCachedDocument(document: OfflineDocument) {
	const meta = await getAndroidDocumentMeta(document.id);
	if (!meta || (meta.status !== 'offline' && meta.status !== 'update-available')) throw new Error('本地没有可用缓存');
	const result = await androidFilesystem<Awaited<ReturnType<typeof Filesystem.getUri>>>('getUri', { path: getAndroidDocPath(meta.localName), directory: Directory.Data });
	await touchDocument(document.id);
	await androidOpenFile(result.uri, document.mimeType);
}

async function removeAndroidDocumentCache(id: string) {
	const meta = await getAndroidDocumentMeta(id);
	if (meta?.localName) await deleteAndroidFile(getAndroidDocPath(meta.localName));
	await deleteAndroidFile(getAndroidMetaPath(id));
}

async function checkNativeDocumentUpdate(document: OfflineDocument): Promise<CachedDocumentMeta | undefined> {
	const meta = await getDocumentMeta(document.id);
	if (!meta || !navigator.onLine) return meta;

	try {
		const response = await fetch(toAbsoluteDocumentUrl(document), { method: 'HEAD', cache: 'no-store' });
		if (!response.ok) return meta;

		const nextEtag = response.headers.get('etag') ?? document.etag;
		const nextLastModified = response.headers.get('last-modified') ?? document.lastModified;
		const nextSize = parseNumber(response.headers.get('content-length')) ?? document.size;
		const changed = Boolean(
			(nextEtag && meta.etag && nextEtag !== meta.etag)
			|| (nextLastModified && meta.lastModified && nextLastModified !== meta.lastModified)
			|| (typeof nextSize === 'number' && meta.serverSize && nextSize !== meta.serverSize)
		);

		if (!changed) return meta;
		const updated: CachedDocumentMeta = { ...meta, status: 'update-available', etag: nextEtag, lastModified: nextLastModified, serverSize: nextSize, error: undefined };
		await saveDocumentMeta(updated);
		return updated;
	} catch {
		return meta;
	}
}

async function downloadDocumentWithAndroid(
	document: OfflineDocument,
	onProgress: (progress: DownloadProgress) => void,
	options: { force?: boolean; signal?: AbortSignal } = {}
): Promise<CachedDocumentMeta> {
	if (!document.allowOffline) throw new Error('该文档未开放离线缓存');

	await ensureAndroidDirectories();
	const localName = getLocalFileName(document);
	const localPath = getAndroidDocPath(localName);
	const previous = await getAndroidDocumentMeta(document.id);
	let startByte = getResumeStartByte(previous, localName, options.force, await getAndroidFileSize(localPath));
	const requestHeaders = new Headers();
	if (startByte > 0) requestHeaders.set('Range', `bytes=${startByte}-`);

	try {
		const absoluteUrl = toAbsoluteDocumentUrl(document);
		const response = await fetch(absoluteUrl, { headers: requestHeaders, cache: 'no-store', signal: options.signal });
		if (!response.ok && response.status !== 206) throw new Error(`下载失败：HTTP ${response.status}`);
		validateDocumentResponse(response, document);
		if (!response.body) throw new Error('当前环境无法读取下载流');

		const canResume = startByte > 0 && response.status === 206;
		if (startByte > 0 && !canResume) startByte = 0;
		const totalBytes = getResponseTotalBytes(response, startByte) ?? document.size;
		let receivedBytes = startByte;
		let hasWrittenChunk = canResume;

		await saveAndroidDocumentMeta(createMeta(document, localName, {
			status: 'downloading',
			cachedBytes: 0,
			partialBytes: receivedBytes,
			serverSize: totalBytes,
			etag: response.headers.get('etag') ?? document.etag,
			lastModified: response.headers.get('last-modified') ?? document.lastModified
		}));
		onProgress(buildProgress(document.id, receivedBytes, totalBytes, canResume, canResume ? '正在续传' : '正在下载'));

		const reader = response.body.getReader();
		let lastMetaWriteAt = 0;
		const BATCH_BYTES = 512 * 1024; // flush every 512 KB to reduce postMessage overhead
		const chunks: Uint8Array[] = [];
		let batchBytes = 0;

		async function flushBatch() {
			if (!chunks.length) return;
			const merged = new Uint8Array(batchBytes);
			let offset = 0;
			for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength; }
			const data = bytesToBase64(merged);
			if (hasWrittenChunk) await androidFilesystem('appendFile', { path: localPath, data, directory: Directory.Data });
			else {
				await androidFilesystem('writeFile', { path: localPath, data, directory: Directory.Data, recursive: true });
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
			onProgress(buildProgress(document.id, receivedBytes, totalBytes, canResume));

			if (batchBytes >= BATCH_BYTES) await flushBatch();

			const now = Date.now();
			if (now - lastMetaWriteAt > 1000) {
				lastMetaWriteAt = now;
				await saveAndroidDocumentMeta(createMeta(document, localName, {
					status: 'downloading',
					cachedBytes: 0,
					partialBytes: receivedBytes,
					serverSize: totalBytes,
					etag: response.headers.get('etag') ?? document.etag,
					lastModified: response.headers.get('last-modified') ?? document.lastModified
				}));
			}
		}

		// Flush any remaining buffered data
		await flushBatch();

		const completed = createMeta(document, localName, {
			status: 'offline',
			cachedBytes: receivedBytes,
			partialBytes: 0,
			serverSize: totalBytes ?? receivedBytes,
			etag: response.headers.get('etag') ?? document.etag,
			lastModified: response.headers.get('last-modified') ?? document.lastModified,
			downloadedAt: new Date().toISOString(),
			lastAccessedAt: new Date().toISOString()
		});
		await saveAndroidDocumentMeta(completed);
		onProgress(buildProgress(document.id, receivedBytes, totalBytes ?? receivedBytes, canResume, '已离线'));
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
			lastModified: document.lastModified
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
		await androidFilesystem('mkdir', { path, directory: Directory.Data, recursive: true });
	} catch {
		// Existing directories are fine.
	}
}

async function readAndroidText(path: string) {
	const result = await androidFilesystem<Awaited<ReturnType<typeof Filesystem.readFile>>>('readFile', { path, directory: Directory.Data, encoding: Encoding.UTF8 });
	return String(result.data);
}

async function writeAndroidText(path: string, text: string) {
	await androidFilesystem('writeFile', { path, data: text, directory: Directory.Data, encoding: Encoding.UTF8, recursive: true });
}

async function deleteAndroidFile(path: string) {
	try {
		await androidFilesystem('deleteFile', { path, directory: Directory.Data });
	} catch {
		// Missing entries are already cleared.
	}
}

async function getAndroidFileSize(path: string) {
	try {
		return (await androidFilesystem<Awaited<ReturnType<typeof Filesystem.stat>>>('stat', { path, directory: Directory.Data })).size ?? 0;
	} catch {
		return 0;
	}
}

async function getAndroidDirectoryBytes(path: string): Promise<number> {
	try {
		const entries = await androidFilesystem<Awaited<ReturnType<typeof Filesystem.readdir>>>('readdir', { path, directory: Directory.Data });
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

function toAbsoluteDocumentUrl(document: OfflineDocument) {
	return resolveDocumentUrl(document.url);
}

/**
 * 将文档的相对路径解析为绝对 URL。
 * - 已是绝对 URL → 原样返回
 * - OFFLINE_DOCS_ANDROID → 构建 Android 应用时使用（模拟器设 10.0.2.2，真机设实际 IP）
 * - OFFLINE_DOCS_SERVER  → Web / Electron / 不设 ANDROID 时的通用配置
 * - VITE_CCS_DOCS_BASE_URL → 备选
 * - 均未配置 → 默认 https://{当前主机名}:8080/{路径}
 *
 * 注意：不根据运行环境自动选择，由 .env 构建配置决定。
 * 真机 Android 构建时不设 OFFLINE_DOCS_ANDROID 即可使用 OFFLINE_DOCS_SERVER。
 */
function resolveDocumentUrl(url: string) {
	if (/^https?:\/\//i.test(url)) return url;

	const env = import.meta.env as Record<string, string | undefined>;
	// 构建时常量（Vite define 注入）或 process.env 回退（Electron 构建传递）
	const configured = env.OFFLINE_DOCS_ANDROID
		|| env.OFFLINE_DOCS_SERVER
		|| (typeof process !== 'undefined' && (process.env as Record<string, string | undefined>).OFFLINE_DOCS_SERVER)
		|| env.VITE_CCS_DOCS_BASE_URL;

	if (configured) {
		const base = configured.endsWith('/') ? configured : `${configured}/`;
		return new URL(url, base).toString();
	}

	// 默认：与 Web 应用同主机、端口 8080。
	// Android Capacitor WebView 中 fetch() 会拒绝自签名 HTTPS 证书，
	// 因此 Android 原生环境下默认使用 HTTP（capacitor.config 已设 cleartext:true）。
	const scheme = isAndroidNative() ? 'http' : 'https';
	return `${scheme}://${window.location.hostname}:8080/${url}`;
}

function bytesToBase64(bytes: Uint8Array) {
	let binary = '';
	const chunkSize = 0x8000;
	for (let index = 0; index < bytes.length; index += chunkSize) {
		binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
	}
	return btoa(binary);
}

function androidFilesystem<T = unknown>(method: AndroidFilesystemMethod, args: Record<string, unknown>): Promise<T> {
	// When Capacitor native platform is available on the CURRENT window,
	// use the plugin directly.  PostMessage is only needed as a fallback
	// when Capacitor lives exclusively in the parent frame.
	if (!shouldUseParentPostMessageBridge()) {
		const operation = Filesystem[method] as unknown as (options: Record<string, unknown>) => Promise<T>;
		return operation(args);
	}

	return new Promise<T>((resolve, reject) => {
		const id = `${method}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
		const timeout = window.setTimeout(() => {
			window.removeEventListener('message', handleResponse);
			reject(new Error('Android 文件系统操作超时'));
		}, 30000);

		function handleResponse(event: MessageEvent<AndroidFilesystemResponse<T>>) {
			if (event.data?.type !== 'CCS_ANDROID_FS_RESPONSE' || event.data.id !== id) return;
			window.clearTimeout(timeout);
			window.removeEventListener('message', handleResponse);
			if (event.data.error) reject(new Error(event.data.error));
			else resolve(event.data.result as T);
		}

		window.addEventListener('message', handleResponse);
		window.top?.postMessage({ type: 'CCS_ANDROID_FS_REQUEST', id, method, args }, '*');
	});
}

function androidOpenFile(filePath: string, contentType: string): Promise<void> {
	if (!shouldUseParentPostMessageBridge()) {
		return FileOpener.open({ filePath, contentType, openWithDefault: true });
	}

	return new Promise<void>((resolve, reject) => {
		const id = `open-file-${Date.now()}-${Math.random().toString(36).slice(2)}`;
		const timeout = window.setTimeout(() => {
			window.removeEventListener('message', handleResponse);
			reject(new Error('Android 文件打开操作超时'));
		}, 30000);

		function handleResponse(event: MessageEvent<AndroidFileOpenResponse>) {
			if (event.data?.type !== 'CCS_ANDROID_FILE_OPEN_RESPONSE' || event.data.id !== id) return;
			window.clearTimeout(timeout);
			window.removeEventListener('message', handleResponse);
			if (event.data.error) reject(new Error(event.data.error));
			else resolve();
		}

		window.addEventListener('message', handleResponse);
		window.top?.postMessage({ type: 'CCS_ANDROID_FILE_OPEN_REQUEST', id, filePath, contentType }, '*');
	});
}

/**
 * Returns true only when running in an iframe inside a Capacitor Android
 * app.  In that case we MUST use postMessage to relay filesystem / file-open
 * calls to the parent frame, because Capacitor plugins (Filesystem,
 * FileOpener) are only fully initialized in the main frame's JavaScript
 * context — not in child iframes, even when the Capacitor bridge object
 * happens to be visible there.
 */
function shouldUseParentPostMessageBridge() {
	if (window === window.top) return false;
	if (!isAndroidNative()) return false;
	return true;
}

async function getRootDirectory(): Promise<FileSystemDirectoryHandle> {
	if (!isOpfsAvailable()) throw new Error('OPFS unavailable');
	const storage = navigator.storage as OpfsStorageManager;
	const originRoot = await storage.getDirectory?.();
	if (!originRoot) throw new Error('OPFS unavailable');
	return originRoot.getDirectoryHandle(ROOT_DIR, { create: true });
}

async function getDocsDirectory() {
	return (await getRootDirectory()).getDirectoryHandle(DOCS_DIR, { create: true });
}

async function getMetaDirectory() {
	return (await getRootDirectory()).getDirectoryHandle(META_DIR, { create: true });
}

async function writeTextFile(directory: FileSystemDirectoryHandle, name: string, text: string) {
	const handle = await directory.getFileHandle(name, { create: true });
	const writable = await handle.createWritable();
	await writable.write(text);
	await writable.close();
}

async function removeEntryIfExists(directory: FileSystemDirectoryHandle, name: string) {
	try {
		await directory.removeEntry(name);
	} catch {
		// Missing entries are already cleared.
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
	for await (const [, handle] of (metaDir as DirectoryWithEntries).entries()) {
		if (handle.kind === 'file') total += (await (handle as FileSystemFileHandle).getFile()).size;
	}
	return total;
}

function getLocalFileName(document: OfflineDocument) {
	const extension = getFileExtension(document.url) || document.fileType;
	return `${sanitizeFileName(document.id)}.${extension}`;
}

function getResumeStartByte(previous: CachedDocumentMeta | undefined, localName: string, force = false, existingBytes = 0) {
	if (force || !previous || previous.localName !== localName) return 0;
	if (previous.status !== 'failed' && previous.status !== 'downloading') return 0;
	return Math.max(previous.partialBytes, existingBytes);
}

function getMetaName(id: string) {
	return `${sanitizeFileName(id)}.json`;
}

function sanitizeFileName(value: string) {
	return value.replace(/[^a-z0-9._-]/gi, '_');
}

function openExternalLink(url: string) {
	window.open(url, '_blank', 'noopener,noreferrer');
}

function getFileExtension(urlText: string) {
	try {
		const pathname = new URL(urlText, window.location.href).pathname;
		const match = pathname.match(/\.([a-z0-9]+)$/i);
		return match?.[1]?.toLowerCase();
	} catch {
		return undefined;
	}
}

function createMeta(document: OfflineDocument, localName: string, overrides: Partial<CachedDocumentMeta>): CachedDocumentMeta {
	return {
		id: document.id,
		status: 'not-downloaded',
		localName,
		mimeType: document.mimeType,
		fileType: document.fileType,
		etag: document.etag,
		lastModified: document.lastModified,
		serverSize: document.size,
		cachedBytes: 0,
		partialBytes: 0,
		...overrides
	};
}

function buildProgress(id: string, receivedBytes: number, totalBytes: number | undefined, resumable: boolean, message?: string): DownloadProgress {
	return {
		id,
		receivedBytes,
		totalBytes,
		percent: totalBytes && totalBytes > 0 ? Math.min(100, Math.round((receivedBytes / totalBytes) * 1000) / 10) : undefined,
		resumable,
		message
	};
}

function getResponseTotalBytes(response: Response, startByte: number): number | undefined {
	const contentRange = response.headers.get('content-range');
	const totalFromRange = contentRange?.match(/\/(\d+)$/)?.[1];
	if (totalFromRange) return Number(totalFromRange);

	const contentLength = parseNumber(response.headers.get('content-length'));
	if (typeof contentLength === 'number') return startByte + contentLength;
	return undefined;
}

function validateDocumentResponse(response: Response, document: OfflineDocument) {
	const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
	if (contentType.includes('text/html') && !document.mimeType.toLowerCase().includes('html')) {
		throw new Error('服务器返回了 HTML 页面，未获取到真实文档文件');
	}
}

function parseNumber(value: string | null | undefined): number | undefined {
	if (!value) return undefined;
	const numberValue = Number(value);
	return Number.isFinite(numberValue) ? numberValue : undefined;
}

function normalizeError(error: unknown) {
	if (error instanceof Error && error.message) return error.message;
	return '下载中断，可重新下载';
}
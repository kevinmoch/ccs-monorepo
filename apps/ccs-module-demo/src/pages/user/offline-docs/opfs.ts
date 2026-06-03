import { isSameOriginDocument } from './catalog';
import type { CachedDocumentMeta, DownloadProgress, OfflineDocument, StorageStats, ViewerSource } from './types';

type OpfsStorageManager = StorageManager & {
	getDirectory?: () => Promise<FileSystemDirectoryHandle>;
};

type DirectoryWithEntries = FileSystemDirectoryHandle & {
	entries: () => AsyncIterableIterator<[string, FileSystemHandle]>;
};

const ROOT_DIR = 'ccs-offline-docs-v1';
const DOCS_DIR = 'docs';
const META_DIR = 'meta';
const CATALOG_FILE = 'catalog.json';

export function isOpfsAvailable(): boolean {
	return typeof navigator !== 'undefined' && typeof (navigator.storage as OpfsStorageManager | undefined)?.getDirectory === 'function';
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
	const root = await getRootDirectory();
	await writeTextFile(root, CATALOG_FILE, JSON.stringify(documents, null, 2));
}

export async function getAllMetadata(): Promise<CachedDocumentMeta[]> {
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
	try {
		const metaDir = await getMetaDirectory();
		const handle = await metaDir.getFileHandle(getMetaName(id));
		return JSON.parse(await (await handle.getFile()).text()) as CachedDocumentMeta;
	} catch {
		return undefined;
	}
}

export async function saveDocumentMeta(meta: CachedDocumentMeta) {
	const metaDir = await getMetaDirectory();
	await writeTextFile(metaDir, getMetaName(meta.id), JSON.stringify(meta, null, 2));
}

export async function getStorageStats(): Promise<StorageStats> {
	if (!isOpfsAvailable()) {
		return { usedBytes: 0, metadataBytes: 0, cachedBytes: 0, partialBytes: 0, opfsAvailable: false };
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
		opfsAvailable: true
	};
}

export async function createCachedObjectUrl(document: OfflineDocument): Promise<ViewerSource> {
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

export async function touchDocument(id: string) {
	const meta = await getDocumentMeta(id);
	if (!meta) return;
	await saveDocumentMeta({ ...meta, lastAccessedAt: new Date().toISOString() });
}

export async function removeDocumentCache(id: string) {
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
	const meta = await getDocumentMeta(document.id);
	if (!meta || !navigator.onLine || !isSameOriginDocument(document)) return meta;

	try {
		const response = await fetch(document.url, { method: 'HEAD', cache: 'no-store' });
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
	if (!isOpfsAvailable()) throw new Error('当前浏览器不支持 OPFS，无法离线缓存大文件');
	if (!document.allowOffline) throw new Error('该文档未开放离线缓存');
	if (!isSameOriginDocument(document)) throw new Error('Web 端仅允许缓存同源文档');

	await persistOpfsStorage();

	const docsDir = await getDocsDirectory();
	const localName = getLocalFileName(document);
	const fileHandle = await docsDir.getFileHandle(localName, { create: true });
	const previous = await getDocumentMeta(document.id);
	let startByte = options.force ? 0 : Math.max(previous?.partialBytes ?? 0, await getFileSize(fileHandle));
	const requestHeaders = new Headers();
	if (startByte > 0) requestHeaders.set('Range', `bytes=${startByte}-`);

	let writable: FileSystemWritableFileStream | undefined;

	try {
		const response = await fetch(document.url, { headers: requestHeaders, cache: 'no-store', signal: options.signal });
		if (!response.ok && response.status !== 206) throw new Error(`下载失败：HTTP ${response.status}`);
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

function getMetaName(id: string) {
	return `${sanitizeFileName(id)}.json`;
}

function sanitizeFileName(value: string) {
	return value.replace(/[^a-z0-9._-]/gi, '_');
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

function parseNumber(value: string | null | undefined): number | undefined {
	if (!value) return undefined;
	const numberValue = Number(value);
	return Number.isFinite(numberValue) ? numberValue : undefined;
}

function normalizeError(error: unknown) {
	if (error instanceof Error && error.message) return error.message;
	return '下载中断，可重新下载';
}
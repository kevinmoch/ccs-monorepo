export type DocumentFileType = 'image' | 'pdf' | 'docx' | 'xlsx' | 'doc' | 'xls';

export type DocumentStatus = 'not-downloaded' | 'downloading' | 'offline' | 'update-available' | 'failed';

export type ViewerSourceKind = 'cache' | 'online' | 'unavailable';

export type OfflineStorageKind = 'opfs' | 'electron' | 'android' | 'unavailable';

export interface OfflineDocument {
	id: string;
	title: string;
	fileType: DocumentFileType;
	mimeType: string;
	url: string;
	size?: number;
	etag?: string;
	lastModified?: string;
	updatedAt?: string;
	allowOffline?: boolean;
	description?: string;
}

export interface CachedDocumentMeta {
	id: string;
	status: DocumentStatus;
	localName: string;
	mimeType: string;
	fileType: DocumentFileType;
	etag?: string;
	lastModified?: string;
	serverSize?: number;
	cachedBytes: number;
	partialBytes: number;
	downloadedAt?: string;
	lastAccessedAt?: string;
	error?: string;
}

export interface DownloadProgress {
	id: string;
	receivedBytes: number;
	totalBytes?: number;
	percent?: number;
	resumable: boolean;
	message?: string;
}

export interface StorageStats {
	usedBytes: number;
	metadataBytes: number;
	cachedBytes: number;
	partialBytes: number;
	quotaBytes?: number;
	usageBytes?: number;
	persisted?: boolean;
	opfsAvailable: boolean;
	storageKind?: OfflineStorageKind;
	storageLabel?: string;
}

export interface ViewerSource {
	kind: ViewerSourceKind;
	url?: string;
	blob?: Blob;
	message?: string;
}

export interface DocumentWithMeta {
	document: OfflineDocument;
	meta?: CachedDocumentMeta;
	status: DocumentStatus;
}
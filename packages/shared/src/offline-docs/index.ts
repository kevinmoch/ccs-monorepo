/**
 * 离线文档模块 —— 公共入口。
 *
 * 使用方式：
 * ```ts
 * // 类型
 * import type { OfflineDocument, CachedDocumentMeta, ... } from '@ccs/shared/offline-docs';
 *
 * // 目录
 * import { createDocumentCatalog, isDocumentsSiteDocument } from '@ccs/shared/offline-docs';
 *
 * // 存储操作
 * import {
 *   isOpfsAvailable,
 *   downloadDocumentToOpfs,
 *   openCachedDocument,
 *   openOnlineDocument,
 *   ...
 * } from '@ccs/shared/offline-docs';
 * ```
 */

// 类型
export type {
	CachedDocumentMeta,
	DocumentFileType,
	DocumentStatus,
	DocumentWithMeta,
	DownloadProgress,
	OfflineDocument,
	OfflineStorageKind,
	StorageStats,
	ViewerSource,
	ViewerSourceKind,
} from './types';

// 目录
export { createDocumentCatalog, isDocumentsSiteDocument } from './catalog';

// 存储操作
export {
	checkDocumentUpdate,
	createCachedObjectUrl,
	downloadDocumentToOpfs,
	getAllMetadata,
	getDocumentMeta,
	getStorageStats,
	isOpfsAvailable,
	openCachedDocument,
	openOnlineDocument,
	removeDocumentCache,
	removeManyDocumentCaches,
	saveDocumentMeta,
	touchDocument,
	writeCatalogSnapshot,
} from './opfs';

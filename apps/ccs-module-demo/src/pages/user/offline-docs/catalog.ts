import localDocuments from '../../../data/offline-documents.json';
import type { OfflineDocument } from './types';

const manifestUrl = import.meta.env.VITE_CCS_OFFLINE_DOCS_MANIFEST as string | undefined;

export async function loadDocumentCatalog(): Promise<OfflineDocument[]> {
	const localCatalog = localDocuments as OfflineDocument[];
	if (!navigator.onLine || !manifestUrl) return localCatalog;

	try {
		const response = await fetch(manifestUrl, { cache: 'no-store' });
		if (!response.ok) return localCatalog;
		const remoteCatalog = await response.json() as OfflineDocument[];
		return mergeCatalogs(localCatalog, remoteCatalog);
	} catch {
		return localCatalog;
	}
}

export function isDocumentsSiteDocument(document: OfflineDocument): boolean {
	// 相对路径（不含 http(s)://）表示文档站点文档，绝对 URL 表示远程文档
	return !/^https?:\/\//i.test(document.url);
}

function mergeCatalogs(localCatalog: OfflineDocument[], remoteCatalog: OfflineDocument[]): OfflineDocument[] {
	const merged = new Map(localCatalog.map((document) => [document.id, document]));
	for (const document of remoteCatalog) merged.set(document.id, { ...merged.get(document.id), ...document });
	return Array.from(merged.values());
}
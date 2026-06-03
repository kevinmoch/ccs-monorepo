import localDocuments from '../../../data/offline-documents.json';
import type { OfflineDocument } from './types';

const manifestUrl = import.meta.env.VITE_CCS_OFFLINE_DOCS_MANIFEST as string | undefined;

export async function loadDocumentCatalog(): Promise<OfflineDocument[]> {
	const localCatalog = normalizeDocuments(localDocuments as OfflineDocument[]);
	if (!navigator.onLine || !manifestUrl) return localCatalog;

	try {
		const response = await fetch(manifestUrl, { cache: 'no-store' });
		if (!response.ok) return localCatalog;
		const remoteCatalog = normalizeDocuments(await response.json() as OfflineDocument[]);
		return mergeCatalogs(localCatalog, remoteCatalog);
	} catch {
		return localCatalog;
	}
}

export function isSameOriginDocument(document: OfflineDocument): boolean {
	try {
		return new URL(document.url, window.location.href).origin === window.location.origin;
	} catch {
		return false;
	}
}

function normalizeDocuments(documents: OfflineDocument[]): OfflineDocument[] {
	return documents
		.filter((document) => document.id && document.title && document.url)
		.map((document) => ({ ...document, allowOffline: document.allowOffline !== false }));
}

function mergeCatalogs(localCatalog: OfflineDocument[], remoteCatalog: OfflineDocument[]): OfflineDocument[] {
	const merged = new Map(localCatalog.map((document) => [document.id, document]));
	for (const document of remoteCatalog) merged.set(document.id, { ...merged.get(document.id), ...document });
	return Array.from(merged.values());
}
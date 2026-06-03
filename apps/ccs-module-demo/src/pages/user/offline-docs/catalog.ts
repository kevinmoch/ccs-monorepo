import localDocuments from '../../../data/offline-documents.json';
import type { OfflineDocument } from './types';

const manifestUrl = import.meta.env.VITE_CCS_OFFLINE_DOCS_MANIFEST as string | undefined;
const documentsSiteUrl = normalizeSiteBaseUrl(import.meta.env.VITE_CCS_DOCS_BASE_URL as string | undefined);

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

export function isDocumentsSiteDocument(document: OfflineDocument): boolean {
	try {
		const source = new URL(document.url, documentsSiteUrl);
		const site = new URL(documentsSiteUrl);
		return source.origin === site.origin && source.pathname.startsWith(site.pathname);
	} catch {
		return false;
	}
}

function normalizeDocuments(documents: OfflineDocument[]): OfflineDocument[] {
	return documents
		.filter((document) => document.id && document.title && document.url)
		.map((document) => ({ ...document, url: normalizeDocumentUrl(document.url), allowOffline: document.allowOffline !== false }));
}

function normalizeDocumentUrl(url: string) {
	if (/^https?:\/\//i.test(url)) return normalizeAbsoluteDocumentUrl(url);
	return new URL(stripDocumentsPrefix(url), documentsSiteUrl).toString();
}

function normalizeAbsoluteDocumentUrl(url: string) {
	const configuredBaseUrl = import.meta.env.VITE_CCS_DOCS_BASE_URL as string | undefined;
	if (!configuredBaseUrl && !isAndroidNativeShell()) return url;

	try {
		const source = new URL(url);
		if (!configuredBaseUrl && source.port !== '8080') return url;
		return new URL(stripDocumentsPrefix(`${source.pathname}${source.search}`), documentsSiteUrl).toString();
	} catch {
		return url;
	}
}

function normalizeSiteBaseUrl(url: string | undefined) {
	try {
		const normalized = new URL(url || getDefaultDocumentsSiteUrl()).toString();
		return normalized.endsWith('/') ? normalized : `${normalized}/`;
	} catch {
		return 'http://127.0.0.1:8080/';
	}
}

function getDefaultDocumentsSiteUrl() {
	if (isAndroidNativeShell()) return 'http://10.0.2.2:8080/';
	if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
		return `${window.location.protocol}//${window.location.hostname}:8080/`;
	}
	return 'http://127.0.0.1:8080/';
}

function isAndroidNativeShell() {
	return /Android/i.test(navigator.userAgent)
		&& (window.location.protocol === 'https:' || window.location.protocol === 'capacitor:' || window.location.hostname === 'localhost');
}

function stripDocumentsPrefix(url: string) {
	return url.replace(/^\/?documents\//, '').replace(/^\//, '');
}

function mergeCatalogs(localCatalog: OfflineDocument[], remoteCatalog: OfflineDocument[]): OfflineDocument[] {
	const merged = new Map(localCatalog.map((document) => [document.id, document]));
	for (const document of remoteCatalog) merged.set(document.id, { ...merged.get(document.id), ...document });
	return Array.from(merged.values());
}
import { defineStore } from 'pinia';
import {
  createDocumentCatalog,
  isDocumentsSiteDocument,
  checkDocumentUpdate,
  downloadDocumentToOpfs,
  getAllMetadata,
  getStorageStats,
  isOpfsAvailable,
  openCachedDocument,
  openOnlineDocument,
  removeDocumentCache,
  removeManyDocumentCaches,
  writeCatalogSnapshot
} from '@ccs/shared/offline-docs';
import { formatBytes, normalizeError, deriveFileType, setOfflineDocsBaseUrl } from '@ccs/shared';
import type { CachedDocumentMeta, DocumentStatus, DownloadProgress, OfflineDocument, StorageStats } from '@ccs/shared/offline-docs';
import localDocuments from '../../../../documents/offline-documents.json';
import { i18n } from '../i18n/instance';

const t = (key: string, params?: Record<string, unknown>) => (params ? i18n.global.t(key, params) : i18n.global.t(key)) as string;

const APP_WATERMARK_RATIO = 0.86;

const catalog = createDocumentCatalog(localDocuments as OfflineDocument[], import.meta.env.VITE_CCS_OFFLINE_DOCS_MANIFEST as string | undefined);

// ---- 纯函数（无 store 依赖，getter / action 共用） ----

function isDocCacheMismatch(document: OfflineDocument, meta?: CachedDocumentMeta): boolean {
  const expectedBytes = meta?.serverSize ?? document.size;
  return Boolean(expectedBytes && meta?.status === 'offline' && meta.cachedBytes > 0 && meta.cachedBytes !== expectedBytes);
}

function getDocStatus(document: OfflineDocument, meta?: CachedDocumentMeta): DocumentStatus {
  if (!meta) return 'not-downloaded';
  if (meta.status === 'offline' && isDocCacheMismatch(document, meta)) return 'update-available';
  return meta.status;
}

export const useOfflineDocsStore = defineStore('offline-docs', {
  state: () => ({
    documents: [] as OfflineDocument[],
    metaMap: new Map<string, CachedDocumentMeta>(),
    progressMap: new Map<string, DownloadProgress>(),
    selectedId: '',
    checkedIds: [] as string[],
    isOnline: navigator.onLine,
    isLoading: true,
    isCheckingUpdates: false,
    pageMessage: '',
    autoLru: true,
    docsBaseUrl: 'https://192.168.43.232:8080/',
    stats: {
      usedBytes: 0,
      cachedBytes: 0,
      partialBytes: 0,
      metadataBytes: 0,
      opfsAvailable: isOpfsAvailable()
    } as StorageStats
  }),

  getters: {
    documentRows(state): Array<{
      document: OfflineDocument;
      meta?: CachedDocumentMeta;
      status: DocumentStatus;
      progress?: DownloadProgress;
    }> {
      return state.documents.map((document) => {
        const progress = state.progressMap.get(document.id);
        const meta = state.metaMap.get(document.id);
        const status: DocumentStatus = progress ? 'downloading' : getDocStatus(document, meta);
        return { document, meta, status, progress };
      });
    },

    cachedRows(): Array<{
      document: OfflineDocument;
      meta?: CachedDocumentMeta;
      status: DocumentStatus;
    }> {
      return this.documentRows.filter(({ meta }) => meta && (meta.cachedBytes > 0 || meta.partialBytes > 0));
    },

    totalSelectedBytes(state): number {
      return state.checkedIds.reduce((total, id) => {
        const meta = state.metaMap.get(id);
        return total + (meta?.cachedBytes ?? 0) + (meta?.partialBytes ?? 0);
      }, 0);
    },

    measuredQuotaBytes(state): number | undefined {
      const quota = state.stats.quotaBytes;
      return typeof quota === 'number' && Number.isFinite(quota) && quota > 0 ? quota : undefined;
    },

    storagePercent(): number {
      const used = this.stats.usageBytes ?? this.stats.usedBytes;
      const quota = this.measuredQuotaBytes;
      if (!quota || quota <= 0) return 0;
      return Math.min(100, Math.round((used / quota) * 1000) / 10);
    },

    pressureLabel(state): string {
      if (!state.stats.opfsAvailable) return t('offlineDocs.opfsUnavailable');
      if (!this.measuredQuotaBytes) return t('offlineDocs.spaceMonitoring');
      if (this.storagePercent >= 92) return t('offlineDocs.spaceTight');
      if (this.storagePercent >= APP_WATERMARK_RATIO * 100) return t('offlineDocs.spaceNearWatermark');
      return t('offlineDocs.spaceNormal');
    }
  },

  actions: {
    // ---- initialization ----

    async initialize() {
      this.isLoading = true;
      setOfflineDocsBaseUrl(this.docsBaseUrl);
      try {
        this.documents = await catalog.loadDocumentCatalog();
        if (isOpfsAvailable()) await writeCatalogSnapshot(this.documents);
        await this.refreshMetadata();
        this.selectedId = '';
      } catch (error) {
        this.pageMessage = String(error instanceof Error ? error.message : error);
      } finally {
        this.isLoading = false;
      }
    },

    async refreshMetadata() {
      if (!isOpfsAvailable()) {
        this.stats = await getStorageStats();
        return;
      }

      const metadata = await getAllMetadata();
      this.metaMap = new Map(metadata.map((meta) => [meta.id, meta]));
      const cachedBytes = metadata.reduce((t, m) => t + m.cachedBytes, 0);
      const partialBytes = metadata.reduce((t, m) => t + m.partialBytes, 0);
      this.stats = {
        opfsAvailable: true,
        storageKind: this.stats.storageKind,
        storageLabel: this.stats.storageLabel,
        quotaBytes: this.stats.quotaBytes,
        usageBytes: this.stats.usageBytes,
        persisted: this.stats.persisted,
        usedBytes: cachedBytes + partialBytes + 2048,
        cachedBytes,
        partialBytes,
        metadataBytes: 2048
      };
    },

    setDocsBaseUrl(url: string) {
      this.docsBaseUrl = url;
      setOfflineDocsBaseUrl(url);
    },

    setOnline(status: boolean) {
      this.isOnline = status;
    },

    // ---- document operations ----

    getDocumentStatus(document: OfflineDocument, meta?: CachedDocumentMeta): DocumentStatus {
      return getDocStatus(document, meta);
    },

    isCacheSizeMismatch(document: OfflineDocument, meta?: CachedDocumentMeta): boolean {
      return isDocCacheMismatch(document, meta);
    },

    async openOnline(document: OfflineDocument) {
      this.selectedId = document.id;
      this.pageMessage = '';

      try {
        if (!this.isOnline) {
          this.pageMessage = t('offlineDocs.offlineCantOpenOnline');
          return;
        }
        await openOnlineDocument(document);
      } catch (error) {
        this.pageMessage = normalizeError(error);
      }
    },

    async openOffline(document: OfflineDocument) {
      this.selectedId = document.id;
      this.pageMessage = '';

      try {
        const meta = this.metaMap.get(document.id);
        if (!meta || (meta.status !== 'offline' && meta.status !== 'update-available')) {
          this.pageMessage = t('offlineDocs.noCacheAvailable');
          return;
        }

        if (this.isCacheSizeMismatch(document, meta)) {
          this.pageMessage = t('offlineDocs.cacheMismatch');
          return;
        }

        await openCachedDocument(document);
        await this.refreshMetadata();
      } catch (error) {
        this.pageMessage = normalizeError(error);
      }
    },

    async cacheDocument(document: OfflineDocument, force = false) {
      if (this.progressMap.has(document.id)) return;
      this.pageMessage = '';

      try {
        this.setProgress(document.id, {
          id: document.id,
          receivedBytes: 0,
          totalBytes: document.size,
          percent: 0,
          resumable: false,
          message: t('offlineDocs.preparingDownload')
        });
        await this.clearLruIfNeeded(document);
        await downloadDocumentToOpfs(document, (progress) => this.setProgress(document.id, progress), { force });
        await this.refreshMetadata();
        this.pageMessage = force ? t('offlineDocs.cacheUpdated', { title: document.title }) : t('offlineDocs.cacheLocalDone', { title: document.title });
      } catch (error) {
        this.pageMessage = normalizeError(error);
        await this.refreshMetadata();
      } finally {
        this.deleteProgress(document.id);
      }
    },

    async checkUpdates() {
      if (!this.isOnline) {
        this.pageMessage = t('offlineDocs.offlineCantCheckUpdates');
        return;
      }

      this.isCheckingUpdates = true;
      try {
        for (const document of this.documents) {
          await checkDocumentUpdate(document);
        }
        await this.refreshMetadata();
        this.pageMessage = t('offlineDocs.updateCheckDone');
      } finally {
        this.isCheckingUpdates = false;
      }
    },

    // ---- cache management ----

    async clearOne(id: string) {
      await removeDocumentCache(id);
      this.checkedIds = this.checkedIds.filter((cid) => cid !== id);
      await this.refreshMetadata();
      if (this.selectedId === id) this.selectedId = '';
    },

    async clearSelected() {
      await removeManyDocumentCaches(this.checkedIds);
      const clearedSelected = this.checkedIds.includes(this.selectedId);
      this.checkedIds = [];
      await this.refreshMetadata();
      if (clearedSelected) this.selectedId = '';
    },

    async clearAll() {
      await removeManyDocumentCaches(this.cachedRows.map(({ document }) => document.id));
      this.checkedIds = [];
      await this.refreshMetadata();
      this.selectedId = '';
    },

    async clearOldestCache() {
      const oldest = this.cachedRows
        .map(({ document, meta }) => ({ document, meta }))
        .filter(
          (
            row
          ): row is {
            document: OfflineDocument;
            meta: CachedDocumentMeta;
          } => Boolean(row.meta)
        )
        .sort((left, right) => new Date(left.meta.lastAccessedAt ?? left.meta.downloadedAt ?? 0).getTime() - new Date(right.meta.lastAccessedAt ?? right.meta.downloadedAt ?? 0).getTime())[0];

      if (!oldest) return;
      await this.clearOne(oldest.document.id);
      this.pageMessage = t('offlineDocs.lruCleared', { title: oldest.document.title });
    },

    async clearLruIfNeeded(document: OfflineDocument) {
      if (!this.autoLru || !document.size) return;
      const currentStats = await getStorageStats();
      const quota = currentStats.quotaBytes;
      const usage = currentStats.usageBytes ?? currentStats.usedBytes;
      if (!quota || usage + document.size <= quota * APP_WATERMARK_RATIO) return;
      await this.clearOldestCache();
    },

    // ---- helpers ----

    setProgress(id: string, progress: DownloadProgress) {
      const next = new Map(this.progressMap);
      next.set(id, progress);
      this.progressMap = next;
    },

    deleteProgress(id: string) {
      const next = new Map(this.progressMap);
      next.delete(id);
      this.progressMap = next;
    },

    // derived helpers (non-reactive, callable from components)
    statusLabel(status: DocumentStatus): string {
      const labels: Record<DocumentStatus, string> = {
        'not-downloaded': t('offlineDocs.statusNotDownloaded'),
        downloading: t('offlineDocs.statusDownloading'),
        offline: t('offlineDocs.statusOffline'),
        'update-available': t('offlineDocs.statusUpdateAvailable'),
        failed: t('offlineDocs.statusFailed')
      };
      return labels[status];
    },

    typeLabel(type: string): string {
      const labels: Record<string, string> = {
        image: 'IMG',
        pdf: 'PDF',
        docx: 'DOCX',
        xlsx: 'XLSX',
        doc: 'DOC',
        xls: 'XLS'
      };
      return labels[type] ?? type.toUpperCase();
    },

    formatDate(value?: string): string {
      if (!value) return t('offlineDocs.notRecorded');
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return value;
      return new Intl.DateTimeFormat(i18n.global.locale.value as string, {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      }).format(date);
    }
  }
});

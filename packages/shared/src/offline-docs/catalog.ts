/**
 * 离线文档目录加载 —— 合并本地清单与远程清单。
 *
 * 使用方式：
 * ```ts
 * import { createDocumentCatalog } from '@ccs/shared/offline-docs';
 * import localDocuments from '/documents/offline-documents.json';
 *
 * const catalog = createDocumentCatalog(localDocuments);
 * const docs = await catalog.loadDocumentCatalog();
 * ```
 */

import type { OfflineDocument } from './types';

/**
 * 创建文档目录加载器。
 * @param localDocuments 本地文档清单（JSON 导入）
 * @param manifestUrl     远程清单 URL（由 VITE_CCS_OFFLINE_DOCS_MANIFEST 环境变量配置）
 */
export function createDocumentCatalog(localDocuments: OfflineDocument[], manifestUrl?: string) {
  /**
   * 加载文档目录（在线时合并远程清单）。
   */
  async function loadDocumentCatalog(): Promise<OfflineDocument[]> {
    if (!navigator.onLine || !manifestUrl) return localDocuments;

    try {
      const response = await fetch(manifestUrl, { cache: 'no-store' });
      if (!response.ok) return localDocuments;
      const remoteCatalog = (await response.json()) as OfflineDocument[];
      return mergeCatalogs(localDocuments, remoteCatalog);
    } catch {
      return localDocuments;
    }
  }

  return { loadDocumentCatalog };
}

/**
 * 判断是否为文档站点文档（相对路径），而非远程文档（绝对 URL）。
 */
export function isDocumentsSiteDocument(document: OfflineDocument): boolean {
  return !/^https?:\/\//i.test(document.url);
}

// ---------------------------------------------------------------------------
// 内部
// ---------------------------------------------------------------------------

function mergeCatalogs(localCatalog: OfflineDocument[], remoteCatalog: OfflineDocument[]): OfflineDocument[] {
  const merged = new Map(localCatalog.map((document) => [document.id, document]));
  for (const document of remoteCatalog) {
    merged.set(document.id, {
      ...merged.get(document.id),
      ...document
    });
  }
  return Array.from(merged.values());
}

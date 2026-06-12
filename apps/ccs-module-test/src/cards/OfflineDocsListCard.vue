<template>
  <CardShell>
    <div class="od-list-card">
      <!-- heading -->
      <div class="od-list-card__head">
        <span class="od-list-card__label">{{ __('docList') }}</span>
        <strong>{{ store.documents.length }} {{ __('documents') }}</strong>
      </div>

      <!-- empty / loading -->
      <div v-if="store.isLoading" class="od-list-card__empty">{{ __('loading') }}</div>

      <!-- document rows -->
      <div v-else class="od-list-card__rows">
        <article
          v-for="row in store.documentRows"
          :key="row.document.id"
          class="od-list-card__row"
          :class="{
            active: row.document.id === store.selectedId,
            ['status-' + row.status]: true
          }"
        >
          <div class="od-list-card__row-top">
            <label class="od-list-card__checkbox" :title="row.meta ? __('selectToClear') : __('noCache')">
              <input v-model="store.checkedIds" type="checkbox" :value="row.document.id" :disabled="!row.meta" />
            </label>

            <div class="od-list-card__doc">
              <span class="od-list-card__type-badge">
                {{ store.typeLabel(row.document.fileType ?? deriveFileType(row.document.mimeType)) }}
              </span>
              <strong>{{ row.document.title }}</strong>
            </div>

            <span class="od-list-card__status-badge">{{ __status(row.status) }}</span>
          </div>

          <p class="od-list-card__desc">{{ row.document.description }}</p>

          <div class="od-list-card__meta">
            <span>{{ __('updated') }} {{ store.formatDate(row.document.updatedAt ?? row.document.lastModified) }}</span>
            <span>{{ __('cached') }} {{ formatBytes((row.meta?.cachedBytes ?? 0) + (row.meta?.partialBytes ?? 0)) }}</span>
            <span>{{ isDocumentsSiteDocument(row.document) ? __('docSite') : __('remoteDoc') }}</span>
          </div>

          <!-- progress -->
          <div class="od-list-card__progress" :class="{ visible: row.progress }">
            <div class="od-list-card__progress-track">
              <span :style="{ width: `${row.progress?.percent ?? 0}%` }"></span>
            </div>
            <small v-if="row.progress">
              {{ row.progress.percent ?? 0 }}% · {{ formatBytes(row.progress.receivedBytes) }} / {{ row.progress.totalBytes ? formatBytes(row.progress.totalBytes) : '?' }} ·
              {{ row.progress.message ?? (row.progress.resumable ? __('resuming') : __('downloading')) }}
            </small>
          </div>

          <!-- actions -->
          <div class="od-list-card__actions">
            <button type="button" :disabled="!store.isOnline" @click="store.openOnline(row.document)">{{ __('viewOnline') }}</button>

            <button v-if="row.status === 'not-downloaded' || row.status === 'failed'" type="button" @click="store.cacheDocument(row.document)">{{ __('cacheLocal') }}</button>

            <button v-if="row.status === 'offline' || row.status === 'update-available'" type="button" @click="store.openOffline(row.document)">{{ __('viewOffline') }}</button>

            <button v-if="row.status === 'update-available'" type="button" @click="store.cacheDocument(row.document, true)">{{ __('updateCache') }}</button>

            <button v-if="row.status === 'offline' || row.status === 'update-available'" type="button" class="ghost" @click="store.clearOne(row.document.id)">{{ __('deleteCache') }}</button>
          </div>
        </article>
      </div>

      <!-- toast popover -->
      <div ref="toastRef" popover="manual" class="od-list-card__toast">{{ store.pageMessage }}</div>
    </div>
  </CardShell>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { CardShell } from '@ccs/ui-vue';
import { formatBytes, deriveFileType, isDocumentsSiteDocument } from '@ccs/shared';
import type { DocumentStatus } from '@ccs/shared/offline-docs';
import { useOfflineDocsStore } from '../stores/offline-docs';
import { createCardTranslator } from '../lib/card-i18n';

const msgs = {
  'zh-CN': {
    docList: '文档列表',
    documents: '个文档',
    loading: '正在加载文档清单',
    selectToClear: '选择清理缓存',
    noCache: '暂无缓存',
    updated: '更新',
    cached: '缓存',
    docSite: '文档站点',
    remoteDoc: '远程文档',
    resuming: '续传中',
    downloading: '下载中',
    viewOnline: '在线查看',
    cacheLocal: '缓存本地',
    viewOffline: '离线查看',
    updateCache: '更新缓存',
    deleteCache: '删除缓存',
    statusNotDownloaded: '未下载',
    statusDownloading: '下载中',
    statusOffline: '已离线',
    statusUpdateAvailable: '有更新',
    statusFailed: '中断'
  },
  'en-US': {
    docList: 'Document List',
    documents: 'docs',
    loading: 'Loading documents...',
    selectToClear: 'Select to clear cache',
    noCache: 'No cache',
    updated: 'Updated',
    cached: 'Cached',
    docSite: 'Doc Site',
    remoteDoc: 'Remote',
    resuming: 'Resuming',
    downloading: 'Downloading',
    viewOnline: 'View Online',
    cacheLocal: 'Cache Local',
    viewOffline: 'View Offline',
    updateCache: 'Update Cache',
    deleteCache: 'Delete Cache',
    statusNotDownloaded: 'Not Downloaded',
    statusDownloading: 'Downloading',
    statusOffline: 'Offline',
    statusUpdateAvailable: 'Update Available',
    statusFailed: 'Failed'
  }
} as const;
const __ = createCardTranslator(msgs);

const __status = (status: DocumentStatus): string => {
  const map: Record<DocumentStatus, string> = {
    'not-downloaded': __('statusNotDownloaded'),
    downloading: __('statusDownloading'),
    offline: __('statusOffline'),
    'update-available': __('statusUpdateAvailable'),
    failed: __('statusFailed')
  };
  return map[status] ?? status;
};

const store = useOfflineDocsStore();

// ---- toast popover ----
const toastRef = ref<HTMLElement | null>(null);
let toastTimer: ReturnType<typeof setTimeout> | undefined;

watch(
  () => store.pageMessage,
  async (msg) => {
    if (msg && toastRef.value) {
      clearTimeout(toastTimer);
      await nextTick();
      toastRef.value.showPopover();
      toastTimer = setTimeout(() => {
        toastRef.value?.hidePopover();
      }, 3000);
    }
  }
);

// ---- lifecycle ----
function handleNetworkChange() {
  store.setOnline(navigator.onLine);
}

onMounted(async () => {
  window.addEventListener('online', handleNetworkChange);
  window.addEventListener('offline', handleNetworkChange);
  if (store.documents.length === 0) await store.initialize();
});

onUnmounted(() => {
  window.removeEventListener('online', handleNetworkChange);
  window.removeEventListener('offline', handleNetworkChange);
});
</script>

<style scoped>
.od-list-card {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: hidden;
}

.od-list-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex: 0 0 auto;
}

.od-list-card__head strong {
  font-size: 18px;
  color: var(--ccs-text, #0f172a);
}

.od-list-card__label {
  font-size: 16px;
  font-weight: 800;
  text-transform: uppercase;
  color: var(--ccs-text-muted, color-mix(in srgb, var(--ccs-text, #0f172a) 50%, transparent));
}

.od-list-card__empty {
  display: grid;
  place-items: center;
  flex: 1;
  color: var(--ccs-text-muted, color-mix(in srgb, var(--ccs-text, #0f172a) 55%, transparent));
  font-weight: 800;
  font-size: 15px;
}

.od-list-card__rows {
  display: grid;
  gap: 8px;
  flex: 1;
  overflow-y: auto;
  align-content: start;
}

.od-list-card__row {
  display: grid;
  gap: 8px;
  padding: 10px;
  border: 1px solid color-mix(in srgb, var(--ccs-text, #0f172a) 8%, transparent);
  border-radius: 8px;
  background: var(--ccs-card-background, #fff);
}

.od-list-card__row.active {
  border-color: color-mix(in srgb, var(--ccs-primary, #2563eb) 40%, transparent);
  background: color-mix(in srgb, var(--ccs-primary, #2563eb) 4%, transparent);
}

.od-list-card__row.status-update-available {
  border-color: color-mix(in srgb, #f59e0b 40%, transparent);
}

.od-list-card__row-top {
  display: flex;
  align-items: center;
  gap: 8px;
}

.od-list-card__checkbox {
  flex: 0 0 auto;
  line-height: 1;
}

.od-list-card__doc {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.od-list-card__doc strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 16px;
  color: var(--ccs-text, #0f172a);
}

.od-list-card__type-badge {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 42px;
  height: 26px;
  padding: 0 8px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 900;
  background: color-mix(in srgb, var(--ccs-primary, #2563eb) 12%, transparent);
  color: var(--ccs-primary, #2563eb);
}

.od-list-card__status-badge {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 48px;
  height: 26px;
  padding: 0 8px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 900;
  background: color-mix(in srgb, var(--ccs-text, #0f172a) 8%, transparent);
  color: var(--ccs-text-muted, #475569);
}

.status-offline .od-list-card__status-badge {
  background: color-mix(in srgb, #16a34a 14%, transparent);
  color: #15803d;
}

.status-update-available .od-list-card__status-badge {
  background: color-mix(in srgb, #f59e0b 14%, transparent);
  color: #b45309;
}

.status-downloading .od-list-card__status-badge {
  background: color-mix(in srgb, var(--ccs-primary, #2563eb) 14%, transparent);
  color: var(--ccs-primary, #2563eb);
}

.status-failed .od-list-card__status-badge {
  background: color-mix(in srgb, #dc2626 14%, transparent);
  color: #b91c1c;
}

.od-list-card__desc {
  margin: 0;
  font-size: 14px;
  line-height: 1.4;
  color: var(--ccs-text-muted, color-mix(in srgb, var(--ccs-text, #0f172a) 55%, transparent));
}

.od-list-card__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 14px;
  color: var(--ccs-text-muted, color-mix(in srgb, var(--ccs-text, #0f172a) 55%, transparent));
}

.od-list-card__progress {
  display: grid;
  gap: 4px;
  height: 36px;
  overflow: hidden;
}

.od-list-card__progress:not(.visible) {
  visibility: hidden;
}

.od-list-card__progress-track {
  height: 6px;
  overflow: hidden;
  border-radius: 6px;
  background: color-mix(in srgb, var(--ccs-text, #0f172a) 10%, transparent);
}

.od-list-card__progress-track span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #0f766e, var(--ccs-primary, #2563eb));
}

.od-list-card__progress small {
  font-size: 12px;
  color: var(--ccs-text-muted, color-mix(in srgb, var(--ccs-text, #0f172a) 55%, transparent));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.od-list-card__actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  flex-wrap: wrap;
}

.od-list-card__actions button {
  height: 34px;
  padding: 0 12px;
  border: 0;
  border-radius: 6px;
  background: var(--ccs-primary, #2563eb);
  color: #fff;
  font-size: 13px;
  font-weight: 800;
  font-family: inherit;
  cursor: pointer;
  white-space: nowrap;
}

.od-list-card__actions button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.od-list-card__actions button.ghost {
  border: 1px solid color-mix(in srgb, var(--ccs-text, #0f172a) 12%, transparent);
  background: transparent;
  color: var(--ccs-text-muted, #475569);
}

/* toast */
.od-list-card__toast {
  margin: 0;
  padding: 10px 18px;
  border: 0;
  border-radius: 8px;
  background: var(--ccs-text, #1e293b);
  color: var(--ccs-card-background, #f1f5f9);
  font-weight: 700;
  font-size: 13px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);
  position: fixed;
  inset: auto;
  top: 16px;
  left: 50%;
  translate: -50% 0;
  animation: od-toast-in 0.25s ease-out;
}

.od-list-card__toast::backdrop {
  display: none;
}

@keyframes od-toast-in {
  from {
    opacity: 0;
    translate: -50% -12px;
  }
}

@media (max-width: 640px) {
  .od-list-card__row-top {
    flex-wrap: wrap;
  }
  .od-list-card__actions {
    justify-content: stretch;
  }
  .od-list-card__actions button {
    flex: 1 1 auto;
  }
}
</style>

<template>
  <CardShell>
    <div class="od-cache-card">
      <div class="od-cache-card__head">
        <span class="od-cache-card__label">{{ __('cacheMgmt') }}</span>
        <strong>{{ store.cachedRows.length }} {{ __('documents') }}</strong>
      </div>

      <div class="od-cache-card__bar">
        <span :style="{ width: `${store.storagePercent}%` }"></span>
      </div>

      <div class="od-cache-card__stats">
        <div>
          <span>{{ __('cachedFiles') }}</span>
          <strong>{{ formatBytes(store.stats.cachedBytes) }}</strong>
        </div>
        <div>
          <span>{{ __('partialFiles') }}</span>
          <strong>{{ formatBytes(store.stats.partialBytes) }}</strong>
        </div>
        <div>
          <span>{{ __('metadata') }}</span>
          <strong>{{ formatBytes(store.stats.metadataBytes) }}</strong>
        </div>
        <div>
          <span>{{ __('selected') }}</span>
          <strong>{{ formatBytes(store.totalSelectedBytes) }}</strong>
        </div>
      </div>

      <div class="od-cache-card__actions">
        <label class="od-cache-card__lru">
          <input v-model="store.autoLru" type="checkbox" />
          {{ __('lruHint') }}
        </label>
        <button type="button" class="od-cache-card__btn secondary" :disabled="!store.checkedIds.length" @click="store.clearSelected()">{{ __('clearSelected') }}</button>
        <button type="button" class="od-cache-card__btn secondary" :disabled="!store.cachedRows.length" @click="store.clearOldestCache()">{{ __('clearOldest') }}</button>
        <button type="button" class="od-cache-card__btn danger" :disabled="!store.cachedRows.length" @click="store.clearAll()">{{ __('clearAll') }}</button>
      </div>
    </div>
  </CardShell>
</template>

<script setup lang="ts">
import { CardShell } from '@ccs/ui-vue';
import { formatBytes } from '@ccs/shared';
import { useOfflineDocsStore } from '../stores/offline-docs';
import { createCardTranslator } from '../lib/card-i18n';

const msgs = {
  'zh-CN': {
    cacheMgmt: '缓存管理',
    documents: '个文档',
    cachedFiles: '缓存文件',
    partialFiles: '中断文件',
    metadata: '元数据',
    selected: '已选择',
    lruHint: '启用 LRU 整理',
    clearSelected: '清除所选',
    clearOldest: '清理最久未访问',
    clearAll: '全部清除'
  },
  'en-US': {
    cacheMgmt: 'Cache Management',
    documents: 'docs',
    cachedFiles: 'Cached',
    partialFiles: 'Partial',
    metadata: 'Metadata',
    selected: 'Selected',
    lruHint: 'Enable LRU',
    clearSelected: 'Clear Selected',
    clearOldest: 'Clear Oldest',
    clearAll: 'Clear All'
  }
} as const;
const __ = createCardTranslator(msgs);

const store = useOfflineDocsStore();
</script>

<style scoped>
.od-cache-card {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.od-cache-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.od-cache-card__head strong {
  font-size: 16px;
  color: var(--ccs-text, #0f172a);
}

.od-cache-card__label {
  font-size: 16px;
  font-weight: 800;
  text-transform: uppercase;
  color: var(--ccs-text-muted, color-mix(in srgb, var(--ccs-text, #0f172a) 50%, transparent));
}

.od-cache-card__bar {
  height: 8px;
  overflow: hidden;
  border-radius: 8px;
  background: color-mix(in srgb, var(--ccs-text, #0f172a) 10%, transparent);
}

.od-cache-card__bar span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #0f766e, var(--ccs-primary, #2563eb));
  transition: width 0.3s ease;
}

.od-cache-card__stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.od-cache-card__stats div {
  display: grid;
  gap: 4px;
  padding: 10px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--ccs-bg, #f8fafc) 92%, transparent);
}

.od-cache-card__stats span {
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  color: var(--ccs-text-muted, color-mix(in srgb, var(--ccs-text, #0f172a) 55%, transparent));
}

.od-cache-card__stats strong {
  font-size: 15px;
  color: var(--ccs-text, #0f172a);
}

.od-cache-card__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: auto;
  flex-wrap: wrap;
}

.od-cache-card__lru {
  margin-right: auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 800;
  color: var(--ccs-text-muted, color-mix(in srgb, var(--ccs-text, #0f172a) 55%, transparent));
  cursor: pointer;
}

.od-cache-card__btn {
  height: 34px;
  padding: 0 10px;
  border: 0;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 800;
  font-family: inherit;
  color: #fff;
  background: var(--ccs-primary, #2563eb);
  cursor: pointer;
  white-space: nowrap;
}

.od-cache-card__btn:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.od-cache-card__btn.secondary {
  border: 1px solid color-mix(in srgb, var(--ccs-primary, #2563eb) 22%, transparent);
  background: color-mix(in srgb, var(--ccs-primary, #2563eb) 8%, transparent);
  color: var(--ccs-primary, #2563eb);
}

.od-cache-card__btn.danger {
  background: #dc2626;
}

@media (max-width: 500px) {
  .od-cache-card__stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .od-cache-card__actions {
    flex-direction: column;
    align-items: stretch;
  }
  .od-cache-card__lru {
    margin-right: 0;
  }
}
</style>

<template>
  <CardShell>
    <div class="op-cache-card">
      <div class="op-cache-card__head">
        <span class="op-cache-card__label">{{ __('albumMgmt') }}</span>
        <strong>{{ store.photos.length }} {{ __('photos') }} · {{ __('selected') }} {{ store.checkedIds.length }}</strong>
      </div>

      <div class="op-cache-card__stats">
        <div>
          <span>{{ __('photoFiles') }}</span>
          <strong>{{ formatBytes(store.stats.photoBytes) }}</strong>
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

      <div class="op-cache-card__actions">
        <button type="button" class="op-cache-card__btn secondary" :disabled="!store.checkedIds.length" @click="store.removeSelected()">
          {{ __('deleteSelected') }}
        </button>
        <button type="button" class="op-cache-card__btn danger" :disabled="!store.photos.length" @click="store.removeAll()">
          {{ __('clearAll') }}
        </button>
      </div>
    </div>
  </CardShell>
</template>

<script setup lang="ts">
import { CardShell } from '@ccs/ui-vue';
import { formatBytes } from '@ccs/shared';
import { useOfflinePhotoStore } from '../stores/offline-photo';
import { createCardTranslator } from '../lib/card-i18n';

const msgs = {
  'zh-CN': {
    albumMgmt: '相册管理',
    photos: '张',
    selected: '已选',
    photoFiles: '照片文件',
    metadata: '元数据',
    deleteSelected: '删除所选',
    clearAll: '全部清除'
  },
  'en-US': {
    albumMgmt: 'Album Management',
    photos: '',
    selected: 'Selected',
    photoFiles: 'Photo Files',
    metadata: 'Metadata',
    deleteSelected: 'Delete Selected',
    clearAll: 'Clear All'
  }
} as const;
const __ = createCardTranslator(msgs);

const store = useOfflinePhotoStore();
</script>

<style scoped>
.op-cache-card {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.op-cache-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.op-cache-card__head strong {
  font-size: 18px;
  color: var(--ccs-text, #0f172a);
}

.op-cache-card__label {
  font-size: 18px;
  font-weight: 800;
  text-transform: uppercase;
  color: var(--ccs-text-muted, color-mix(in srgb, var(--ccs-text, #0f172a) 50%, transparent));
}

.op-cache-card__stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.op-cache-card__stats div {
  display: grid;
  gap: 4px;
  padding: 10px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--ccs-bg, #f8fafc) 92%, transparent);
}

.op-cache-card__stats span {
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  color: var(--ccs-text-muted, color-mix(in srgb, var(--ccs-text, #0f172a) 55%, transparent));
}

.op-cache-card__stats strong {
  font-size: 15px;
  color: var(--ccs-text, #0f172a);
}

.op-cache-card__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: auto;
}

.op-cache-card__btn {
  height: 34px;
  padding: 0 12px;
  border: 0;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 800;
  font-family: inherit;
  color: #fff;
  background: var(--ccs-primary, #2563eb);
  cursor: pointer;
}

.op-cache-card__btn:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
.op-cache-card__btn.secondary {
  border: 1px solid color-mix(in srgb, var(--ccs-primary, #2563eb) 22%, transparent);
  background: color-mix(in srgb, var(--ccs-primary, #2563eb) 8%, transparent);
  color: var(--ccs-primary, #2563eb);
}
.op-cache-card__btn.danger {
  background: #dc2626;
}

@media (max-width: 500px) {
  .op-cache-card__stats {
    grid-template-columns: 1fr;
  }
}
</style>

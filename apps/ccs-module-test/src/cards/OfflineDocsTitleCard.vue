<template>
  <CardShell>
    <div class="od-title-card">
      <div class="od-title-card__head">
        <p class="od-title-card__eyebrow">ccs-module-test</p>
        <div class="od-title-card__title-row">
          <h2 class="od-title-card__heading">{{ __('offlineDocs') }}</h2>
          <input class="od-title-card__url-input" :value="store.docsBaseUrl" type="text" placeholder="https://..." @change="store.setDocsBaseUrl(($event.target as HTMLInputElement).value)" />
        </div>
        <span class="od-title-card__status">
          {{ store.stats.storageLabel ?? 'Web OPFS' }} · {{ store.isOnline ? __('online') : __('offline') }} ·
          {{ store.pressureLabel }}
        </span>
      </div>

      <div class="od-title-card__metrics">
        <button type="button" class="od-title-card__update-btn" :disabled="store.isCheckingUpdates" @click="store.checkUpdates()">
          {{ store.isCheckingUpdates ? __('checking') : __('checkUpdates') }}
        </button>
        <div>
          <span>{{ __('usedSpace') }}</span>
          <strong>{{ formatBytes(store.stats.usageBytes ?? store.stats.usedBytes) }}</strong>
        </div>
        <div v-if="store.measuredQuotaBytes">
          <span>{{ __('quota') }}</span>
          <strong>{{ formatBytes(store.measuredQuotaBytes) }}</strong>
        </div>
        <div>
          <span>{{ __('offlineStorage') }}</span>
          <strong>{{ store.stats.opfsAvailable ? __('available') : __('unavailable') }}</strong>
        </div>
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
    offlineDocs: '离线文档',
    online: '在线',
    offline: '离线',
    checking: '检查中',
    checkUpdates: '检查更新',
    usedSpace: '已用空间',
    quota: '浏览器配额',
    offlineStorage: '离线存储',
    available: '可用',
    unavailable: '不可用'
  },
  'en-US': {
    offlineDocs: 'Offline Docs',
    online: 'Online',
    offline: 'Offline',
    checking: 'Checking',
    checkUpdates: 'Check Updates',
    usedSpace: 'Used Space',
    quota: 'Quota',
    offlineStorage: 'Offline Storage',
    available: 'Available',
    unavailable: 'Unavailable'
  }
} as const;
const __ = createCardTranslator(msgs);

const store = useOfflineDocsStore();
</script>

<style scoped>
.od-title-card {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.od-title-card__head {
  display: grid;
  gap: 4px;
}

.od-title-card__eyebrow {
  margin: 0;
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--ccs-text-muted, color-mix(in srgb, var(--ccs-text, #0f172a) 50%, transparent));
}

.od-title-card__title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.od-title-card__heading {
  margin: 0;
  font-size: clamp(18px, 3vw, 26px);
  font-weight: 900;
  line-height: 1;
  color: var(--ccs-text, #0f172a);
}

.od-title-card__url-input {
  width: 180px;
  height: 30px;
  padding: 0 8px;
  border: 1px solid color-mix(in srgb, var(--ccs-text, #0f172a) 15%, transparent);
  border-radius: 6px;
  font-size: 12px;
  color: var(--ccs-text, #0f172a);
  background: var(--ccs-card-background, #fff);
  outline: none;
}

.od-title-card__url-input:focus {
  border-color: var(--ccs-primary, #2563eb);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--ccs-primary, #2563eb) 15%, transparent);
}

.od-title-card__status {
  font-size: 12px;
  color: var(--ccs-text-muted, color-mix(in srgb, var(--ccs-text, #0f172a) 55%, transparent));
}

.od-title-card__metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  margin-top: auto;
}

.od-title-card__metrics div {
  display: grid;
  gap: 4px;
  padding: 10px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--ccs-bg, #f8fafc) 92%, transparent);
}

.od-title-card__metrics span {
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  color: var(--ccs-text-muted, color-mix(in srgb, var(--ccs-text, #0f172a) 55%, transparent));
}

.od-title-card__metrics strong {
  font-size: 15px;
  color: var(--ccs-text, #0f172a);
}

.od-title-card__update-btn {
  align-self: stretch;
  height: auto;
  min-height: 48px;
  padding: 0 10px;
  border: 1px solid color-mix(in srgb, var(--ccs-primary, #2563eb) 22%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--ccs-primary, #2563eb) 8%, transparent);
  color: var(--ccs-primary, #2563eb);
  font-size: 13px;
  font-weight: 800;
  font-family: inherit;
  cursor: pointer;
  box-shadow: 0 6px 16px color-mix(in srgb, var(--ccs-primary, #2563eb) 10%, transparent);
}

.od-title-card__update-btn:disabled {
  cursor: wait;
  opacity: 0.6;
}

@media (max-width: 640px) {
  .od-title-card__metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .od-title-card__url-input {
    width: 140px;
  }
}
</style>

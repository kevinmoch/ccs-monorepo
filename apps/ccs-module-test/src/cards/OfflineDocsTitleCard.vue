<template>
  <CardShell>
    <div class="od-title-card">
      <div class="od-title-card__main-row">
        <div class="od-title-card__title-area">
          <h2 class="od-title-card__heading">{{ t('offlineDocs') }}</h2>
          <span class="od-title-card__status">
            {{ t(store.stats.storageLabel ?? '') }} · {{ store.isOnline ? t('online') : t('offline') }} ·
            {{ store.pressureLabel }}
          </span>
          <input class="od-title-card__url-input" :value="store.docsBaseUrl" type="text" placeholder="https://..." @change="store.setDocsBaseUrl(($event.target as HTMLInputElement).value)" />
        </div>

        <div class="od-title-card__metrics">
          <div>
            <span>{{ t('usedSpace') }}</span>
            <strong>{{ formatBytes(store.stats.usageBytes ?? store.stats.usedBytes) }}</strong>
          </div>
          <div v-if="store.measuredQuotaBytes">
            <span>{{ t('quota') }}</span>
            <strong>{{ formatBytes(store.measuredQuotaBytes) }}</strong>
          </div>
          <div>
            <span>{{ t('offlineStorage') }}</span>
            <strong>{{ store.stats.opfsAvailable ? t('available') : t('unavailable') }}</strong>
          </div>
        </div>
      </div>
    </div>
  </CardShell>
</template>

<script setup lang="ts">
import { CardShell } from '@ccs/card';
import { formatBytes } from '@ccs/shared';
import { useOfflineDocsStore } from '../stores/offline-docs';
import { useScopedT } from '@ccs/shared';

const t = useScopedT('offlineDocs');

const store = useOfflineDocsStore();
</script>

<style scoped>
.od-title-card {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
  justify-content: center;
}

.od-title-card__eyebrow {
  margin: 0;
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--ccs-text-muted, color-mix(in srgb, var(--ccs-text, #0f172a) 50%, transparent));
}

.od-title-card__main-row {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  flex-wrap: wrap;
}

.od-title-card__title-area {
  display: grid;
  gap: 6px;
  flex: 1 1 200px;
  min-width: 0;
}

.od-title-card__heading {
  margin: 0;
  font-size: clamp(20px, 3vw, 20px);
  font-weight: 900;
  line-height: 1;
  color: var(--ccs-text, #0f172a);
}

.od-title-card__status {
  font-size: 12px;
  color: var(--ccs-text-muted, color-mix(in srgb, var(--ccs-text, #0f172a) 55%, transparent));
}

.od-title-card__url-input {
  width: 200px;
  height: 28px;
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

.od-title-card__metrics {
  display: grid;
  grid-template-columns: repeat(2, minmax(90px, 1fr));
  gap: 8px;
  flex: 0 0 auto;
  margin-left: auto;
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

@media (max-width: 640px) {
  .od-title-card__title-area {
    flex: 1 1 100%;
  }
  .od-title-card__metrics {
    margin-left: 0;
    flex: 1 1 100%;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .od-title-card__url-input {
    width: 140px;
  }
}
</style>

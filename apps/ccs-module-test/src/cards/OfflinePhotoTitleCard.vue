<template>
  <CardShell>
    <div class="op-title-card">
      <div class="op-title-card__main-row">
        <div class="op-title-card__title-area">
          <h2 class="op-title-card__heading">{{ t('offlinePhoto') }}</h2>
          <span class="op-title-card__status"> {{ t(store.stats.storageLabel) }} · {{ t('total') }} {{ store.stats.count }} {{ t('photos') }} </span>
          <span class="op-title-card__pill">{{ runtimeLabel }}</span>
        </div>

        <div class="op-title-card__metrics">
          <div>
            <span>{{ t('usedSpace') }}</span>
            <strong>{{ formatBytes(store.stats.usedBytes) }}</strong>
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
import { computed } from 'vue';
import { CardShell } from '@ccs/ui-vue';
import { formatBytes, useRuntimeOptions, type RuntimeInfo } from '@ccs/shared';
import { useOfflinePhotoStore } from '../stores/offline-photo';
import { useScopedT } from '@ccs/shared';

const t = useScopedT('offlinePhoto');

const store = useOfflinePhotoStore();

const runtimeOptions = useRuntimeOptions();

const runtimeLabel = computed(() => {
  const option = runtimeOptions.value.find((o: RuntimeInfo) => o.kind === store.runtime.kind);
  return option?.label ?? '';
});
</script>

<style scoped>
.op-title-card {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
  justify-content: center;
}

.op-title-card__main-row {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  flex-wrap: wrap;
}

.op-title-card__title-area {
  display: grid;
  gap: 6px;
  flex: 1 1 140px;
  min-width: 0;
}

.op-title-card__heading {
  margin: 0;
  font-size: clamp(20px, 3vw, 20px);
  font-weight: 900;
  line-height: 1;
  color: var(--ccs-text, #0f172a);
}

.op-title-card__pill {
  flex: 0 0 auto;
  padding: 6px 12px;
  border: 1px solid color-mix(in srgb, var(--ccs-primary, #2563eb) 30%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--ccs-primary, #2563eb) 10%, transparent);
  color: var(--ccs-primary, #2563eb);
  font-size: 14px;
  font-weight: 800;
  white-space: nowrap;
  max-width: 120px;
}

.op-title-card__status {
  font-size: 12px;
  color: var(--ccs-text-muted, color-mix(in srgb, var(--ccs-text, #0f172a) 55%, transparent));
}

.op-title-card__metrics {
  display: grid;
  grid-template-columns: repeat(2, minmax(90px, 1fr));
  gap: 8px;
  flex: 0 0 auto;
  margin-left: auto;
}

.op-title-card__pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 6px 10px;
  border: 1px solid color-mix(in srgb, var(--ccs-primary, #2563eb) 22%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--ccs-primary, #2563eb) 8%, transparent);
  color: var(--ccs-primary, #2563eb);
  font-size: 12px;
  font-weight: 800;
  white-space: nowrap;
  box-shadow: 0 6px 16px color-mix(in srgb, var(--ccs-primary, #2563eb) 10%, transparent);
}

.op-title-card__metrics div:not(.op-title-card__pill) {
  display: grid;
  gap: 4px;
  padding: 8px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--ccs-bg, #f8fafc) 92%, transparent);
}

.op-title-card__metrics span {
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  color: var(--ccs-text-muted, color-mix(in srgb, var(--ccs-text, #0f172a) 55%, transparent));
}

.op-title-card__metrics strong {
  font-size: 15px;
  color: var(--ccs-text, #0f172a);
}

@media (max-width: 640px) {
  .op-title-card__title-area {
    flex: 1 1 100%;
  }
  .op-title-card__metrics {
    margin-left: 0;
    flex: 1 1 100%;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>

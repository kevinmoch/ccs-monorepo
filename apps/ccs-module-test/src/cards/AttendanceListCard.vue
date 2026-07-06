<template>
  <CardShell>
    <div class="list-card">
      <div v-for="option in runtimeOptions" :key="option.kind" class="list-card__item" :class="{ active: option.kind === store.runtime.kind }">
        <span class="list-card__label">{{ option.label }}</span>
        <strong class="list-card__strategy">{{ option.strategy }}</strong>
        <small class="list-card__accuracy">{{ option.accuracy }}</small>
      </div>
    </div>
  </CardShell>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { CardShell } from '@ccs/card';
import { useRuntimeOptions } from '@ccs/shared';
import { useAttendanceStore } from '../stores/attendance';

const store = useAttendanceStore();
const _opts = useRuntimeOptions();
const runtimeOptions = computed(() => _opts.value);
</script>

<style scoped>
.list-card {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0;
  overflow: hidden;
}

.list-card__item {
  display: grid;
  gap: 6px;
  align-content: start;
  min-height: 100px;
  padding: 14px;
  background: transparent;
  border-right: 1px solid var(--ccs-border-color, #cbd5e1);
}

.list-card__item:last-child {
  border-right: 0;
}

.list-card__item.active {
  background: color-mix(in srgb, gray 6%, transparent);
}

.list-card__label {
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.list-card__strategy {
  font-size: 13px;
  line-height: 1.4;
  color: var(--ccs-text, #0f172a);
}

.list-card__accuracy {
  font-size: 11px;
  color: var(--ccs-text-muted, color-mix(in srgb, var(--ccs-text, #0f172a) 55%, transparent));
}

@media (max-width: 768px) {
  .list-card {
    grid-template-columns: 1fr;
  }
  .list-card__item {
    border-right: 0;
    border-bottom: 1px solid var(--ccs-border-color, #cbd5e1);
  }
  .list-card__item:last-child {
    border-bottom: 0;
  }
  .list-card__item {
    min-height: 0;
    padding: 12px 14px;
  }
}
</style>

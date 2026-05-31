<template>
  <div class="ccs-card-grid">
    <div v-for="(card, index) in resolvedCards" :key="`${card.type}-${index}`" class="ccs-card-grid__item" :style="layoutStyle(card)">
      <component v-if="registry[card.type]" :is="registry[card.type]" :title="card.title" v-bind="card.props" />
      <div v-else class="ccs-card-grid__missing">{{ card.type }}</div>
    </div>
  </div>
</template>
<script setup lang="ts">
import { computed, getCurrentInstance } from 'vue';
import type { CSSProperties } from 'vue';
import type { CardDefinition, CardRegistry, LocalizedText } from '../index';

const props = defineProps<{ cards: CardDefinition[]; registry: CardRegistry }>();
const instance = getCurrentInstance();
const locale = computed(() => {
  const currentLocale = (instance?.proxy as any)?.$i18n?.locale;
  return typeof currentLocale === 'object' && currentLocale && 'value' in currentLocale ? currentLocale.value : currentLocale;
});

function isLocalizedText(value: unknown): value is Exclude<LocalizedText, string> {
  return Boolean(value && typeof value === 'object' && ('zh-CN' in value || 'en-US' in value));
}

function resolveValue(value: unknown): unknown {
  if (isLocalizedText(value)) return value[locale.value as 'zh-CN' | 'en-US'] ?? value['zh-CN'] ?? value['en-US'] ?? '';
  if (Array.isArray(value)) return value.map(resolveValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, resolveValue(entry)]));
  }
  return value;
}

const resolvedCards = computed(() => props.cards.map((card) => ({
  ...card,
  title: resolveValue(card.title) as string | undefined,
  props: resolveValue(card.props ?? {}) as Record<string, unknown>
})));

function clampSpan(value: number | undefined, fallback: number) {
  if (!value || !Number.isFinite(value)) return fallback;
  return Math.min(12, Math.max(1, Math.floor(value)));
}

function layoutStyle(card: CardDefinition): CSSProperties {
  const layout = card.layout ?? {};
  const colSpan = layout.colSpan ?? card.colSpan ?? {};
  const rowSpan = layout.rowSpan ?? card.rowSpan;
  return {
    '--ccs-col-base': String(clampSpan(colSpan.base, 12)),
    '--ccs-col-md': String(clampSpan(colSpan.md, colSpan.base ?? 4)),
    '--ccs-row-base': String(clampSpan(rowSpan, 1)),
    '--ccs-row-md': String(clampSpan(rowSpan, 1))
  } as CSSProperties;
}
</script>
<style scoped>
.ccs-card-grid {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  grid-auto-rows: minmax(64px, auto);
  align-items: stretch;
  gap: 16px;
}
.ccs-card-grid__item {
  min-width: 0;
  grid-column: span var(--ccs-col-base) / span var(--ccs-col-base);
  grid-row: span var(--ccs-row-base) / span var(--ccs-row-base);
}
.ccs-card-grid__item > :deep(*) {
  height: 100%;
}
.ccs-card-grid__missing {
  min-height: 120px;
  display: grid;
  place-items: center;
  border: 1px dashed color-mix(in srgb, var(--ccs-text, #0f172a) 24%, transparent);
  border-radius: 16px;
  color: color-mix(in srgb, var(--ccs-text, #0f172a) 62%, transparent);
}
@media (min-width: 768px) {
  .ccs-card-grid {
    gap: 24px;
  }
  .ccs-card-grid__item {
    grid-column: span var(--ccs-col-md) / span var(--ccs-col-md);
    grid-row: span var(--ccs-row-md) / span var(--ccs-row-md);
  }
}
</style>

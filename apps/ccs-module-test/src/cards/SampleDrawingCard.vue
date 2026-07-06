<template>
  <CardShell>
    <div class="drawing-card">
      <div v-if="isUrgent" class="drawing-card__urgent-badge">紧急</div>

      <div class="drawing-card__top">
        <div class="drawing-card__icon" :class="{ 'drawing-card__icon--urgent': isUrgent }">
          <span v-if="isUrgent">⚠</span>
          <span v-else>📐</span>
        </div>
        <span class="drawing-card__id">{{ drawingId }}</span>
      </div>

      <h3 class="drawing-card__title">{{ title }}</h3>
      <span class="drawing-card__discipline">{{ discipline }}</span>

      <div class="drawing-card__footer">
        <div class="drawing-card__submitter">
          <div class="drawing-card__avatar">{{ submitterInitials }}</div>
          <span>{{ submitter }}</span>
        </div>
        <div class="drawing-card__due" :class="{ 'drawing-card__due--urgent': isUrgent }">
          <span>🕐</span>
          {{ dueDate }}
        </div>
      </div>
    </div>
  </CardShell>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { CardShell } from '@ccs/card';

const props = defineProps<{
  drawingId?: string;
  title?: string;
  discipline?: string;
  submitter?: string;
  dueDate?: string;
  isUrgent?: boolean;
}>();

const submitterInitials = computed(() => {
  if (!props.submitter) return '?';
  return props.submitter.slice(0, 1);
});
</script>

<style scoped>
.drawing-card {
  height: 100%;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
}

.drawing-card__urgent-badge {
  position: absolute;
  top: 0;
  right: 0;
  padding: 4px 12px;
  background: #dc2626;
  color: #fff;
  font-size: 9px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  border-bottom-left-radius: 12px;
}

.drawing-card__top {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.drawing-card__icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--ccs-text, #0f172a) 8%, transparent);
  font-size: 14px;
}

.drawing-card__icon--urgent {
  background: #fef2f2;
  color: #dc2626;
}

.drawing-card__id {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: color-mix(in srgb, var(--ccs-text, #0f172a) 42%, transparent);
}

.drawing-card__title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  line-height: 1.35;
  color: var(--ccs-text, #0f172a);
  transition: color 0.2s;
}

.drawing-card:hover .drawing-card__title {
  color: #006fd6;
}

.drawing-card__discipline {
  display: inline-block;
  margin-top: 8px;
  padding: 3px 8px;
  background: color-mix(in srgb, var(--ccs-text, #0f172a) 6%, transparent);
  border-radius: 4px;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: color-mix(in srgb, var(--ccs-text, #0f172a) 54%, transparent);
  align-self: flex-start;
}

.drawing-card__footer {
  margin-top: auto;
  padding-top: 16px;
  border-top: 1px solid var(--ccs-border-color, #cbd5e1);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.drawing-card__submitter {
  display: flex;
  align-items: center;
  gap: 6px;
  overflow: hidden;
}

.drawing-card__avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #dbeafe;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 8px;
  font-weight: 900;
  color: #006fd6;
  border: 1px solid #bfdbfe;
  flex-shrink: 0;
}

.drawing-card__submitter span {
  font-size: 12px;
  font-weight: 500;
  color: color-mix(in srgb, var(--ccs-text, #0f172a) 62%, transparent);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.drawing-card__due {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 700;
  color: color-mix(in srgb, var(--ccs-text, #0f172a) 54%, transparent);
}

.drawing-card__due--urgent {
  color: #dc2626;
}
</style>

<template>
  <CardShell>
    <div class="stat-card" :class="`stat-card--${color}`">
      <span class="stat-card__label">{{ label }}</span>
      <div class="stat-card__value">{{ value }}</div>
      <div class="stat-card__bar"></div>
    </div>
  </CardShell>
</template>

<script setup lang="ts">
import { CardShell } from '@ccs/card';

defineProps<{
  label?: string;
  value?: string;
  color?: 'blue' | 'red' | 'green';
}>();
</script>

<style scoped>
.stat-card {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  transition: transform 0.2s;
}

.stat-card:hover {
  transform: scale(1.02);
}

.stat-card__label {
  font-size: 10px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.2em;
  color: color-mix(in srgb, var(--ccs-text, #0f172a) 42%, transparent);
  margin-bottom: 4px;
}

.stat-card__value {
  font-size: 36px;
  font-weight: 900;
  font-variant-numeric: tabular-nums;
  transition: color 0.2s;
}

.stat-card__bar {
  width: 32px;
  height: 4px;
  border-radius: 999px;
  margin-top: 12px;
  opacity: 0;
  transition: opacity 0.2s;
}

.stat-card:hover .stat-card__bar {
  opacity: 1;
}

/* Color variants */
.stat-card--blue .stat-card__value {
  color: #006fd6;
}
.stat-card--blue .stat-card__bar {
  background: #006fd6;
}

.stat-card--red .stat-card__value {
  color: #dc2626;
}
.stat-card--red .stat-card__bar {
  background: #dc2626;
}

.stat-card--green .stat-card__value {
  color: #059669;
}
.stat-card--green .stat-card__bar {
  background: #059669;
}
</style>

<template>
  <CcsCardShell :title="title">
    <div class="metric-card">
      <span>{{ label }}</span>
      <strong>{{ value }}</strong>
      <small>{{ trend }}</small>
    </div>
  </CcsCardShell>
</template>
<script setup lang="ts">
import { CcsCardShell } from '@ccs/ui-vue';

withDefaults(defineProps<{ title?: string; label?: string; value?: string | number; trend?: string }>(), {
  title: 'User Stat',
  label: 'Metric',
  value: '--',
  trend: ''
});
</script>

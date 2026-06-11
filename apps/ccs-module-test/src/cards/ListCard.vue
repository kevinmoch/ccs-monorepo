<template>
  <CcsCardShell :title="title">
    <div class="metric-card">
      <span>{{ label }}</span>
    </div>
  </CcsCardShell>
</template>

<script setup lang="ts">
import { CcsCardShell } from '@ccs/ui-vue';

withDefaults(defineProps<{ title?: string; label?: string }>(), {
  title: 'List',
  label: 'list'
});
</script>

<template>
  <CcsCardShell :title="$t('userStat')"
    ><div class="metric-value">{{ total.toLocaleString() }}</div>
    <p class="metric-up">+{{ growth }}% MoM</p></CcsCardShell
  >
</template>
<script setup lang="ts">
import { CcsCardShell } from '@ccs/ui-vue';
withDefaults(defineProps<{ total?: number; growth?: number }>(), { total: 0, growth: 0 });
</script>

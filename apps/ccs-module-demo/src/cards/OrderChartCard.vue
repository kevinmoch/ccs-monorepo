<template>
  <CcsCardShell :title="$t('orderChart')"
    ><div class="bars" aria-label="order chart"><span v-for="value in values" :key="value" :style="{ height: `${value}%` }" /></div>
    <p class="metric-up">{{ total }} orders · +{{ growth }}%</p></CcsCardShell
  >
</template>
<script setup lang="ts">
import { CcsCardShell } from '@ccs/ui-vue';
withDefaults(defineProps<{ total?: number; growth?: number }>(), { total: 0, growth: 0 });
const values = [42, 66, 58, 72, 88, 63, 96];
</script>

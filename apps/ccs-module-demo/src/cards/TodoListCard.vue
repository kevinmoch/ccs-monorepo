<template>
  <CcsCardShell :title="$t('todoList')"
    ><ul class="todo-list">
      <li>Review module manifest</li>
      <li>Sync theme tokens</li>
      <li>Publish card bundle</li>
    </ul>
    <p class="metric-up">{{ count }} open items</p></CcsCardShell
  >
</template>
<script setup lang="ts">
import { CcsCardShell } from '@ccs/ui-vue';
withDefaults(defineProps<{ count?: number }>(), { count: 0 });
</script>

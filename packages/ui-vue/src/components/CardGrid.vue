<template>
  <div class="ccs-card-grid"><component v-for="card in cards" :is="registry[card.type]" :key="card.type" v-bind="card.props" /></div>
</template>
<script setup lang="ts">
import type { CardDefinition, CardRegistry } from '../index';
defineProps<{ cards: CardDefinition[]; registry: CardRegistry }>();
</script>
<style scoped>
.ccs-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 18px;
}
</style>

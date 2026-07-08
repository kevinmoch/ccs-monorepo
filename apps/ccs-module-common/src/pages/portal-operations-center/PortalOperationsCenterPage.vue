<template>
  <CardGrid :cards="cards" :registry="cardRegistry" />
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { CardGrid, type CardDefinition } from '@ccs/card';
import { globalStore } from '@ccs/shared';
import { cardRegistry } from '../../cards';
import pageConfig from './config';

const cards = ref<CardDefinition[]>([...pageConfig.cards]);

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('globalStore.get timeout')), ms))]);
}

onMounted(async () => {
  let menuData: unknown = null;
  try {
    menuData = await withTimeout(globalStore.get('menuData'), 5000);
  } catch (err) {
    console.error('Failed to fetch shell menu data', err);
  }
  cards.value = pageConfig.cards.map((card: CardDefinition) => (card.id === 'portal-operations-center' ? { ...card, props: { ...card.props, menuData } } : card));
});
</script>

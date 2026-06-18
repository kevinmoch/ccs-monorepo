<template>
  <CardGrid :cards="cards" :registry="cardRegistry" />
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { CardGrid, type CardDefinition } from '@ccs/ui-vue';
import { cardRegistry } from '../../cards';
import pageConfig from './config';
import { globalStore } from '@ccs/shared';

const cards = ref<CardDefinition[]>([...pageConfig.cards]);

onMounted(async () => {
  try {
    const project = await globalStore.get('project');
    const updatedCards = pageConfig.cards.map((c: CardDefinition) => {
      if (c.type === 'attendance-title') {
        return {
          ...c,
          props: { ...c.props, project }
        };
      }
      return c;
    });
    cards.value = updatedCards;
  } catch (err) {
    console.error('Failed to fetch project info from framework', err);
  }
});
</script>

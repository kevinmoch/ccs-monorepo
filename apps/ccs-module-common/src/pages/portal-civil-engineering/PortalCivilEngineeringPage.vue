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

// 从宿主框架(ccs-framework)拉取 menu1~menu7 数据，传递给卡片，避免在本模块内重复维护菜单数据。
// 若模块未运行在宿主 iframe 内（如独立预览），globalStore.get 永远不会收到响应，这里加超时兜底，
// 保证卡片能结束"加载中"状态、展示空数据提示，而不是无限等待。
onMounted(async () => {
  let menuData: unknown = null;
  try {
    menuData = await withTimeout(globalStore.get('menuData'), 5000);
  } catch (err) {
    console.error('Failed to fetch shell menu data', err);
  }
  cards.value = pageConfig.cards.map((card: CardDefinition) => (card.id === 'portal-civil-engineering' ? { ...card, props: { ...card.props, menuData } } : card));
});
</script>

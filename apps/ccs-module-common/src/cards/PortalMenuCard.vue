<template>
  <CardShell class="portal-shell">
    <div class="portal-root">
      <!-- 顶部工具分组（seperateLine 右侧项） -->
      <div class="portal-tools-row" v-if="toolGroups.length > 0">
        <section v-for="group in toolGroups" :key="group.id" class="portal-tool-card ccs-card-surface">
          <header class="portal-tool-card__header" :title="pickTitle(group, language)">{{ pickTitle(group, language) }}</header>
          <div class="portal-tool-card__body">
            <a v-for="leaf in group.children ?? []" :key="leaf.id" href="#" class="portal-tool-link" @click.prevent="handleNavigate(leaf)">
              <span class="portal-tool-link__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <path d="M14 2v6h6" />
                </svg>
              </span>
              <span class="portal-tool-link__text" :title="pickTitle(leaf, language)">{{ pickTitle(leaf, language) }}</span>
            </a>
          </div>
        </section>
      </div>

      <!-- 主区域：L2 分组作为 category 卡片 -->
      <div class="portal-main">
        <h2 class="portal-title" :title="rootNode ? pickTitle(rootNode, language) : ''">{{ rootNode ? pickTitle(rootNode, language) : '' }}</h2>

        <p v-if="!loading && categories.length === 0" class="portal-empty">N/A</p>

        <div class="portal-category-grid" v-if="categories.length > 0">
          <section
            v-for="category in categories"
            :key="category.id"
            class="portal-category-card ccs-card-surface"
            :class="{ 'portal-category-card--wide': (category.children ?? []).length > MENU_ITEM_WRAP_COUNT }"
          >
            <header class="portal-category-card__header" :title="pickTitle(category, language)">{{ pickTitle(category, language) }}</header>
            <div class="portal-category-card__body" :class="{ 'portal-category-card__body--cols': (category.children ?? []).length > MENU_ITEM_WRAP_COUNT }">
              <a v-for="leaf in category.children ?? []" :key="leaf.id" href="#" class="portal-category-link" :title="pickTitle(leaf, language)" @click.prevent="handleNavigate(leaf)">
                {{ pickTitle(leaf, language) }}
              </a>
            </div>
          </section>
        </div>
      </div>
    </div>
  </CardShell>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { CardShell } from '@ccs/card';
import { useRuntimeStore } from '../stores/runtime';
import { findMenuNode, pickTitle, splitBySeperateLine, handleNavigate, type ShellMenuNode, MENU_ITEM_WRAP_COUNT } from '../lib/shell-menu';

const props = defineProps<{
  menuData?: ShellMenuNode[] | null;
  rootId: string;
}>();

const runtime = useRuntimeStore();
const language = computed(() => runtime.language);
const loading = computed(() => props.menuData === undefined);

const rootNode = computed(() => findMenuNode(props.menuData ?? [], props.rootId));
const split = computed(() => splitBySeperateLine(rootNode.value?.children ?? [], rootNode.value?.seperateLine));
const categories = computed(() => split.value.leftItems);
const toolGroups = computed(() => split.value.rightItems);
</script>

<style src="../lib/shell-menu.css" scoped></style>

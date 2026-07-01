<template>
  <CardShell class="portal-shell">
    <div class="portal-root">
      <!-- 顶部工具分组：标准文件 / 资料库 / 汇报决策 / 辅助设计 -->
      <div class="portal-tools-row">
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

      <!-- 建筑专业主区域 -->
      <div class="portal-main">
        <h2 class="portal-title" :title="architectureRoot ? pickTitle(architectureRoot, language) : ''">{{ architectureRoot ? pickTitle(architectureRoot, language) : '' }}</h2>

        <p v-if="!loading && categories.length === 0" class="portal-empty">N/A</p>

        <div class="portal-category-grid">
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

/**
 * menuData：由 pages/portal-architecture/PortalArchitecturePage.vue 在挂载时通过
 * globalStore.get('menuData') 从宿主框架(ccs-framework)拉取的 menu1~menu7 全量数据。
 * 卡片通过 findMenuNode 定位到 L2-6（建筑专业）节点进行渲染。
 */
const props = defineProps<{ menuData?: ShellMenuNode[] | null }>();

const runtime = useRuntimeStore();
const language = computed(() => runtime.language);

// menuData 为 undefined 表示宿主尚未响应（加载中）；为 null/[] 表示已响应但暂无数据。
const loading = computed(() => props.menuData === undefined);

/** 建筑专业（L2-6）节点：项目启动~现场技术管理（L3-29~L3-34）+ 标准文件/资料库/汇报决策/辅助设计（L3-35~L3-38） */
const architectureRoot = computed(() => findMenuNode(props.menuData ?? [], 'L2-6'));
const split = computed(() => splitBySeperateLine(architectureRoot.value?.children ?? [], architectureRoot.value?.seperateLine));
const categories = computed(() => split.value.leftItems);
const toolGroups = computed(() => split.value.rightItems);
</script>

<style src="../lib/shell-menu.css" scoped></style>

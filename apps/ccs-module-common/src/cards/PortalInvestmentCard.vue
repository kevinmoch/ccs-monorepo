<template>
  <CardShell class="portal-shell">
    <div class="portal-root">
      <!-- 顶部工具分组：工具库 / 运营看板 / 批复文档管理 -->
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

      <!-- 投资立项管理主区域 -->
      <div class="portal-main">
        <h2 class="portal-title" :title="investmentRoot ? pickTitle(investmentRoot, language) : ''">{{ investmentRoot ? pickTitle(investmentRoot, language) : '' }}</h2>

        <div class="portal-tabs" role="tablist">
          <button
            v-for="group in investmentGroups"
            :key="group.id"
            type="button"
            role="tab"
            class="portal-tab"
            :class="{ 'portal-tab--active': group.id === effectiveActiveGroupId }"
            :aria-selected="group.id === effectiveActiveGroupId"
            @click="activeGroupId = group.id"
          >
            {{ pickTitle(group, language) }}
          </button>
        </div>

        <p v-if="!loading && investmentGroups.length === 0" class="portal-empty">N/A</p>

        <div class="portal-category-grid">
          <section
            v-for="category in activeCategories"
            :key="category.id"
            class="portal-category-card ccs-card-surface"
            :class="{ 'portal-category-card--wide': (category.children ?? []).length > MENU_ITEM_WRAP_COUNT }"
          >
            <header class="portal-category-card__header" :title="pickTitle(category, language)">{{ pickTitle(category, language) }}</header>
            <div class="portal-category-card__body" :class="{ 'portal-category-card__body--cols': (category.children ?? []).length >= MENU_ITEM_WRAP_COUNT }">
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
import { computed, ref } from 'vue';
import { CardShell } from '@ccs/card';
import { useRuntimeStore } from '../stores/runtime';
import { findMenuNode, pickTitle, splitBySeperateLine, handleNavigate, type ShellMenuNode, MENU_ITEM_WRAP_COUNT } from '../lib/shell-menu';

/**
 * menuData：由 pages/portal-investment/PortalInvestmentPage.vue 在挂载时通过
 * globalStore.get('menuData') 从宿主框架(ccs-framework)拉取的 menu1~menu7 全量数据（见 config.ts 约定）。
 * 卡片自身不再维护任何菜单数据副本，始终与宿主的 menu1.ts 保持一致。
 */
const props = defineProps<{ menuData?: ShellMenuNode[] | null }>();

const runtime = useRuntimeStore();
const language = computed(() => runtime.language);

// menuData 为 undefined 表示宿主尚未响应（加载中）；为 null/[] 表示已响应但暂无数据。
const loading = computed(() => props.menuData === undefined);

/** 投资立项管理（L1-1）节点：国有/社会投资项目（L2-1、L2-2）+ 工具库/运营看板/批复文档管理（L2-3~L2-5） */
const investmentRoot = computed(() => findMenuNode(props.menuData ?? [], 'L1-1'));
const split = computed(() => splitBySeperateLine(investmentRoot.value?.children ?? [], investmentRoot.value?.seperateLine));
const investmentGroups = computed(() => split.value.leftItems);
const toolGroups = computed(() => split.value.rightItems);

const activeGroupId = ref<string | null>(null);
const effectiveActiveGroupId = computed(() => activeGroupId.value ?? investmentGroups.value[0]?.id ?? null);
const activeCategories = computed(() => investmentGroups.value.find((group) => group.id === effectiveActiveGroupId.value)?.children ?? []);
</script>

<style src="../lib/shell-menu.css" scoped></style>
<style scoped>
.portal-tabs {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 40px;
  margin-top: 16px;
}

.portal-tab {
  appearance: none;
  border: none;
  background: none;
  padding: 4px 2px 10px;
  font-size: 18px;
  font-weight: 600;
  color: color-mix(in srgb, var(--ccs-text, #0f172a) 55%, transparent);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition:
    color 0.15s ease,
    border-color 0.15s ease;
}

.portal-tab:hover {
  color: var(--ccs-primary, #006fd6);
}

.portal-tab--active {
  color: var(--ccs-primary, #006fd6);
  border-bottom-color: var(--ccs-primary, #006fd6);
}
</style>

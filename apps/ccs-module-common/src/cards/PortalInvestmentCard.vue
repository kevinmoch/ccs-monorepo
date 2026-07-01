<template>
  <CardShell class="ip-shell">
    <div class="ip-root">
      <!-- 顶部工具分组：工具库 / 运营看板 / 批复文档管理 -->
      <div class="ip-tools-row">
        <section v-for="group in toolGroups" :key="group.id" class="ip-tool-card ccs-card-surface">
          <header class="ip-tool-card__header">{{ pickTitle(group, language) }}</header>
          <div class="ip-tool-card__body">
            <a v-for="leaf in group.children ?? []" :key="leaf.id" href="#" class="ip-tool-link" @click.prevent="handleNavigate(leaf)">
              <span class="ip-tool-link__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <path d="M14 2v6h6" />
                </svg>
              </span>
              <span class="ip-tool-link__text">{{ pickTitle(leaf, language) }}</span>
            </a>
          </div>
        </section>
      </div>

      <!-- 投资立项管理主区域 -->
      <div class="ip-main">
        <h2 class="ip-title">投资立项管理</h2>

        <div class="ip-tabs" role="tablist">
          <button
            v-for="group in investmentGroups"
            :key="group.id"
            type="button"
            role="tab"
            class="ip-tab"
            :class="{ 'ip-tab--active': group.id === effectiveActiveGroupId }"
            :aria-selected="group.id === effectiveActiveGroupId"
            @click="activeGroupId = group.id"
          >
            {{ pickTitle(group, language) }}
          </button>
        </div>

        <p v-if="!loading && investmentGroups.length === 0" class="ip-empty">暂无菜单数据，请确认卡片已在宿主框架内嵌运行</p>

        <div class="ip-category-grid">
          <section v-for="category in activeCategories" :key="category.id" class="ip-category-card ccs-card-surface" :class="{ 'ip-category-card--wide': (category.children ?? []).length >= 7 }">
            <header class="ip-category-card__header">{{ pickTitle(category, language) }}</header>
            <div class="ip-category-card__body" :class="{ 'ip-category-card__body--cols': (category.children ?? []).length >= 7 }">
              <a v-for="leaf in category.children ?? []" :key="leaf.id" href="#" class="ip-category-link" @click.prevent="handleNavigate(leaf)">
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
import { requestShellMenuNavigate } from '@ccs/shared';
import { useRuntimeStore } from '../stores/runtime';
import { findMenuNode, pickTitle, splitBySeperateLine, type ShellMenuNode } from '../lib/shell-menu';

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

/**
 * 点击菜单链接：请求宿主框架(ccs-framework)进行菜单级导航。
 * 效果等同于用户点击了左侧/右侧侧边栏中对应的菜单链接。
 */
function handleNavigate(leaf: ShellMenuNode) {
  if (!leaf.url) return;
  requestShellMenuNavigate({ id: leaf.id, url: leaf.url });
}
</script>

<style scoped>
.card-shell.ip-shell {
  padding: 0;
  border-width: 0;
  background: transparent;
  box-shadow: none;
}

.ip-root {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

/* ---------------- 顶部工具分组 ---------------- */
.ip-tools-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
}

.ip-tool-card {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.ip-tool-card__header {
  padding: 14px 20px;
  font-size: 16px;
  font-weight: 700;
  text-align: center;
  color: var(--ccs-text, #0f172a);
  border-bottom: 1px solid var(--ccs-card-border-color, rgba(15, 23, 42, 0.1));
}

.ip-tool-card__body {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px 16px;
  padding: 12px 20px 16px;
}

.ip-tool-link {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 4px;
  border-radius: 8px;
  color: color-mix(in srgb, var(--ccs-text, #0f172a) 78%, transparent);
  text-decoration: none;
  font-size: 14px;
  cursor: pointer;
  transition:
    color 0.15s ease,
    background-color 0.15s ease;
}

.ip-tool-link:hover {
  color: var(--ccs-primary, #2563eb);
  background-color: color-mix(in srgb, var(--ccs-primary, #2563eb) 8%, transparent);
}

.ip-tool-link__icon {
  display: inline-flex;
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  color: var(--ccs-primary, #2563eb);
}

.ip-tool-link__icon svg {
  width: 100%;
  height: 100%;
}

.ip-tool-link__text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ---------------- 投资立项管理主区域 ---------------- */
.ip-title {
  margin: 0;
  text-align: center;
  font-size: 22px;
  font-weight: 700;
  color: var(--ccs-text, #0f172a);
}

.ip-tabs {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 40px;
  margin-top: 16px;
}

.ip-tab {
  appearance: none;
  border: none;
  background: none;
  padding: 4px 2px 10px;
  font-size: 16px;
  font-weight: 600;
  color: color-mix(in srgb, var(--ccs-text, #0f172a) 55%, transparent);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition:
    color 0.15s ease,
    border-color 0.15s ease;
}

.ip-tab:hover {
  color: var(--ccs-primary, #2563eb);
}

.ip-tab--active {
  color: var(--ccs-primary, #2563eb);
  border-bottom-color: var(--ccs-primary, #2563eb);
}

.ip-empty {
  margin: 24px 0 0;
  text-align: center;
  font-size: 14px;
  color: color-mix(in srgb, var(--ccs-text, #0f172a) 45%, transparent);
}

.ip-category-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 20px;
  margin-top: 24px;
  align-items: start;
}

.ip-category-card {
  grid-column: span 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.ip-category-card--wide {
  grid-column: span 2;
}

.ip-category-card__header {
  padding: 12px 16px;
  text-align: center;
  font-size: 15px;
  font-weight: 700;
  color: #fff;
  background: repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.06) 0 6px, transparent 6px 12px), linear-gradient(135deg, #1e3a5f 0%, #2c5282 100%);
}

.ip-category-card__body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 12px 16px 16px;
}

.ip-category-card__body--cols {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2px 20px;
}

.ip-category-link {
  display: block;
  padding: 8px 6px;
  border-radius: 8px;
  font-size: 14px;
  color: color-mix(in srgb, var(--ccs-text, #0f172a) 78%, transparent);
  text-decoration: none;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition:
    color 0.15s ease,
    background-color 0.15s ease;
}

.ip-category-link:hover {
  color: var(--ccs-primary, #2563eb);
  background-color: color-mix(in srgb, var(--ccs-primary, #2563eb) 8%, transparent);
}

/* ---------------- 移动端自适应 ---------------- */
@media (max-width: 767px) {
  .ip-tools-row {
    grid-template-columns: 1fr;
    gap: 16px;
  }

  .ip-tool-card__body {
    grid-template-columns: 1fr;
  }

  .ip-category-grid {
    grid-template-columns: 1fr;
    gap: 16px;
  }

  .ip-category-card,
  .ip-category-card--wide {
    grid-column: span 1;
  }

  .ip-category-card__body--cols {
    grid-template-columns: 1fr;
  }

  .ip-tabs {
    gap: 24px;
  }
}
</style>

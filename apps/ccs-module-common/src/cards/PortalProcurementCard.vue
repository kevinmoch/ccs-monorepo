<template>
  <CardShell class="portal-shell">
    <div class="portal-root">
      <div class="portal-main">
        <p v-if="!loading && allSections.length === 0" class="portal-empty">N/A</p>

        <template v-for="(section, idx) in allSections" :key="section.id">
          <!-- 第一个分区「采购能力平台」使用 tool-card 样式 -->
          <template v-if="idx === 0">
            <h2 class="portal-section-title" :title="pickTitle(section.title, language)">{{ pickTitle(section.title, language) }}</h2>
            <div class="portal-tools-row" v-if="section.items.length > 0">
              <section v-for="item in section.items" :key="item.id" class="portal-tool-card ccs-card-surface">
                <header class="portal-tool-card__header" :title="pickTitle(item, language)">{{ pickTitle(item, language) }}</header>
                <div class="portal-tool-card__body">
                  <a
                    v-for="leaf in item.children ?? []"
                    :key="leaf.id"
                    href="#"
                    class="portal-tool-link"
                    :class="{ 'portal-tool-link--disabled': leaf.disabled }"
                    @click.prevent="!leaf.disabled && handleNavigate(leaf)"
                  >
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
          </template>

          <!-- 其余分区「采购作业平台」「采购运营平台」使用 category-card 样式 -->
          <template v-else>
            <h2 class="portal-section-title" :title="pickTitle(section.title, language)">{{ pickTitle(section.title, language) }}</h2>
            <div class="portal-section-grid" v-if="section.items.length > 0">
              <section v-for="category in section.items" :key="category.id" class="portal-category-card ccs-card-surface">
                <header class="portal-category-card__header" :title="pickTitle(category, language)">{{ pickTitle(category, language) }}</header>
                <div class="portal-category-card__body" :class="{ 'portal-category-card__body--cols': (category.children ?? []).length > MENU_ITEM_WRAP_COUNT }">
                  <a
                    v-for="leaf in category.children ?? []"
                    :key="leaf.id"
                    href="#"
                    class="portal-category-link"
                    :class="{ 'portal-category-link--disabled': leaf.disabled }"
                    :title="pickTitle(leaf, language)"
                    @click.prevent="!leaf.disabled && handleNavigate(leaf)"
                  >
                    {{ pickTitle(leaf, language) }}
                  </a>
                </div>
              </section>
            </div>
          </template>
        </template>
      </div>
    </div>
  </CardShell>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { CardShell } from '@ccs/card';
import { useRuntimeStore } from '../stores/runtime';
import { findMenuNode, pickTitle, splitBySeperateLine, handleNavigate, type ShellMenuNode, MENU_ITEM_WRAP_COUNT } from '../lib/shell-menu';

const props = defineProps<{ menuData?: ShellMenuNode[] | null }>();

const runtime = useRuntimeStore();
const language = computed(() => runtime.language);
const loading = computed(() => props.menuData === undefined);

const rootNode = computed(() => findMenuNode(props.menuData ?? [], 'L1-4'));

/** 三个分区：采购能力平台(右侧) + 采购作业平台(左侧第一个) + 采购运营平台(左侧第二个) */
const allSections = computed(() => {
  const node = rootNode.value;
  if (!node) return [];
  const { leftItems, rightItems } = splitBySeperateLine(node.children ?? [], node.seperateLine);
  const result: { id: string; title: ShellMenuNode; items: ShellMenuNode[] }[] = [];
  // 采购能力平台：右侧项（L2-34）下的 L3 子节点
  for (const group of rightItems) {
    result.push({ id: group.id, title: group, items: group.children ?? [] });
  }
  // 采购作业平台、采购运营平台：左侧 L2 项下的 L3 子节点
  for (const group of leftItems) {
    result.push({ id: group.id, title: group, items: group.children ?? [] });
  }
  return result;
});
</script>

<style src="../lib/shell-menu.css" scoped></style>
<style scoped>
.portal-section-title {
  margin: 32px 0 20px;
  text-align: center;
  font-size: 22px;
  font-weight: 700;
  color: var(--ccs-text, #0f172a);
}

.portal-section-title:first-of-type {
  margin-top: 5px;
}

.portal-section-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
  align-items: start;
}

@media (max-width: 1023px) {
  .portal-section-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 767px) {
  .portal-section-grid {
    grid-template-columns: 1fr;
  }
}
</style>

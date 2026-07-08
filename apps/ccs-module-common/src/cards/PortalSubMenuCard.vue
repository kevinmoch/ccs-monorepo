<template>
  <CardShell class="portal-shell">
    <div class="portal-root">
      <div class="portal-main">
        <p v-if="!loading && allSections.length === 0" class="portal-empty">N/A</p>

        <template v-for="(section, idx) in allSections" :key="section.id">
          <!-- seperateLine 右侧项使用 tool-card 样式 -->
          <template v-if="idx < toolCardCount">
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

          <!-- 其余分区（左侧项或无 seperateLine 时全部）使用 category-card 自适应网格 -->
          <template v-else>
            <h2 class="portal-section-title" :title="pickTitle(section.title, language)">{{ pickTitle(section.title, language) }}</h2>
            <div class="portal-category-grid" v-if="section.items.length > 0">
              <section
                v-for="category in section.items"
                :key="category.id"
                class="portal-category-card ccs-card-surface"
                :class="{ 'portal-category-card--wide': (category.children ?? []).length > MENU_ITEM_WRAP_COUNT }"
              >
                <header class="portal-category-card__header" :title="pickTitle(category, language)">{{ pickTitle(category, language) }}</header>
                <div class="portal-category-card__body">
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

const props = defineProps<{
  menuData?: ShellMenuNode[] | null;
  rootId: string;
}>();

const runtime = useRuntimeStore();
const language = computed(() => runtime.language);
const loading = computed(() => props.menuData === undefined);

const rootNode = computed(() => findMenuNode(props.menuData ?? [], props.rootId));

const allSections = computed(() => {
  const node = rootNode.value;
  if (!node) return [];
  const { leftItems, rightItems } = splitBySeperateLine(node.children ?? [], node.seperateLine);
  const result: { id: string; title: ShellMenuNode; items: ShellMenuNode[] }[] = [];
  for (const group of rightItems) {
    result.push({ id: group.id, title: group, items: group.children ?? [] });
  }
  for (const group of leftItems) {
    result.push({ id: group.id, title: group, items: group.children ?? [] });
  }
  return result;
});

/** seperateLine 右侧项数量 → 前 N 个分区使用 tool-card，其余使用 category-card */
const toolCardCount = computed(() => {
  const node = rootNode.value;
  if (!node) return 0;
  const { rightItems } = splitBySeperateLine(node.children ?? [], node.seperateLine);
  return rightItems.length;
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
</style>

import type { Component } from 'vue';
export interface CardDefinition {
  type: string;
  title?: string;
  props?: Record<string, unknown>;
}
export type CardRegistry = Record<string, Component>;
export function createCardRegistry(cards: CardRegistry) {
  return cards;
}
export { default as CardGrid } from './components/CardGrid.vue';
export { default as CcsCardShell } from './components/CcsCardShell.vue';

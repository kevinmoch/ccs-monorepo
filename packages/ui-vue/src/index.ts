import type { Component } from 'vue';
import type { Language } from '@ccs/shared';
export type LocalizedText = string | Partial<Record<Language, string>>;
export interface CardGridSpan {
  base?: number;
  md?: number;
}
export interface CardGridLayout {
  colSpan?: CardGridSpan;
  rowSpan?: number;
}
export interface CardDefinition {
  type: string;
  title?: LocalizedText;
  layout?: CardGridLayout;
  colSpan?: CardGridSpan;
  rowSpan?: number;
  props?: Record<string, unknown>;
}
export type CardRegistry = Record<string, Component>;
export function createCardRegistry(cards: CardRegistry) {
  return cards;
}
export { default as CardGrid } from './components/CardGrid.vue';
export { default as CardShell } from './components/CardShell.vue';

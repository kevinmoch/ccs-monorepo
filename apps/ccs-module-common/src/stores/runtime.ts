import { defineStore } from 'pinia';
import type { Language, ThemeMode } from '@ccs/shared';
export const useRuntimeStore = defineStore('runtime', {
  state: () => ({ theme: 'light' as ThemeMode, language: 'zh-CN' as Language }),
  actions: {
    setTheme(theme: ThemeMode) {
      this.theme = theme;
    },
    setLanguage(language: Language) {
      this.language = language;
    }
  }
});

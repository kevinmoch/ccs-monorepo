import { createI18n } from 'vue-i18n';
import { resources } from '@ccs/shared';
import zhCN from './zh-CN';
import enUS from './en-US';

export const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
  messages: {
    'zh-CN': resources['zh-CN'].translation,
    'en-US': resources['en-US'].translation
  } as any
});

// 注册模块级国际化资源
i18n.global.mergeLocaleMessage('zh-CN', zhCN);
i18n.global.mergeLocaleMessage('en-US', enUS);

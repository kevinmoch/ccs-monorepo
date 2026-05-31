import i18next, { Resource } from 'i18next';
export type Language = 'zh-CN' | 'en-US';
export const resources: Resource = {
  'zh-CN': {
    translation: {
      appName: 'CCS 企业门户',
      dashboard: '工作台',
      demoModule: '示例业务模块',
      demoHomeIntro: '该模块由 create module 创建，页面与卡片由 CCS CLI 继续生成并装配。',
      demoDashboard: '工作台',
      analytics: '经营分析',
      theme: '主题',
      language: '语言',
      light: '浅色',
      dark: '深色',
      userStat: '用户指标'
    }
  },
  'en-US': {
    translation: {
      appName: 'CCS Enterprise Portal',
      dashboard: 'Dashboard',
      demoModule: 'Demo Business Module',
      demoHomeIntro: 'This module is scaffolded by create module, then assembled with generated pages and cards.',
      demoDashboard: 'Dashboard',
      analytics: 'Analytics',
      theme: 'Theme',
      language: 'Language',
      light: 'Light',
      dark: 'Dark',
      userStat: 'User Metrics'
    }
  }
};
export async function initCcsI18n(language: Language = 'zh-CN') {
  if (!i18next.isInitialized) await i18next.init({ lng: language, fallbackLng: 'zh-CN', resources, interpolation: { escapeValue: false } });
  else await i18next.changeLanguage(language);
  return i18next;
}

import i18next, { Resource } from 'i18next';
export type Language = 'zh-CN' | 'en-US';
export const resources: Resource = {
  'zh-CN': {
    translation: {
      appName: 'CCS 企业门户',
      dashboard: '工作台',
      demoModule: '示例业务模块',
      analytics: '经营分析',
      orders: '订单中心',
      theme: '主题',
      language: '语言',
      light: '浅色',
      dark: '深色',
      userStat: '用户指标',
      orderChart: '订单趋势',
      todoList: '待办事项'
    }
  },
  'en-US': {
    translation: {
      appName: 'CCS Enterprise Portal',
      dashboard: 'Dashboard',
      demoModule: 'Demo Business Module',
      analytics: 'Analytics',
      orders: 'Orders',
      theme: 'Theme',
      language: 'Language',
      light: 'Light',
      dark: 'Dark',
      userStat: 'User Metrics',
      orderChart: 'Order Trend',
      todoList: 'Todo List'
    }
  }
};
export async function initCcsI18n(language: Language = 'zh-CN') {
  if (!i18next.isInitialized) await i18next.init({ lng: language, fallbackLng: 'zh-CN', resources, interpolation: { escapeValue: false } });
  else await i18next.changeLanguage(language);
  return i18next;
}

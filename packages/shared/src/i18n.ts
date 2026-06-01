import i18next, { Resource } from 'i18next';
export type Language = 'zh-CN' | 'en-US';
export const resources: Resource = {
  'zh-CN': {
    translation: {
      appName: 'CCS 企业门户',
    }
  },
  'en-US': {
    translation: {
      appName: 'CCS Enterprise Portal',
    }
  }
};
export async function initCcsI18n(language: Language = 'zh-CN') {
  if (!i18next.isInitialized) await i18next.init({ lng: language, fallbackLng: 'zh-CN', resources, interpolation: { escapeValue: false } });
  else await i18next.changeLanguage(language);
  return i18next;
}

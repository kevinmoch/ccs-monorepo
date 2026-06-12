import i18next, { Resource } from 'i18next';
import { useI18n } from 'vue-i18n';

export type Language = 'zh-CN' | 'en-US';
export const resources: Resource = {
  'zh-CN': {
    translation: {
      appName: 'CCS 企业门户'
    }
  },
  'en-US': {
    translation: {
      appName: 'CCS Enterprise Portal'
    }
  }
};
export async function initCcsI18n(language: Language = 'zh-CN') {
  if (!i18next.isInitialized) await i18next.init({ lng: language, fallbackLng: 'zh-CN', resources, interpolation: { escapeValue: false } });
  else await i18next.changeLanguage(language);
  return i18next;
}

/**
 * 返回一个带命名空间前缀的 t 函数，方便卡片/页面按领域使用。
 * 调用方式：t('key') —— 实际查找的 key 为 `scope.key`。
 *
 * @example
 * const t = useScopedT('attendance');
 * t('shiftInfo') // 查找 vue-i18n 中的 attendance.shiftInfo
 */
export function useScopedT(scope: string) {
  const { t } = useI18n({ useScope: 'global' });
  return (key: string): string => t(`${scope}.${key}`);
}

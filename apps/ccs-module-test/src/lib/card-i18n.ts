import { useI18n } from 'vue-i18n';

type Messages = Record<string, Record<string, string>>;

/**
 * Create a simple translation function that looks up keys from a flat messages object.
 * Uses the current locale from vue-i18n.
 */
export function createCardTranslator(messages: Messages) {
  const { locale } = useI18n({ useScope: 'global' });
  return (key: string): string => {
    const lang = (locale as any).value ?? 'zh-CN';
    return messages[lang]?.[key] ?? messages['zh-CN']?.[key] ?? key;
  };
}

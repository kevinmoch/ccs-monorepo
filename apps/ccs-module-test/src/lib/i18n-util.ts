import { useI18n } from 'vue-i18n';
import type { LocaleMessages, VueMessageType } from 'vue-i18n';

const registeredScopes = new Set<string>();

/**
 * Register a set of translations at runtime and return the `t` function.
 * Idempotent — each scope is merged only once.
 */
export function registerTranslations(scope: string, messages: LocaleMessages<VueMessageType>): ReturnType<typeof useI18n>['t'] {
  const { t, te, ...rest } = useI18n({ useScope: 'global' });
  if (!registeredScopes.has(scope)) {
    for (const [locale, msg] of Object.entries(messages)) {
      (rest as any).mergeLocaleMessage?.(locale, msg);
    }
    registeredScopes.add(scope);
  }
  return t;
}

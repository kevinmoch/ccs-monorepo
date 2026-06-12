import { computed, type ComputedRef } from 'vue';
import { useI18n } from 'vue-i18n';
import { getRuntimeOptions, type RuntimeInfo } from '../runtime';

/**
 * 响应式运行时选项 —— 自动追踪 vue-i18n locale 变化，
 * 确保 getRuntimeOptions() 的 i18next 翻译结果随语言切换同步更新。
 *
 * @example
 * const opts = useRuntimeOptions();
 * const label = computed(() => opts.value.find(o => o.kind === 'web')?.label);
 */
export function useRuntimeOptions(): ComputedRef<RuntimeInfo[]> {
  const { locale } = useI18n();
  return computed<RuntimeInfo[]>(() => {
    void locale.value;
    return getRuntimeOptions();
  });
}

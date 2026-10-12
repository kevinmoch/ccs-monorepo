import { createHttpMessageComponent } from '@webskill/chatbot';
import type { ChatComponent } from '@webskill/chatbot';
import type { HostComponentConfig } from '../../scripts/extensionConfig.mjs';

/**
 * config.json 的 `hostComponents` 分节 → 宿主组件（0.26.0 分册 14 · FR-14.26～14.28）。
 *
 * 分节在构建期已由 `parseHostComponents` 校验过；这里只做映射，不再重复校验。
 * 没配的键不往工厂选项里写：缺省值归工厂，扩展不替它做主。
 */
export type HostComponentEntry = HostComponentConfig;

export function createHostComponents(entries: readonly HostComponentEntry[]): ChatComponent[] {
  return entries.map((entry) =>
    createHttpMessageComponent({
      name: entry.name,
      label: entry.label,
      endpoint: entry.endpoint,
      ...(entry.tips !== undefined ? { tips: entry.tips } : {}),
      ...(entry.description !== undefined ? { description: entry.description } : {}),
      ...(entry.timeoutMs !== undefined ? { timeoutMs: entry.timeoutMs } : {})
    })
  );
}

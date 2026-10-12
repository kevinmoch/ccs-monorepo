/**
 * 扩展自己的虚拟模块：构建期解析后的 config.json `hostComponents` 分节（vite.config.ts 里的小插件生成）。
 * SDK 的 `virtual:webskill-config` 只带 `RuntimeConfig` 缺省值，宿主自有分节不在其中。
 */
declare module 'virtual:webskill-host-components' {
  import type { HostComponentConfig } from '../../scripts/extensionConfig.mjs';

  /** 分节缺席或为空即 `[]`：没配就是没接入 */
  export const HOST_COMPONENT_ENTRIES: readonly HostComponentConfig[];
}

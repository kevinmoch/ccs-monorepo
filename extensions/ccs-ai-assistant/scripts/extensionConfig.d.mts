/**
 * `extensionConfig.mjs` 的类型声明。
 *
 * 该模块必须是纯 JS（要在 vite 配置加载期跑，那时别名表还没生效），
 * 但它有两个 TS 消费方：`vite.config.ts` 与 `test/extensionConfig.test.ts`。
 */

/** 面向调用方的结构化错误：消息里的路径指向 config.json 里出问题的位置 */
export declare class ExtensionConfigError extends Error {
  constructor(message: string);
}

/** 只读 `manifest` 分节；缺席即无覆写 */
export declare function parseManifestOverrides(raw: unknown): Record<string, string>;

/** 双语文案：中英两份都必填 */
export interface BilingualText {
  zh: string;
  en: string;
}

/** `hostComponents` 的一项：与 `createHttpMessageComponent` 的选项一一对应（不含 `fetch`） */
export interface HostComponentConfig {
  name: string;
  label: BilingualText;
  endpoint: string;
  tips?: BilingualText;
  description?: string;
  timeoutMs?: number;
}

/** 只读 `hostComponents` 分节；缺席或为空即不接入任何组件 */
export declare function parseHostComponents(raw: unknown): HostComponentConfig[];

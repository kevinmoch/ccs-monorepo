/**
 * `extensionConfig.mjs` 的类型声明。
 *
 * 该模块必须是纯 JS（要在 vite 配置加载期跑，那时别名表还没生效），
 * 但它有两个 TS 消费方：`vite.config.ts` 与 `test/bakedConfig.test.ts`。
 */

/** 面向调用方的结构化错误：消息里的 `path` 指向 config.json 里出问题的位置 */
export declare class ExtensionConfigError extends Error {
  constructor(message: string);
}

/** SDK 常量的手抄副本，由 test/bakedConfig.test.ts 比对防漂移 */
export declare const MIRRORED_ENUMS: {
  llmProviders: string[];
  sandboxExecutors: string[];
  routerStrategies: string[];
  renderers: string[];
  quickPromptIcons: string[];
  capabilityKeys: string[];
};

export declare function parseExtensionConfig(raw: unknown): {
  /** 逐段拼出的 `DeepPartial<RuntimeConfig>`；纯 JS 侧无法引用那个类型，故在此放宽 */
  runtimeConfig: Record<string, any>;
  /** entryId → 明文 apiKey；调用方负责决定它怎么进产物 */
  secrets: Record<string, string>;
  manifest: Record<string, string>;
};

import type { RuntimeConfig } from '@webskill/ui-kit';

/**
 * 逐层可选的 `RuntimeConfig`。数组整体保留（不逐元素可选）：
 * 烘焙配置对数组是**替换**语义，半个数组没有意义。
 */
export type DeepPartial<T> = T extends readonly unknown[]
  ? T
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;

/** `config.json` 映射后的形状；生成文件与合并层共用，避免循环 import */
export type BakedRuntimeConfig = DeepPartial<RuntimeConfig>;

/** AES-GCM 密文（base64），见 scripts/writeBakedConfig.mjs 关于「这是混淆不是加密」的说明 */
export interface BakedSecret {
  iv: string;
  data: string;
}

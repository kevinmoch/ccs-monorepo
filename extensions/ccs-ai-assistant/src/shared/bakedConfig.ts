import { mergeRuntimeConfigDefaults } from '@webskill/ui-kit';
import type { RuntimeConfig, RuntimeLlmEntry } from '@webskill/ui-kit';
import { BAKED_CONFIG, BAKED_SECRET_KEY, BAKED_SECRETS } from '../generated/bakedConfig';
import type { BakedRuntimeConfig, BakedSecret } from './bakedTypes';

/**
 * 打包期烘焙配置的应用层。
 *
 * 语义是**缺省值**而不是强制覆盖：用户在 Console 里改过的项永远优先。
 * 合并按层递归而非顶层 spread——SDK 后续新增字段时，老的 localStorage 里没有那个字段，
 * 逐层合并才能让烘焙值填进去；顶层 spread 会因为 `sandbox` 整体存在而整段落空。
 *
 * 数组是**替换**语义：`entries: []` 是「用户把模型删光了」，
 * 与「从没配过」（键缺席）必须分得开，否则删掉的条目会自己长回来。
 */

/**
 * localStorage 里代替明文 apiKey 的占位串。
 *
 * 它让烘焙的密钥不落盘（F12 看 localStorage 看不到），但**到此为止**：
 * 密钥运行时必然在内存里以明文存在，也必然明文发给模型提供方。
 * 这不是安全边界，只是把可被顺手读到的面缩小一点。
 */
const BAKED_KEY_SENTINEL = '\u0000webskill:baked-api-key';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepMerge(base: unknown, over: unknown): unknown {
  if (!isPlainObject(base) || !isPlainObject(over)) return over;
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(over)) {
    if (value === undefined) continue;
    out[key] = key in base ? deepMerge(base[key], value) : value;
  }
  return out;
}

/**
 * 把烘焙缺省值垫在已存配置之下，再交给 SDK 做类型与阈值校验。
 * 返回值里模型条目的 `apiKey` 仍是占位串或缺席——解密走 {@link restoreBakedSecrets}。
 */
export function applyBakedDefaults(stored: unknown): RuntimeConfig {
  const merged = stored === undefined ? BAKED_CONFIG : deepMerge(BAKED_CONFIG, stored);
  return mergeRuntimeConfigDefaults(merged as BakedRuntimeConfig);
}

let decrypted: Map<string, string> | undefined;

async function decryptSecrets(): Promise<Map<string, string>> {
  if (decrypted !== undefined) return decrypted;
  const out = new Map<string, string>();
  const ids = Object.keys(BAKED_SECRETS);
  if (ids.length > 0 && BAKED_SECRET_KEY !== '') {
    try {
      const key = await crypto.subtle.importKey('raw', fromBase64(BAKED_SECRET_KEY), 'AES-GCM', false, ['decrypt']);
      for (const id of ids) {
        const secret = BAKED_SECRETS[id] as BakedSecret;
        const plain = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: fromBase64(secret.iv) },
          key,
          fromBase64(secret.data)
        );
        out.set(id, new TextDecoder().decode(plain));
      }
    } catch {
      // 产物被改坏时按「没烘焙密钥」处理：用户仍可在 Console 里自己填，不该整页失败
      out.clear();
    }
  }
  decrypted = out;
  return out;
}

function fromBase64(value: string): ArrayBuffer {
  const binary = atob(value);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return buffer;
}

function mapEntries(config: RuntimeConfig, map: (entry: RuntimeLlmEntry) => RuntimeLlmEntry): RuntimeConfig {
  return { ...config, llm: { ...config.llm, entries: config.llm.entries.map(map) } };
}

/**
 * 把烘焙密钥还原进对应模型条目。
 *
 * 只在 `apiKey` 缺席或等于占位串时注入：空串是用户在 Console 里**显式清空**，
 * 再注入回去等于用户删不掉这个密钥。
 */
export async function restoreBakedSecrets(config: RuntimeConfig): Promise<RuntimeConfig> {
  const secrets = await decryptSecrets();
  if (secrets.size === 0) return config;
  return mapEntries(config, (entry) => {
    const baked = secrets.get(entry.id);
    if (baked === undefined) return entry;
    if (entry.apiKey !== undefined && entry.apiKey !== BAKED_KEY_SENTINEL) return entry;
    return { ...entry, apiKey: baked };
  });
}

/** 落盘前把烘焙密钥换回占位串，明文因此不进 localStorage */
export async function stripBakedSecrets(config: RuntimeConfig): Promise<RuntimeConfig> {
  const secrets = await decryptSecrets();
  if (secrets.size === 0) return config;
  return mapEntries(config, (entry) =>
    entry.apiKey !== undefined && entry.apiKey === secrets.get(entry.id)
      ? { ...entry, apiKey: BAKED_KEY_SENTINEL }
      : entry
  );
}

/** 供测试重置解密缓存 */
export function resetBakedSecretCache(): void {
  decrypted = undefined;
}

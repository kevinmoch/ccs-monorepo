/**
 * 把 `config.json` 烘焙成扩展源码可直接 import 的常量。
 *
 * 为什么是构建期生成而不是运行时 fetch：`loadRuntimeConfigSync()` 必须**同步**返回
 * （`PageActionConsent.describeScope` 要同步给出一行文案），而 `chrome.runtime.getURL` + fetch
 * 是异步的；service worker 侧也要读同一份值。编译期常量是唯一同时满足这两点的形态。
 *
 * apiKey 单独走 AES-GCM 密文，**这是混淆不是加密**：密钥与密文都在同一个包里，
 * 任何人都能调用解密函数拿到明文。它挡的是自动化密钥扫描器与误提交，
 * 不构成安全边界——真正的边界只有「不要把密钥放进要分发的包」。
 *
 * 产物**不入库**（.gitignore）：里面有密钥材料，且随 config.json 变化。
 */
import { createHash, webcrypto } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ExtensionConfigError, parseExtensionConfig } from './extensionConfig.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const configPath = resolve(here, '../config.json');
const target = resolve(here, '../src/generated/bakedConfig.ts');

const toBase64 = (bytes) => Buffer.from(bytes).toString('base64');

async function encryptSecrets(secrets) {
  const ids = Object.keys(secrets);
  if (ids.length === 0) return { keyB64: '', entries: {} };
  const rawKey = webcrypto.getRandomValues(new Uint8Array(32));
  const cryptoKey = await webcrypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, ['encrypt']);
  const entries = {};
  for (const id of ids) {
    const iv = webcrypto.getRandomValues(new Uint8Array(12));
    const data = await webcrypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      cryptoKey,
      new TextEncoder().encode(secrets[id])
    );
    entries[id] = { iv: toBase64(iv), data: toBase64(new Uint8Array(data)) };
  }
  return { keyB64: toBase64(rawKey), entries };
}

function render({ runtimeConfig, secrets, manifest, fingerprint }) {
  const json = (value) => JSON.stringify(value, null, 2);
  return `/* Generated from config.json by scripts/writeBakedConfig.mjs. Do not edit. */
import type { BakedRuntimeConfig, BakedSecret } from '../shared/bakedTypes';

/** config.json 的内容指纹；生成脚本靠它判断是否需要重写本文件 */
export const BAKED_FINGERPRINT = ${json(fingerprint)};

/** 打包期烘焙的 Console 配置缺省值；用户在 Console 里改过的项优先于它 */
export const BAKED_CONFIG: BakedRuntimeConfig = ${json(runtimeConfig)};

/** manifest.json 的三项覆写，由 vite 插件在拷贝时应用 */
export const BAKED_MANIFEST: Readonly<Record<string, string>> = ${json(manifest)};

/**
 * AES-GCM 密钥（base64）。**它与密文在同一个包里，因此只是混淆**：
 * 目的是让 dist 里不出现可被扫描器识别的明文密钥，不是让密钥不可获取。
 *
 * 显式标注 string 而非留给字面量推断：空 key 与非空 key 否则会得到两种类型，
 * 消费侧的判空比较在其中一种下会被 TS 判为无意义比较。
 */
export const BAKED_SECRET_KEY: string = ${json(secrets.keyB64)};

/** entryId → 密文；解密后注入对应模型条目的 apiKey */
export const BAKED_SECRETS: Readonly<Record<string, BakedSecret>> = ${json(secrets.entries)};
`;
}

function readConfig() {
  try {
    return readFileSync(configPath, 'utf8');
  } catch {
    return undefined;
  }
}

const rawText = readConfig();
if (rawText === undefined) {
  console.log('config.json not found; baking SDK defaults only');
}

let parsed;
try {
  parsed =
    rawText === undefined
      ? { runtimeConfig: {}, secrets: {}, manifest: {} }
      : parseExtensionConfig(JSON.parse(rawText));
} catch (error) {
  if (error instanceof ExtensionConfigError) {
    console.error(`config.json is invalid: ${error.message}`);
  } else {
    console.error(`config.json could not be parsed: ${error.message}`);
  }
  process.exit(1);
}

const secretIds = Object.keys(parsed.secrets);
if (secretIds.length > 0) {
  console.warn(
    `WARNING: config.json embeds API keys for [${secretIds.join(', ')}]. ` +
      'The build output is only obfuscated, not protected — treat dist/ as a credential and do not distribute it.'
  );
}
for (const [path, value] of [
  ['sandbox.allowHttp', parsed.runtimeConfig.sandbox?.remoteUrl?.allowHttp],
  ['sandbox.allowPrivateHosts', parsed.runtimeConfig.sandbox?.remoteUrl?.allowPrivateHosts],
  ['sandbox.capabilities.fetchData', parsed.runtimeConfig.sandbox?.capabilities?.fetchData],
  ['privacy.userProfile', parsed.runtimeConfig.userProfile?.enabled],
  ['agentRuntime.multimodal.imageAttachments', parsed.runtimeConfig.multimodal?.imageAttachments],
  ['agentRuntime.multimodal.pageImageCapture', parsed.runtimeConfig.multimodal?.pageImageCapture]
]) {
  // 这几项的 SDK 缺省是「关」，且都由需求评审定过（新增攻击面一律默认关）
  if (value === true) console.warn(`WARNING: config.json opens a default-off gate: ${path}`);
}

// 把本脚本自身也算进指纹：只改 render 模板而 config.json 没动时，旧产物同样必须重写
const fingerprint = createHash('sha256')
  .update(rawText ?? '')
  .update(readFileSync(new URL(import.meta.url), 'utf8'))
  .digest('hex');

let current = '';
try {
  current = readFileSync(target, 'utf8');
} catch {
  // 首次生成
}
// 密钥每次随机，逐字比对必然不等；靠指纹判断 config.json 有没有变
if (current.includes(`export const BAKED_FINGERPRINT = ${JSON.stringify(fingerprint)};`)) {
  console.log(`bakedConfig.ts already up to date: ${target}`);
} else {
  const secrets = await encryptSecrets(parsed.secrets);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, render({ ...parsed, secrets, fingerprint }));
  console.log(`bakedConfig.ts written: ${target}`);
}

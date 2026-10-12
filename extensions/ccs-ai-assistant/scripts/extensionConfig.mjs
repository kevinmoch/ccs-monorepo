/**
 * `config.json` 里**扩展独有**的两节：`manifest` 覆写与 `hostComponents` 宿主组件。
 *
 * 通用配置面（模型、沙箱、外观……）已经归 `@webskill/chatbot/config`，
 * 这里只剩 MV3 专属的四项（`name` / `version` / `description` / `update_url`）和宿主组件的接入清单。
 *
 * 它必须继续是 `.mjs`：`vite.config.ts` 在顶部 import 它来算 manifest，
 * 那时 vite 的 alias 还没建立，import 不了 TS 源码。
 * 也刻意**不 import SDK**——这两节与 `RuntimeConfig` 无关，
 * 让它依赖 SDK 就等于把 chatbot 的构建变成扩展构建的前置条件。
 */

export class ExtensionConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ExtensionConfigError';
  }
}

function fail(message) {
  throw new ExtensionConfigError(message);
}

function readString(value, path) {
  if (typeof value !== 'string') fail(`${path} must be a string`);
  if (value.trim() === '') fail(`${path} must not be empty`);
  return value;
}

/** Chrome 的版本号：1–4 段十进制整数，每段 0–65535，且不得有前导零 */
function readManifestVersion(value, path) {
  const raw = readString(value, path);
  const parts = raw.split('.');
  if (parts.length < 1 || parts.length > 4) {
    fail(`${path} must have between 1 and 4 dot-separated parts`);
  }
  for (const part of parts) {
    if (!/^(0|[1-9]\d*)$/.test(part) || Number(part) > 65535) {
      fail(`${path} parts must be integers between 0 and 65535 without leading zeros`);
    }
  }
  return raw;
}

const MANIFEST_OVERRIDE_KEYS = ['name', 'version', 'description', 'update_url'];

/**
 * 只读 `manifest` 分节，其余顶层键交给 SDK 解析器（构建期由 vite 插件跑）。
 * 缺席即无覆写；只把出现过的键写进结果，其余保留 `manifest.json` 里的原值。
 * `update_url` 是 CRX 自动更新的入口（分册 16）：文件夹加载的扩展会忽略它，不写就没有这个字段。
 * @param {unknown} raw 整份 `config.json`
 * @returns {Record<string, string>}
 */
export function parseManifestOverrides(raw) {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) fail('config must be an object');
  const section = raw.manifest;
  if (section === undefined) return {};
  if (typeof section !== 'object' || section === null || Array.isArray(section)) fail('manifest must be an object');
  for (const key of Object.keys(section)) {
    if (!MANIFEST_OVERRIDE_KEYS.includes(key)) {
      fail(`manifest.${key} is not a recognized option (allowed: ${MANIFEST_OVERRIDE_KEYS.join(', ')})`);
    }
  }
  const out = {};
  if (section.name !== undefined) out.name = readString(section.name, 'manifest.name');
  if (section.version !== undefined) out.version = readManifestVersion(section.version, 'manifest.version');
  if (section.description !== undefined) out.description = readString(section.description, 'manifest.description');
  if (section.update_url !== undefined) out.update_url = readEndpoint(section.update_url, 'manifest.update_url');
  return out;
}

const COMPONENT_NAME = /^[a-z][a-z0-9_]{0,39}$/;
/** 与引擎的更新凭据工具名后缀同一个字面量（0.26.0 分册 14 FR-14.4）；由 test/hostComponents.test.ts 对照 */
const UPDATE_CREDENTIALS_SUFFIX = '_update_credentials';
const HOST_COMPONENT_KEYS = ['name', 'label', 'endpoint', 'tips', 'description', 'timeoutMs'];

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function required(value, path) {
  if (value === undefined) fail(`${path} is required`);
  return value;
}

function rejectUnknownKeys(object, allowed, path) {
  for (const key of Object.keys(object)) {
    if (!allowed.includes(key)) {
      fail(`${path}.${key} is not a recognized option (allowed: ${allowed.join(', ')})`);
    }
  }
}

/** 双语文案：只认 `{ zh, en }`，两份都必填且非空——配置文件里没有「先凑合」这回事（仓规第 7 条） */
function readBilingual(value, path) {
  if (!isObject(required(value, path))) {
    fail(`${path} must be an object with "zh" and "en" (a single string is not accepted)`);
  }
  // 这是 `ChatComponentText` 的 `{ zh, en }` 形状，不是 SDK 的语言枚举，所以不写成数组字面量
  // （test/extensionConfig.test.ts 的守卫禁止在本脚本里抄 SDK 枚举）
  for (const key of Object.keys(value)) {
    if (key !== 'zh' && key !== 'en') fail(`${path}.${key} is not a recognized option (allowed: zh, en)`);
  }
  return {
    zh: readString(required(value.zh, `${path}.zh`), `${path}.zh`),
    en: readString(required(value.en, `${path}.en`), `${path}.en`)
  };
}

function readEndpoint(value, path) {
  const raw = readString(required(value, path), path);
  let url;
  try {
    url = new URL(raw);
  } catch {
    return fail(`${path} must be an absolute http(s) URL`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') fail(`${path} must be an absolute http(s) URL`);
  return raw;
}

/** 组件名的规则与引擎构造期校验（`validateComponents`）同一个结论；对照测试见 test/hostComponents.test.ts */
function readComponentName(value, path) {
  const name = readString(required(value, path), path);
  if (!COMPONENT_NAME.test(name) || name.includes('__')) {
    fail(`${path} must match ^[a-z][a-z0-9_]{0,39}$ and must not contain "__"`);
  }
  return name;
}

/**
 * 只读 `hostComponents` 分节：每一项对应宿主的一次 `createHttpMessageComponent`。
 * **写了某一项就是宿主接入该组件**；分节缺席或为空数组即不接入，返回空数组。
 * 任何不合规的输入都抛 `ExtensionConfigError`，消息里带字段的完整路径。
 * @param {unknown} raw 整份 `config.json`
 * @returns {Array<{ name: string, label: { zh: string, en: string }, endpoint: string,
 *   tips?: { zh: string, en: string }, description?: string, timeoutMs?: number }>}
 */
export function parseHostComponents(raw) {
  if (!isObject(raw)) fail('config must be an object');
  const section = raw.hostComponents;
  if (section === undefined) return [];
  if (!Array.isArray(section)) fail('hostComponents must be an array');

  /** 工具名 → 第一个暴露它的条目下标：重名与 `<name>_update_credentials` 相撞都在这里查 */
  const exposed = new Map();
  return section.map((item, index) => {
    const path = `hostComponents[${index}]`;
    if (!isObject(item)) fail(`${path} must be an object`);
    rejectUnknownKeys(item, HOST_COMPONENT_KEYS, path);

    const name = readComponentName(item.name, `${path}.name`);
    for (const tool of [name, `${name}${UPDATE_CREDENTIALS_SUFFIX}`]) {
      const owner = exposed.get(tool);
      if (owner !== undefined) {
        fail(`${path}.name "${name}" exposes the tool name "${tool}", which hostComponents[${owner}] already exposes`);
      }
      exposed.set(tool, index);
    }

    const entry = {
      name,
      label: readBilingual(item.label, `${path}.label`),
      endpoint: readEndpoint(item.endpoint, `${path}.endpoint`)
    };
    if (item.tips !== undefined) entry.tips = readBilingual(item.tips, `${path}.tips`);
    if (item.description !== undefined) entry.description = readString(item.description, `${path}.description`);
    if (item.timeoutMs !== undefined) {
      if (!Number.isInteger(item.timeoutMs) || item.timeoutMs < 1000) {
        fail(`${path}.timeoutMs must be an integer of at least 1000 (milliseconds)`);
      }
      entry.timeoutMs = item.timeoutMs;
    }
    return entry;
  });
}

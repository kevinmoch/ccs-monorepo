/**
 * `config.json` 里**扩展独有**的 `manifest` 覆写。
 *
 * 通用配置面（模型、沙箱、外观……）已经归 `@webskill/chatbot/config`，
 * 这里只剩 MV3 专属的三项：`name` / `version` / `description`。
 *
 * 它必须继续是 `.mjs`：`vite.config.ts` 在顶部 import 它来算 manifest，
 * 那时 vite 的 alias 还没建立，import 不了 TS 源码。
 * 也刻意**不 import SDK**——manifest 覆写与 `RuntimeConfig` 无关，
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

/**
 * 只读 `manifest` 分节，其余顶层键交给 SDK 解析器（构建期由 vite 插件跑）。
 * 缺席即无覆写；只把出现过的键写进结果，其余保留 `manifest.json` 里的原值。
 * @param {unknown} raw 整份 `config.json`
 * @returns {Record<string, string>}
 */
export function parseManifestOverrides(raw) {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) fail('config must be an object');
  const section = raw.manifest;
  if (section === undefined) return {};
  if (typeof section !== 'object' || section === null || Array.isArray(section)) fail('manifest must be an object');
  for (const key of Object.keys(section)) {
    if (!['name', 'version', 'description'].includes(key)) {
      fail(`manifest.${key} is not a recognized option (allowed: name, version, description)`);
    }
  }
  const out = {};
  if (section.name !== undefined) out.name = readString(section.name, 'manifest.name');
  if (section.version !== undefined) out.version = readManifestVersion(section.version, 'manifest.version');
  if (section.description !== undefined) out.description = readString(section.description, 'manifest.description');
  return out;
}

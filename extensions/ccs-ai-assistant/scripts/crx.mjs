/**
 * CRX 打包的纯逻辑与薄薄一层 Chrome 调用（0.26.0 分册 16）。
 *
 * 为什么用 Chrome 自己的 `--pack-extension` 而不是在 Node 里签 CRX3：
 * 私钥本来就由 Chrome 命令生成，打包交给同一个实现，少一个依赖，也不会与 Chrome 的签名格式产生偏差。
 *
 * 必须保持 `.mjs`：它由 `scripts/packCrx.mjs` 直接用 node 跑，不经过 vite。
 */
import { execFileSync } from 'node:child_process';
import { createHash, createPrivateKey, createPublicKey } from 'node:crypto';
import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

export class CrxBuildError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CrxBuildError';
  }
}

function fail(message) {
  throw new CrxBuildError(message);
}

/** Chrome 的扩展 ID：公钥（SPKI DER）的 SHA-256 前 16 字节，每个半字节映射成 a–p */
export function extensionIdFromPublicKeyDer(der) {
  const head = createHash('sha256').update(der).digest().subarray(0, 16);
  let id = '';
  for (const byte of head) id += String.fromCharCode(97 + (byte >> 4), 97 + (byte & 15));
  return id;
}

/** `manifest.json` 里 `key` 字段（base64 的 SPKI DER）对应的 ID——文件夹安装用的就是它 */
export function extensionIdFromManifestKey(base64Key) {
  return extensionIdFromPublicKeyDer(Buffer.from(base64Key, 'base64'));
}

export function extensionIdFromPem(pem) {
  let privateKey;
  try {
    privateKey = createPrivateKey(pem);
  } catch {
    return fail('The key file is not a valid PEM private key.');
  }
  return extensionIdFromPublicKeyDer(createPublicKey(privateKey).export({ type: 'spki', format: 'der' }));
}

export function crxFileName(version) {
  return `ccs-ai-assistant-${version}.crx`;
}

/**
 * 打包副本用的 manifest：去掉 `key`（ID 由私钥决定，留着旧 `key` 就是「清单说的 ID 与签名的 ID 不一致」），
 * 且必须带 `update_url`——没有它，装好的扩展永远不会自动更新。
 */
export function stageManifest(manifest) {
  if (typeof manifest.update_url !== 'string' || manifest.update_url === '') {
    fail(
      'manifest.json has no update_url, so an installed CRX could never update itself. ' +
        'Set "manifest": { "update_url": "https://…/updates.xml" } in config.json and rebuild.'
    );
  }
  const { key: _key, ...rest } = manifest;
  return rest;
}

function parseHttpUrl(value, what) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return fail(`${what} must be an absolute http(s) URL.`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') fail(`${what} must be an absolute http(s) URL.`);
  return url;
}

/** CRX 文件的下载地址：默认与 `update_url` 同目录，`--base-url` 可改（它是目录，缺尾斜杠就补上） */
export function codebaseFor(updateUrl, fileName, baseUrl) {
  if (baseUrl === undefined) return new URL(fileName, parseHttpUrl(updateUrl, 'update_url')).href;
  parseHttpUrl(baseUrl, '--base-url');
  return new URL(fileName, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`).href;
}

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

/** Chrome 文档要求 `codebase` 是 HTTPS；本机回环地址放行，方便先在本机验证自动更新 */
export function codebaseWarning(codebase) {
  const url = new URL(codebase);
  if (url.protocol === 'https:' || LOOPBACK.has(url.hostname)) return undefined;
  return `codebase ${codebase} is not HTTPS; Chrome's documentation requires HTTPS for update downloads.`;
}

const xmlAttr = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

export function buildUpdatesXml({ appId, version, codebase }) {
  return [
    "<?xml version='1.0' encoding='UTF-8'?>",
    "<gupdate xmlns='http://www.google.com/update2/response' protocol='2.0'>",
    `  <app appid='${xmlAttr(appId)}'>`,
    `    <updatecheck codebase='${xmlAttr(codebase)}' version='${xmlAttr(version)}' />`,
    '  </app>',
    '</gupdate>',
    ''
  ].join('\n');
}

/** 私钥落在 dist 之内就会随产物分发出去，拒绝 */
export function assertKeyOutsideDist(keyPath, distDir) {
  const rel = relative(resolve(distDir), resolve(keyPath));
  if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) {
    fail(`The key file must not be inside the build output (${distDir}); it would be shipped with the extension.`);
  }
}

function chromeCandidates(platform, env) {
  if (platform === 'darwin') {
    return [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Chromium.app/Contents/MacOS/Chromium'
    ];
  }
  if (platform === 'win32') {
    const bases = [env.PROGRAMFILES, env['PROGRAMFILES(X86)'], env.LOCALAPPDATA].filter(Boolean);
    return bases.flatMap((base) => [
      join(base, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      join(base, 'Microsoft', 'Edge', 'Application', 'msedge.exe')
    ]);
  }
  return [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge'
  ];
}

/** `CHROME_PATH` 优先；否则按平台依次找 Chrome、Edge、Chromium */
export function findChrome({ env = process.env, platform = process.platform, exists = existsSync } = {}) {
  const explicit = env.CHROME_PATH;
  if (explicit !== undefined && explicit !== '') {
    if (!exists(explicit)) fail(`CHROME_PATH points to a file that does not exist: ${explicit}`);
    return explicit;
  }
  const found = chromeCandidates(platform, env).find((candidate) => exists(candidate));
  if (found === undefined) {
    fail('Could not find Chrome, Edge or Chromium. Set CHROME_PATH to the browser executable and retry.');
  }
  return found;
}

/**
 * 用独立的临时 `--user-data-dir` 跑 Chrome 的打包命令：不依赖、也不干扰正在运行的浏览器。
 * 没给私钥时 Chrome 会在扩展目录旁生成 `<目录>.pem`。
 */
export function runChromePack({ chrome, extensionDir, keyPath }) {
  const profile = mkdtempSync(join(tmpdir(), 'webskill-crx-profile-'));
  try {
    const args = [`--user-data-dir=${profile}`, '--no-first-run', `--pack-extension=${extensionDir}`];
    if (keyPath !== undefined) args.push(`--pack-extension-key=${keyPath}`);
    try {
      execFileSync(chrome, args, { stdio: 'pipe', timeout: 180_000 });
    } catch (error) {
      const detail = (error.stderr?.toString() ?? error.message).trim().split('\n').slice(-3).join(' | ');
      return fail(`Chrome could not pack the extension: ${detail}`);
    }
    const crx = `${extensionDir}.crx`;
    if (!existsSync(crx)) fail(`Chrome finished without producing ${crx}.`);
    return crx;
  } finally {
    rmSync(profile, { recursive: true, force: true });
  }
}

function assertCrx3(bytes, path) {
  if (bytes.subarray(0, 4).toString('latin1') !== 'Cr24' || bytes.readUInt32LE(4) !== 3) {
    fail(`${path} is not a CRX3 file.`);
  }
}

/**
 * 创建私钥：让 Chrome 对一个最小的临时扩展跑一次打包，把它顺手生成的 `.pem` 取走。
 * 目标已存在就拒绝：换私钥等于换扩展 ID，已安装的用户从此收不到更新。
 */
export function createKey({ keyPath, chrome }) {
  if (existsSync(keyPath)) {
    fail(
      `${keyPath} already exists. Replacing the key would give the extension a new ID, ` +
        'and installed copies would never receive updates. Delete it yourself if that is really what you want.'
    );
  }
  const work = mkdtempSync(join(tmpdir(), 'webskill-crx-key-'));
  try {
    const extensionDir = join(work, 'ext');
    mkdirSync(extensionDir);
    writeFileSync(
      join(extensionDir, 'manifest.json'),
      JSON.stringify({ manifest_version: 3, name: 'webskill-key-generator', version: '1.0.0' })
    );
    runChromePack({ chrome, extensionDir });
    const generated = `${extensionDir}.pem`;
    if (!existsSync(generated)) fail('Chrome did not generate a key file.');
    mkdirSync(dirname(keyPath), { recursive: true });
    copyFileSync(generated, keyPath);
    chmodSync(keyPath, 0o600);
    return { keyPath, id: extensionIdFromPem(readFileSync(keyPath, 'utf8')) };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

/**
 * 把 `dist/` 打成 CRX 并写出 `updates.xml`。所有能提前判定的条件（manifest、私钥、地址）
 * 都在动手之前检查，失败时不留下半成品。
 */
export function packExtension({ distDir, keyPath, outDir, baseUrl, chrome }) {
  const manifestPath = join(distDir, 'manifest.json');
  if (!existsSync(manifestPath)) fail(`${manifestPath} not found. Build the extension first (pnpm build).`);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const staged = stageManifest(manifest);

  if (!existsSync(keyPath)) {
    fail(`Key file not found: ${keyPath}. Create it once with: pnpm crx:key (it uses Chrome's own pack command).`);
  }
  assertKeyOutsideDist(keyPath, distDir);
  const id = extensionIdFromPem(readFileSync(keyPath, 'utf8'));
  const folderId = typeof manifest.key === 'string' ? extensionIdFromManifestKey(manifest.key) : undefined;

  const fileName = crxFileName(manifest.version);
  const codebase = codebaseFor(manifest.update_url, fileName, baseUrl);
  const warning = codebaseWarning(codebase);

  const work = mkdtempSync(join(tmpdir(), 'webskill-crx-stage-'));
  try {
    const extensionDir = join(work, 'ext');
    cpSync(distDir, extensionDir, { recursive: true });
    writeFileSync(join(extensionDir, 'manifest.json'), `${JSON.stringify(staged, null, 2)}\n`);
    const packed = runChromePack({ chrome, extensionDir, keyPath });
    const bytes = readFileSync(packed);
    assertCrx3(bytes, packed);

    mkdirSync(outDir, { recursive: true });
    const crxPath = join(outDir, fileName);
    const xmlPath = join(outDir, 'updates.xml');
    writeFileSync(crxPath, bytes);
    writeFileSync(xmlPath, buildUpdatesXml({ appId: id, version: manifest.version, codebase }));
    return {
      id,
      folderId,
      version: manifest.version,
      crxPath,
      xmlPath,
      codebase,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      warnings: warning === undefined ? [] : [warning]
    };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

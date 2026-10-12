import { generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CrxBuildError,
  assertKeyOutsideDist,
  buildUpdatesXml,
  codebaseFor,
  codebaseWarning,
  createKey,
  crxFileName,
  extensionIdFromManifestKey,
  extensionIdFromPem,
  findChrome,
  packExtension,
  stageManifest
} from '../scripts/crx.mjs';

/**
 * 0.26.0 分册 16 · AC-16.2～16.5：CRX 打包里不需要真浏览器就能判定的部分。
 * 需要 Chrome 的那一半（真打包、解开看 manifest）在 crxPack.integration.test.ts。
 */

const manifestOnDisk = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8')) as {
  key: string;
};

/** 真 Chromium 加载带这个 `key` 的扩展时报出的 ID（2026-10-11 探针实测），是独立于本实现的对照值 */
const KNOWN_FOLDER_ID = 'nonkkoafefehaoigcefkjkbmnodcbcoe';

const scratch: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'webskill-crx-test-'));
  scratch.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function writeKey(dir: string): string {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const keyPath = join(dir, 'keys', 'extension.pem');
  mkdirSync(join(dir, 'keys'));
  writeFileSync(keyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }));
  return keyPath;
}

function writeDist(dir: string, manifest: Record<string, unknown>): string {
  const dist = join(dir, 'dist');
  mkdirSync(dist);
  writeFileSync(join(dist, 'manifest.json'), JSON.stringify(manifest));
  writeFileSync(join(dist, 'background.js'), '// noop');
  return dist;
}

const baseManifest = {
  manifest_version: 3,
  name: 'WebSkill Extension',
  version: '1.2.3',
  key: manifestOnDisk.key,
  update_url: 'https://updates.example.test/webskill/updates.xml',
  permissions: ['storage']
};

describe('AC-16.2 扩展 ID 的推导', () => {
  it('现有 manifest 的 key 推出 Chromium 实测报出的 ID', () => {
    expect(extensionIdFromManifestKey(manifestOnDisk.key)).toBe(KNOWN_FOLDER_ID);
  });

  it('私钥 PEM 与它的公钥 DER 推出同一个 ID，且是 32 个 a–p 字符', () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
    const der = publicKey.export({ type: 'spki', format: 'der' });
    const id = extensionIdFromPem(pem);
    expect(id).toBe(extensionIdFromManifestKey(der.toString('base64')));
    expect(id).toMatch(/^[a-p]{32}$/);
  });

  it('不是私钥的内容给出带指引的结构化错误', () => {
    expect(() => extensionIdFromPem('not a key')).toThrow(CrxBuildError);
    expect(() => extensionIdFromPem('not a key')).toThrow(/not a valid PEM private key/);
  });
});

describe('AC-16.3 打包副本的 manifest', () => {
  it('去掉 key、保留 update_url 与其余字段，且不改动入参', () => {
    const input = structuredClone(baseManifest);
    const staged = stageManifest(input);
    expect(staged).not.toHaveProperty('key');
    expect(staged).toEqual({
      manifest_version: 3,
      name: 'WebSkill Extension',
      version: '1.2.3',
      update_url: baseManifest.update_url,
      permissions: ['storage']
    });
    expect(input).toEqual(baseManifest);
  });

  it('没有 update_url 就拒绝，并指向 config.json 的写法', () => {
    const { update_url: _omitted, ...withoutUrl } = baseManifest;
    expect(() => stageManifest(withoutUrl)).toThrow(/no update_url.*config\.json/);
    expect(() => stageManifest({ ...baseManifest, update_url: '' })).toThrow(/no update_url/);
  });
});

describe('AC-16.4 updates.xml 与下载地址', () => {
  it('三项正确：appid、version、codebase', () => {
    const xml = buildUpdatesXml({
      appId: 'abcdefghijklmnopabcdefghijklmnop',
      version: '1.2.3',
      codebase: 'https://updates.example.test/webskill/webskill-extension-1.2.3.crx'
    });
    expect(xml).toContain("<gupdate xmlns='http://www.google.com/update2/response' protocol='2.0'>");
    expect(xml).toContain("<app appid='abcdefghijklmnopabcdefghijklmnop'>");
    expect(xml).toContain(
      "<updatecheck codebase='https://updates.example.test/webskill/webskill-extension-1.2.3.crx' version='1.2.3' />"
    );
  });

  it('属性值里的特殊字符被转义', () => {
    const xml = buildUpdatesXml({ appId: 'a', version: '1', codebase: "https://h.test/x.crx?a=1&b='2'" });
    expect(xml).toContain("codebase='https://h.test/x.crx?a=1&amp;b=&apos;2&apos;'");
  });

  it('默认与 update_url 同目录；--base-url 是目录，缺尾斜杠也成立', () => {
    const name = crxFileName('1.2.3');
    expect(name).toBe('webskill-extension-1.2.3.crx');
    expect(codebaseFor('https://u.test/a/b/updates.xml', name)).toBe('https://u.test/a/b/webskill-extension-1.2.3.crx');
    expect(codebaseFor('https://u.test/a/updates.xml', name, 'https://cdn.test/files/')).toBe(
      'https://cdn.test/files/webskill-extension-1.2.3.crx'
    );
    expect(codebaseFor('https://u.test/a/updates.xml', name, 'https://cdn.test/files')).toBe(
      'https://cdn.test/files/webskill-extension-1.2.3.crx'
    );
    expect(() => codebaseFor('https://u.test/a/updates.xml', name, 'ftp://cdn.test/')).toThrow(/--base-url/);
  });

  it('非 https 且非回环地址给出警告，https 与本机回环不警告', () => {
    expect(codebaseWarning('https://u.test/x.crx')).toBeUndefined();
    expect(codebaseWarning('http://localhost:8080/x.crx')).toBeUndefined();
    expect(codebaseWarning('http://127.0.0.1:8080/x.crx')).toBeUndefined();
    expect(codebaseWarning('http://u.test/x.crx')).toMatch(/not HTTPS/);
  });
});

describe('AC-16.5 失败时带指引且不产出任何文件', () => {
  const chrome = '/nonexistent/chrome';

  it('缺 dist', () => {
    const dir = tempDir();
    expect(() =>
      packExtension({ distDir: join(dir, 'dist'), keyPath: writeKey(dir), outDir: join(dir, 'release'), chrome })
    ).toThrow(/Build the extension first/);
    expect(existsSync(join(dir, 'release'))).toBe(false);
  });

  it('缺 update_url', () => {
    const dir = tempDir();
    const { update_url: _omitted, ...withoutUrl } = baseManifest;
    const distDir = writeDist(dir, withoutUrl);
    expect(() => packExtension({ distDir, keyPath: writeKey(dir), outDir: join(dir, 'release'), chrome })).toThrow(
      /no update_url/
    );
    expect(existsSync(join(dir, 'release'))).toBe(false);
  });

  it('缺私钥：指向 crx:key，而不是悄悄新建一把', () => {
    const dir = tempDir();
    const distDir = writeDist(dir, baseManifest);
    const keyPath = join(dir, 'keys', 'extension.pem');
    expect(() => packExtension({ distDir, keyPath, outDir: join(dir, 'release'), chrome })).toThrow(/pnpm crx:key/);
    expect(existsSync(keyPath)).toBe(false);
    expect(existsSync(join(dir, 'release'))).toBe(false);
  });

  it('私钥落在 dist 之内', () => {
    const dir = tempDir();
    const distDir = writeDist(dir, baseManifest);
    const keyPath = join(distDir, 'extension.pem');
    writeFileSync(keyPath, readFileSync(writeKey(dir)));
    expect(() => packExtension({ distDir, keyPath, outDir: join(dir, 'release'), chrome })).toThrow(
      /must not be inside the build output/
    );
    expect(() => assertKeyOutsideDist(join(dir, 'keys', 'x.pem'), distDir)).not.toThrow();
    expect(() => assertKeyOutsideDist(distDir, distDir)).toThrow(CrxBuildError);
  });

  it('crx:key 目标已存在：拒绝覆盖，原文件一字节不变', () => {
    const dir = tempDir();
    const keyPath = writeKey(dir);
    const before = readFileSync(keyPath);
    expect(() => createKey({ keyPath, chrome })).toThrow(/already exists.*new ID/);
    expect(readFileSync(keyPath)).toEqual(before);
  });

  it('找不到浏览器时说清怎么指定', () => {
    expect(() => findChrome({ env: {}, platform: 'linux', exists: () => false })).toThrow(/Set CHROME_PATH/);
    expect(() => findChrome({ env: { CHROME_PATH: '/nope' }, platform: 'linux', exists: () => false })).toThrow(
      /CHROME_PATH points to a file that does not exist/
    );
  });

  it('CHROME_PATH 优先，其次按平台顺序取第一个存在的', () => {
    expect(findChrome({ env: { CHROME_PATH: '/x/chrome' }, platform: 'linux', exists: () => true })).toBe('/x/chrome');
    const mac = findChrome({
      env: {},
      platform: 'darwin',
      exists: (path) => path.includes('Microsoft Edge') || path.includes('Chromium')
    });
    expect(mac).toContain('Microsoft Edge');
    const win = findChrome({
      env: { PROGRAMFILES: 'C:\\Program Files' },
      platform: 'win32',
      exists: (path) => path.endsWith('chrome.exe')
    });
    expect(win).toContain('chrome.exe');
  });
});

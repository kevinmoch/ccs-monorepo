import { generateKeyPairSync } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CrxBuildError,
  createKey,
  extensionIdFromManifestKey,
  extensionIdFromPem,
  findChrome,
  packExtension
} from '../scripts/crx.mjs';

/**
 * 0.26.0 分册 16 · AC-16.6：用真的 Chrome / Chromium 打包。
 *
 * 找不到浏览器时跳过并**打印原因**（不能静默 return——那会被报成 passed）。
 * 浏览器的来源：`CHROME_PATH` → 系统里的 Chrome / Edge / Chromium（本工程不装 Playwright，没有上游那一档兜底）。
 * 没有图形显示的 Linux（典型如 CI）上整机 Chrome 起不来，同样跳过并说明。
 */

async function locateBrowser(): Promise<string | undefined> {
  if (process.platform === 'linux' && !process.env['DISPLAY'] && !process.env['WAYLAND_DISPLAY']) {
    console.warn('[crxPack.integration] skipped: Linux without a display (DISPLAY / WAYLAND_DISPLAY unset)');
    return undefined;
  }
  try {
    return findChrome();
  } catch (error) {
    if (!(error instanceof CrxBuildError)) throw error;
  }
  console.warn('[crxPack.integration] skipped: no Chrome, Edge or Chromium found (set CHROME_PATH to run it)');
  return undefined;
}

const browser = await locateBrowser();

const manifestOnDisk = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8')) as {
  key: string;
};

const scratch: string[] = [];
afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function makeDist(version: string): { dir: string; distDir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'webskill-crx-it-'));
  scratch.push(dir);
  const distDir = join(dir, 'dist');
  mkdirSync(join(distDir, 'assets'), { recursive: true });
  writeFileSync(
    join(distDir, 'manifest.json'),
    JSON.stringify({
      manifest_version: 3,
      name: 'WebSkill Extension',
      version,
      key: manifestOnDisk.key,
      update_url: 'https://updates.example.test/webskill/updates.xml',
      permissions: ['storage']
    })
  );
  writeFileSync(join(distDir, 'background.js'), '// noop');
  writeFileSync(join(distDir, 'assets', 'chunk.js'), 'export const x = 1;');
  return { dir, distDir };
}

/** CRX3：`Cr24` + 版本 + 头长度 + 头（含签名公钥）+ zip 载荷 */
function splitCrx3(bytes: Buffer): { header: Buffer; payload: Uint8Array } {
  const headerLength = bytes.readUInt32LE(8);
  return { header: bytes.subarray(12, 12 + headerLength), payload: new Uint8Array(bytes.subarray(12 + headerLength)) };
}

describe.skipIf(browser === undefined)('AC-16.6 真浏览器打包', () => {
  it(
    'crx:key 生成的私钥可再次使用；CRX 内的 manifest 无 key、有 update_url；updates.xml 的 appid 与私钥一致',
    { timeout: 180_000 },
    async () => {
      const chrome = browser!;
      const { dir, distDir } = makeDist('1.2.3');
      const keyPath = join(dir, 'keys', 'extension.pem');

      const created = createKey({ keyPath, chrome });
      expect(created.keyPath).toBe(keyPath);
      const pem = readFileSync(keyPath, 'utf8');
      expect(pem).toContain('PRIVATE KEY');
      expect(created.id).toBe(extensionIdFromPem(pem));
      expect(() => createKey({ keyPath, chrome })).toThrow(/already exists/);
      expect(readFileSync(keyPath, 'utf8')).toBe(pem);

      const outDir = join(dir, 'release');
      const result = packExtension({ distDir, keyPath, outDir, chrome });
      expect(result.id).toBe(created.id);
      expect(result.version).toBe('1.2.3');
      expect(result.crxPath).toBe(join(outDir, 'webskill-extension-1.2.3.crx'));
      expect(result.codebase).toBe('https://updates.example.test/webskill/webskill-extension-1.2.3.crx');
      expect(result.folderId).toBe(extensionIdFromManifestKey(manifestOnDisk.key));
      expect(result.folderId).not.toBe(result.id);
      expect(result.warnings).toEqual([]);

      const bytes = readFileSync(result.crxPath);
      expect(bytes.subarray(0, 4).toString('latin1')).toBe('Cr24');
      expect(bytes.readUInt32LE(4)).toBe(3);

      const { header, payload } = splitCrx3(bytes);
      const files = unzipSync(payload);
      const packed = JSON.parse(strFromU8(files['manifest.json']!)) as Record<string, unknown>;
      expect(packed).not.toHaveProperty('key');
      expect(packed).toMatchObject({
        version: '1.2.3',
        update_url: 'https://updates.example.test/webskill/updates.xml',
        permissions: ['storage']
      });
      expect(
        Object.keys(files)
          .filter((name) => !name.endsWith('/'))
          .sort()
      ).toEqual(['assets/chunk.js', 'background.js', 'manifest.json']);

      // CRX 头里带着签名公钥，而扩展 ID 就是它的哈希：头里的公钥必须正是我们推出 ID 的那一把
      const { createPrivateKey, createPublicKey } = await import('node:crypto');
      const spki = createPublicKey(createPrivateKey(pem)).export({ type: 'spki', format: 'der' });
      expect(header.indexOf(spki)).toBeGreaterThanOrEqual(0);

      const xml = readFileSync(result.xmlPath, 'utf8');
      expect(xml).toContain(`appid='${created.id}'`);
      expect(xml).toContain("version='1.2.3'");
      expect(xml).toContain("codebase='https://updates.example.test/webskill/webskill-extension-1.2.3.crx'");

      // 同一把私钥打下一个版本：ID 不变，才会被已安装的副本当作更新
      const next = makeDist('1.2.4');
      const nextResult = packExtension({ distDir: next.distDir, keyPath, outDir: join(next.dir, 'release'), chrome });
      expect(nextResult.id).toBe(created.id);
      expect(readFileSync(nextResult.xmlPath, 'utf8')).toContain("version='1.2.4'");
    }
  );

  it('用户自备的私钥（非 Chrome 生成）同样可用', { timeout: 120_000 }, () => {
    const { dir, distDir } = makeDist('2.0.0');
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    mkdirSync(join(dir, 'keys'));
    const keyPath = join(dir, 'keys', 'own.pem');
    writeFileSync(keyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }));
    const result = packExtension({
      distDir,
      keyPath,
      outDir: join(dir, 'release'),
      baseUrl: 'https://cdn.example.test/ext',
      chrome: browser!
    });
    expect(result.id).toBe(extensionIdFromPem(readFileSync(keyPath, 'utf8')));
    expect(result.codebase).toBe('https://cdn.example.test/ext/webskill-extension-2.0.0.crx');
  });
});

#!/usr/bin/env node
/**
 * 把构建产物 `dist/` 打成 CRX（0.26.0 分册 16）。
 *
 *   pnpm crx:key                      首次：用 Chrome 的打包命令生成私钥 keys/extension.pem（已存在则拒绝）
 *   pnpm build:crx [-- 选项]          构建后打包：release/ccs-ai-assistant-<版本>.crx + release/updates.xml
 *
 * 选项：--key <路径>  --out <目录>  --base-url <CRX 所在目录的地址>
 * 环境变量：CHROME_PATH 指定浏览器可执行文件（缺省按平台找 Chrome、Edge、Chromium）
 *
 * 私钥决定扩展 ID：同一把私钥打出来的 CRX 才会被已安装的副本当作「更新」。请妥善保管、不要入库。
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { CrxBuildError, createKey, findChrome, packExtension } from './crx.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function main() {
  const { values } = parseArgs({
    options: {
      key: { type: 'string' },
      out: { type: 'string' },
      'base-url': { type: 'string' },
      'create-key': { type: 'boolean', default: false }
    },
    allowPositionals: false
  });
  const keyPath = resolve(values.key ?? `${root}/keys/extension.pem`);
  const chrome = findChrome();

  if (values['create-key']) {
    const { id } = createKey({ keyPath, chrome });
    console.log(`Key created: ${keyPath}`);
    console.log(`Extension ID for this key: ${id}`);
    console.log('Keep this file safe and out of git: the same key must sign every future release.');
    return;
  }

  const result = packExtension({
    distDir: `${root}/dist`,
    keyPath,
    outDir: resolve(values.out ?? `${root}/release`),
    ...(values['base-url'] !== undefined ? { baseUrl: values['base-url'] } : {}),
    chrome
  });

  console.log(`CRX         : ${result.crxPath}`);
  console.log(`updates.xml : ${result.xmlPath}`);
  console.log(`Version     : ${result.version}`);
  console.log(`SHA-256     : ${result.sha256}`);
  console.log(`codebase    : ${result.codebase}`);
  console.log(`Extension ID: ${result.id}`);
  if (result.folderId === undefined) {
    console.log('The built manifest has no "key", so there is no folder-install ID to compare with.');
  } else if (result.folderId === result.id) {
    console.log(`Folder-install ID: ${result.folderId} (same as the CRX).`);
    console.log('The CRX and the folder install are the SAME extension: they cannot be installed side by side.');
  } else {
    console.log(`Folder-install ID: ${result.folderId} (DIFFERENT from the CRX).`);
    console.log(
      'The CRX installs as a separate extension: its data does not carry over from the folder install. ' +
        'Export a backup (Settings > About & Diagnostics) from the old one and import it into the new one.'
    );
  }
  for (const warning of result.warnings) console.warn(`WARNING: ${warning}`);
}

try {
  main();
} catch (error) {
  if (error instanceof CrxBuildError) {
    console.error(`ERROR: ${error.message}`);
    process.exit(1);
  }
  throw error;
}

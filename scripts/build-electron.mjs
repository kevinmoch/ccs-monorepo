import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

// 加载 monorepo 根目录 .env
function loadRootEnv() {
  const envPath = join(root, '.env');
  if (!existsSync(envPath)) return {};
  const env = {};
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (key) env[key] = value;
  }
  return env;
}

const rootEnv = loadRootEnv();

const electronEnv = {
  ...process.env,
  ...rootEnv,
  CCS_WEB_DIST_DIR: join(root, 'dist', 'web'),
  CSC_IDENTITY_AUTO_DISCOVERY: process.env.CSC_IDENTITY_AUTO_DISCOVERY ?? 'false',
  ELECTRON_MIRROR: process.env.ELECTRON_MIRROR ?? 'https://npmmirror.com/mirrors/electron/',
  ELECTRON_BUILDER_BINARIES_MIRROR:
    process.env.ELECTRON_BUILDER_BINARIES_MIRROR ?? 'https://npmmirror.com/mirrors/electron-builder-binaries/'
};

const webResult = spawnSync('node', ['scripts/build-web.mjs'], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, ...rootEnv }
});

if (webResult.status !== 0) process.exit(webResult.status ?? 1);

// Electron 的 preload 通过 `?raw` 内联扩展的两个 MAIN world 脚本（main-world.js / dom-agent.js）。
// dom-agent.js 是 extensions/ccs-ai-proxy 由 @webskill/sdk 构建出的产物，先重建它，
// 避免内联进 preload 的是过时版本。
const extResult = spawnSync('pnpm', ['--filter', 'ccs-fetch-proxy', 'build'], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, ...rootEnv }
});

if (extResult.status !== 0) process.exit(extResult.status ?? 1);

const result = spawnSync('pnpm', ['--filter', 'ccs-framework', 'build:electron'], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: electronEnv
});
process.exit(result.status ?? 1);

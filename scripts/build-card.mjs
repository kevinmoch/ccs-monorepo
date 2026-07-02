import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
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
const appsDir = join(root, 'apps');
const distWebDir = join(root, 'dist', 'web');

// 收集所有需要构建卡片的模块
const modules = [];
for (const dir of readdirSync(appsDir)) {
  if (!dir.startsWith('ccs-module-')) continue;
  const packageFile = join(appsDir, dir, 'package.json');
  if (!existsSync(packageFile)) continue;
  const pkg = JSON.parse(readFileSync(packageFile, 'utf8'));
  if (!pkg.scripts?.['build:cards']) continue;

  modules.push({
    name: pkg.name ?? dir,
    outDir: join(distWebDir, dir),
    scripts: pkg.scripts
  });
}

if (modules.length === 0) {
  console.log('[ccs] no modules with cards found');
  process.exit(0);
}

// 确保 dist/web 目录存在
mkdirSync(distWebDir, { recursive: true });

for (const mod of modules) {
  // 确保模块输出目录存在
  mkdirSync(mod.outDir, { recursive: true });

  console.log(`\n[ccs] build ${mod.name} cards -> ${join(mod.outDir, 'cards')}`);
  const cardsResult = spawnSync('pnpm', ['--filter', mod.name, 'build:cards'], {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      ...rootEnv,
      CCS_CARD_OUT_DIR: join(mod.outDir, 'cards')
    }
  });
  if (cardsResult.status !== 0) process.exit(cardsResult.status ?? 1);
}

console.log(`\n[ccs] card build completed -> ${distWebDir}`);

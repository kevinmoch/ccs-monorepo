import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
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
const builds = [{ name: 'ccs-framework', outDir: distWebDir, base: '/', scripts: {} }];

for (const dir of readdirSync(appsDir)) {
  if (!dir.startsWith('ccs-module-')) continue;
  const packageFile = join(appsDir, dir, 'package.json');
  if (!existsSync(packageFile)) continue;
  const pkg = JSON.parse(readFileSync(packageFile, 'utf8'));
  builds.push({
    name: pkg.name ?? dir,
    outDir: join(distWebDir, dir),
    base: `/${dir}/`,
    scripts: pkg.scripts ?? {}
  });
}

rmSync(distWebDir, { recursive: true, force: true });
mkdirSync(distWebDir, { recursive: true });

for (const build of builds) {
  console.log(`\n[ccs] build ${build.name} -> ${build.outDir}`);
  const result = spawnSync('pnpm', ['--filter', build.name, 'build'], {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      ...rootEnv,
      CCS_WEB_OUT_DIR: build.outDir,
      CCS_WEB_BASE: build.base
    }
  });
  if (result.status !== 0) process.exit(result.status ?? 1);

  if (build.scripts['build:cards']) {
    console.log(`\n[ccs] build ${build.name} cards -> ${join(build.outDir, 'cards')}`);
    const cardsResult = spawnSync('pnpm', ['--filter', build.name, 'build:cards'], {
      cwd: root,
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: {
        ...process.env,
        ...rootEnv,
        CCS_CARD_OUT_DIR: join(build.outDir, 'cards')
      }
    });
    if (cardsResult.status !== 0) process.exit(cardsResult.status ?? 1);
  }
}

console.log(`\n[ccs] web build output: ${distWebDir}`);

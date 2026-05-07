import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const target = process.argv[2];
const allowed = new Set(['weixin', 'ios', 'android', 'harmony']);
if (!target || !allowed.has(target)) {
  console.error('Usage: node scripts/build-uniapp.mjs <weixin|ios|android|harmony>');
  process.exit(1);
}

const root = process.cwd();
const result = spawnSync('pnpm', ['--filter', 'ccs-uniapp', `build:${target}`], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: {
    ...process.env,
    CCS_REPO_ROOT: root,
    CCS_UNIAPP_OUT_DIR: join(root, 'dist', target)
  }
});
process.exit(result.status ?? 1);

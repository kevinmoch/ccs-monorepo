import { spawnSync } from 'node:child_process';
const target = process.argv[2];
const allowed = new Set(['weixin', 'ios', 'android', 'harmony']);
if (!target || !allowed.has(target)) {
  console.error('Usage: node scripts/build-uniapp.mjs <weixin|ios|android|harmony>');
  process.exit(1);
}
const result = spawnSync('pnpm', ['--filter', 'ccs-uniapp', `build:${target}`], { stdio: 'inherit', shell: process.platform === 'win32' });
process.exit(result.status ?? 1);

import { spawnSync } from 'node:child_process';

const root = process.cwd();

const env = {
  ...process.env,
};

const result = spawnSync('node', ['scripts/build-android.mjs'], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env,
});

process.exit(result.status ?? 1);

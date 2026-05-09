import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const root = process.cwd();

// Step 1: Build web assets (same as Electron build)
console.log('Building web assets...');
const webResult = spawnSync('node', ['scripts/build-web.mjs'], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (webResult.status !== 0) process.exit(webResult.status ?? 1);

// Step 2: Build Android APK via Capacitor
console.log('Building Android APK via Capacitor...');
const androidResult = spawnSync('pnpm', ['--filter', 'ccs-android', 'build'], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: {
    ...process.env,
    CCS_REPO_ROOT: root,
  },
});
process.exit(androidResult.status ?? 1);

import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const root = process.cwd();

// Step 1: Build web assets (same as Electron build)
console.log('Building web assets...');
const webResult = spawnSync('node', ['scripts/build-web.mjs'], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32'
});

if (webResult.status !== 0) process.exit(webResult.status ?? 1);

// Step 2: Rebuild the extension's MAIN-world artifacts (main-world.js / dom-agent.js).
// They get copied into the Android assets as document-start injection payloads,
// same reason as the Electron build: don't ship a stale dom-agent.
console.log('Building injection artifacts...');
const extResult = spawnSync('pnpm', ['--filter', 'ccs-fetch-proxy', 'build'], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32'
});

if (extResult.status !== 0) process.exit(extResult.status ?? 1);

// Step 3: Build Android APK via Capacitor
console.log('Building Android APK via Capacitor...');
const androidResult = spawnSync('pnpm', ['--filter', 'ccs-android', 'build'], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: {
    ...process.env,
    CCS_REPO_ROOT: root
  }
});
process.exit(androidResult.status ?? 1);

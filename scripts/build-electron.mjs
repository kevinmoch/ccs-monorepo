import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const root = process.cwd();
const electronEnv = {
  ...process.env,
  CCS_WEB_DIST_DIR: join(root, 'dist', 'web'),
  CSC_IDENTITY_AUTO_DISCOVERY: process.env.CSC_IDENTITY_AUTO_DISCOVERY ?? 'false',
  ELECTRON_MIRROR: process.env.ELECTRON_MIRROR ?? 'https://npmmirror.com/mirrors/electron/',
  ELECTRON_BUILDER_BINARIES_MIRROR: process.env.ELECTRON_BUILDER_BINARIES_MIRROR ?? 'https://npmmirror.com/mirrors/electron-builder-binaries/'
};

const webResult = spawnSync('node', ['scripts/build-web.mjs'], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32'
});

if (webResult.status !== 0) process.exit(webResult.status ?? 1);

const result = spawnSync('pnpm', ['--filter', 'ccs-framework', 'build:electron'], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: electronEnv
});
process.exit(result.status ?? 1);

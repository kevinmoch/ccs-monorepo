import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const root = process.cwd();
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
  env: {
    ...process.env,
    CCS_WEB_DIST_DIR: join(root, 'dist', 'web')
  }
});
process.exit(result.status ?? 1);

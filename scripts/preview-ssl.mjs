import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const DIST = join(process.cwd(), 'dist', 'web');
if (!existsSync(DIST)) {
  console.error('[ccs] Build output not found:', DIST);
  console.error('[ccs] Run pnpm build:web first.');
  process.exit(1);
}

const PORT = process.env.CCS_PREVIEW_PORT ?? '3000';

// Vite 8 removed the --https CLI flag; use a standalone config with
// @vitejs/plugin-basic-ssl (installed at monorepo root) instead.
const child = spawn(
  'npx',
  ['vite', 'preview', '--outDir', DIST, '--config', join(process.cwd(), 'vite.preview.config.mjs')],
  { stdio: 'inherit', shell: process.platform === 'win32' },
);

child.on('error', (err) => {
  console.error('[ccs] Failed to start preview server:', err);
  process.exit(1);
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});

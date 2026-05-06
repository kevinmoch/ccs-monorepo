import { spawnSync } from 'node:child_process';
const index = process.argv.indexOf('--cards');
const cards = index >= 0 ? process.argv[index + 1] : '';
if (!cards) { console.error('Usage: pnpm build:cards -- --cards sample-card'); process.exit(1); }
for (const card of cards.split(',').map((item) => item.trim()).filter(Boolean)) { for (const format of ['es', 'umd']) { const result = spawnSync('vite', ['build', '--config', 'vite.card.config.ts'], { stdio: 'inherit', shell: process.platform === 'win32', env: { ...process.env, CCS_CARD: card, CCS_FORMAT: format } }); if (result.status !== 0) process.exit(result.status ?? 1); } }

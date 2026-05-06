import { spawnSync } from 'node:child_process';
const cardsArgIndex = process.argv.indexOf('--cards');
const cards = cardsArgIndex >= 0 ? process.argv[cardsArgIndex + 1] : '';
if (!cards) {
  console.error('Usage: pnpm build:cards -- --cards user-stat,order-chart');
  process.exit(1);
}
for (const card of cards
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean)) {
  for (const format of ['es', 'umd']) {
    const result = spawnSync('vite', ['build', '--config', 'vite.card.config.ts'], {
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: { ...process.env, CCS_CARD: card, CCS_FORMAT: format }
    });
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}

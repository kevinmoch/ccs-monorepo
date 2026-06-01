import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const cardsArgIndex = process.argv.indexOf('--cards');
const cards = cardsArgIndex >= 0 ? process.argv[cardsArgIndex + 1] : '';
const cardNames = cards ? parseCards(cards) : discoverCards();

if (cardNames.length === 0) {
  console.log('[ccs] no cards found');
  process.exit(0);
}

for (const card of cardNames) {
  for (const format of ['es', 'umd']) {
    const result = spawnSync('vite', ['build', '--config', 'vite.card.config.ts'], {
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: { ...process.env, CCS_CARD: card, CCS_FORMAT: format }
    });
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}

function parseCards(cards) {
  return cards
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function discoverCards() {
  const cardsDir = join(process.cwd(), 'src', 'cards');
  if (!existsSync(cardsDir)) return [];

  return readdirSync(cardsDir)
    .filter((fileName) => fileName.endsWith('Card.vue'))
    .map((fileName) => fileName.slice(0, -'Card.vue'.length))
    .map(toKebabCase)
    .sort();
}

function toKebabCase(value) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
}

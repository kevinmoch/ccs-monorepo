import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';
import { resolve } from 'node:path';
const card = process.env.CCS_CARD;
const format = (process.env.CCS_FORMAT ?? 'es') as 'es' | 'umd';
if (!card) throw new Error('CCS_CARD is required when building a card bundle.');
const pascal = card
  .split('-')
  .map((part) => part[0].toUpperCase() + part.slice(1))
  .join('');
export default defineConfig({
  plugins: [vue(), tailwindcss()],
  build: {
    outDir: process.env.CCS_CARD_OUT_DIR ?? 'dist/cards',
    emptyOutDir: false,
    lib: { entry: resolve(__dirname, `src/cards/${pascal}Card.vue`), name: `${pascal}Card`, formats: [format], fileName: () => `${card}.${format === 'umd' ? 'umd' : 'esm'}.js`, cssFileName: card },
    rollupOptions: { external: ['vue'], output: { globals: { vue: 'Vue' } } }
  }
});

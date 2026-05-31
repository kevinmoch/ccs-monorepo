import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';
import { resolve } from 'node:path';
const card = process.env.CCS_CARD ?? 'user-stat';
const format = (process.env.CCS_FORMAT ?? 'es') as 'es' | 'umd';
const pascal = card.split('-').map((part) => part[0].toUpperCase() + part.slice(1)).join('');
export default defineConfig({ plugins: [vue()], build: { outDir: 'dist/cards', emptyOutDir: false, lib: { entry: resolve(__dirname, `src/cards/${pascal}Card.vue`), name: `${pascal}Card`, formats: [format], fileName: () => `${card}.${format === 'umd' ? 'umd' : 'esm'}.js` }, rollupOptions: { external: ['vue'], output: { globals: { vue: 'Vue' } } } } });

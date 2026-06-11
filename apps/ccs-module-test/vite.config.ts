import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const moduleName = pkg.name as string;

export default defineConfig(({ command }) => ({
  plugins: [vue(), tailwindcss()],
  base: process.env.CCS_WEB_BASE ?? (command === 'serve' ? `/${moduleName}/` : '/'),
  server: {
    port: 5174,
    host: '0.0.0.0',
    cors: true,
    headers: { 'Access-Control-Allow-Origin': '*' },
    warmup: {
      clientFiles: [
        './src/main.ts',
        './src/App.vue',
        './src/router/index.ts'
      ]
    }
  },
  optimizeDeps: { include: ['vue', 'vue-router', 'pinia', 'vue-i18n'] },
  build: { outDir: process.env.CCS_WEB_OUT_DIR ?? 'dist', sourcemap: true, emptyOutDir: !process.env.CCS_WEB_OUT_DIR }
}));
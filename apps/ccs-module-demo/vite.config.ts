import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';
export default defineConfig({
  plugins: [vue()],
  base: process.env.CCS_WEB_BASE ?? '/',
  server: { port: 5174, host: '0.0.0.0', cors: true, headers: { 'Access-Control-Allow-Origin': '*' } },
  build: { outDir: process.env.CCS_WEB_OUT_DIR ?? 'dist', sourcemap: true, emptyOutDir: !process.env.CCS_WEB_OUT_DIR }
});

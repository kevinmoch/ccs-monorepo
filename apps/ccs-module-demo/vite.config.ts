import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';
export default defineConfig({
  plugins: [vue()],
  base: '/',
  server: { port: 5174, host: '0.0.0.0', cors: true, headers: { 'Access-Control-Allow-Origin': '*' } },
  build: { outDir: 'dist', sourcemap: true }
});

import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';
export default defineConfig({ plugins: [vue()], server: { port: __MODULE_DEV_PORT__, host: '0.0.0.0', cors: true, headers: { 'Access-Control-Allow-Origin': '*' } }, build: { outDir: 'dist', sourcemap: true } });

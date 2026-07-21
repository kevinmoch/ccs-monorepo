import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, type PluginOption } from 'vite';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const moduleName = pkg.name as string;

export default defineConfig(({ command, mode }) => {
  const useSsl = process.env.CCS_DEV_SSL_MODULES === 'true';
  const plugins: PluginOption[] = [vue(), tailwindcss()];
  if (useSsl) {
    plugins.push(basicSsl());
  }

  const env = loadEnv(mode, fileURLToPath(new URL('../..', import.meta.url)), '');
  const ccsBaseUrl = env.CCS_BASE_URL || '';

  return {
    plugins,
    base: process.env.CCS_WEB_BASE ?? (command === 'serve' ? `/${moduleName}/` : '/'),
    define: {
      'import.meta.env.CCS_BASE_URL': JSON.stringify(ccsBaseUrl)
    },
    server: {
      port: __MODULE_DEV_PORT__,
      host: '0.0.0.0',
      cors: true,
      headers: { 'Access-Control-Allow-Origin': '*' },
      warmup: {
        clientFiles: ['./src/main.ts', './src/App.vue', './src/router/index.ts']
      }
    },
    optimizeDeps: { include: ['vue', 'vue-router', 'pinia', 'vue-i18n'] },
    build: {
      outDir: process.env.CCS_WEB_OUT_DIR ?? 'dist',
      emptyOutDir: !process.env.CCS_WEB_OUT_DIR,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) return 'vendor';
          }
        }
      }
    }
  };
});

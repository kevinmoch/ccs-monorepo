import basicSsl from '@vitejs/plugin-basic-ssl';

const useSsl = process.env.CCS_PREVIEW_SSL !== 'false';

/** @type {import('vite').UserConfig} */
export default {
  plugins: [
    ...(useSsl ? [basicSsl()] : []),
    {
      name: 'multi-spa-preview-fallback',
      configurePreviewServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.method !== 'GET' && req.method !== 'HEAD') {
            return next();
          }
          const urlStr = req.url.split('?')[0];
          // 如果是没有扩展名的请求，说明是前端路由，根据路径前缀重写到对应的子模块 index.html
          if (!urlStr.includes('.')) {
            const match = urlStr.match(/^\/(ccs-module-[^/]+)/);
            if (match) {
              const moduleName = match[1];
              req.url = `/${moduleName}/index.html${req.url.slice(urlStr.length)}`;
            }
          }
          next();
        });
      }
    }
  ],
  preview: {
    port: parseInt(process.env.CCS_PREVIEW_PORT ?? '3000', 10),
    host: '0.0.0.0',
    strictPort: true
  }
};

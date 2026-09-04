import basicSsl from '@vitejs/plugin-basic-ssl';
import { viewerCspHeader } from '@webskill/sdk/browser';

const useSsl = process.env.CCS_PREVIEW_SSL !== 'false';

/**
 * 文档投放面（viewer）的响应头。**这是宿主的部署责任**，不是纯客户端能力：
 * `sandbox` 指令只有走 HTTP 响应头才生效，写在 `<meta>` 里会被忽略。
 * 与 apps/ccs-framework/vite.config.ts 的 dev 版同源，这里是 preview 版（永远服务构建产物）。
 *
 * 路径按后缀/片段匹配而不是写死前缀：dist/web 下有两份 viewer——框架自己的 `/viewer.html`，
 * 以及文档产物的 `/dist-docs/viewer.html`，各自的资源目录也分别是 `/assets/` 与 `/dist-docs/assets/`。
 */
function viewerHeaders() {
  return {
    name: 'ccs-preview-viewer-headers',
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        const p = (req.url ?? '').split('?')[0] ?? '';
        if (p.endsWith('/viewer.html')) {
          // CSP 的来源必须和页面**实际**来源逐字符相同（协议 + 主机 + 端口），差一样脚本就全被拦、
          // 页面只剩静态外壳，握手永不返回。HTTP/2 不发 host 头，只有 :authority。
          const authority = req.headers[':authority'] ?? req.headers['host'];
          const host = typeof authority === 'string' && authority !== '' ? authority : undefined;
          if (host === undefined) {
            // 猜一个来源等于发一份必定对不上的 CSP：宁可不下发，也好过静默把 viewer 变成空白页
            throw new Error(
              'viewer route: request carries neither ":authority" nor "host"; cannot derive the CSP origin'
            );
          }
          const origin = `${req.socket?.encrypted === true ? 'https' : 'http'}://${host}`;
          const csp = viewerCspHeader({ hostOrigin: origin }).replace(
            `script-src ${origin}`,
            // 受信外壳里的 echarts（viewer 组件的 Chart）需要 eval；技能内容经 postMessage + innerHTML
            // 进入、其中 <script> 本就不执行，所以 eval 的实际受益方只有外壳自身
            `script-src ${origin} 'unsafe-eval'`
          );
          res.setHeader('Content-Security-Policy', csp);
        }
        // viewer 在 opaque origin 里，模块脚本带 crossorigin → Origin: null 的跨源请求，
        // 缺了这条头就直接 CORS 失败（页面一片空白）。构建产物是公开静态资源，放行跨源读取不新增暴露面。
        if (/(?:^|\/)assets\//.test(p)) {
          res.setHeader('Access-Control-Allow-Origin', '*');
        }
        next();
      });
    }
  };
}

/** @type {import('vite').UserConfig} */
export default {
  plugins: [
    ...(useSsl ? [basicSsl()] : []),
    viewerHeaders(),
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

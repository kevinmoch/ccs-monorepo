import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
// 0.56 的 package.json 把 `./*` 映射到 `./esm/vs/*.js`，路径里再写一遍 esm/vs 就解析不到
import editorWorker from 'monaco-editor/editor/editor.worker?worker';
import cssWorker from 'monaco-editor/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/language/html/html.worker?worker';
import jsonWorker from 'monaco-editor/language/json/json.worker?worker';
import tsWorker from 'monaco-editor/language/typescript/ts.worker?worker';

/**
 * console 的技能文件编辑器在 MV3 页面里的接线。
 *
 * `@monaco-editor/react` 默认让 loader 从 jsDelivr 注入一个 `<script>`，而扩展页的
 * CSP 是 `script-src 'self'`——那个标签会被直接拦掉，编辑器于是永远停在"加载中"，
 * 且不是渲染异常，`MonacoBoundary` 也接不住。这里改喂本地打包的实例，
 * worker 同样走打包出来的同源文件（`blob:` 在扩展页 CSP 下同样不可用）。
 *
 * **必须在 console 首次渲染文件编辑器之前调用**：`loader.config` 一旦晚于
 * `loader.init()`，本次会话仍旧走 CDN。
 */
export function configureLocalMonaco(): void {
  (self as unknown as { MonacoEnvironment: monaco.Environment }).MonacoEnvironment = {
    getWorker: (_workerId, label) => {
      switch (label) {
        case 'json':
          return new jsonWorker();
        case 'css':
        case 'scss':
        case 'less':
          return new cssWorker();
        case 'html':
        case 'handlebars':
        case 'razor':
          return new htmlWorker();
        case 'typescript':
        case 'javascript':
          return new tsWorker();
        default:
          return new editorWorker();
      }
    }
  };
  loader.config({ monaco });
}

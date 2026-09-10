import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const fromHere = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/**
 * MAIN world 脚本的独立构建（分册 15 FR-15.8 的 click 探针，0.21.0 分册 12 的 WebOffice 钩子）。
 *
 * 与内容脚本分开的原因和内容脚本与主构建分开的原因相同：iife 只允许单入口。
 * 这里**不配 SDK 别名**——这份代码跑在页面自己的 JS 世界里，
 * 它绝不能携带任何 SDK 代码，否则等于把 SDK 交到页面手上。
 * （仓库根 `test/webOfficeMirrors.test.ts` 里有一条守卫走遍本入口的源码目录搜 SDK import。）
 */
export default defineConfig({
  // 探明脚本（0.21.0 分册 12 FR-12.5a）默认不进产物：`false` 使那一支被消除。
  // 探明时 `WEBSKILL_WEBOFFICE_PROBE=1 pnpm build:src` 才把它构进去。
  define: {
    __WEBSKILL_WEBOFFICE_PROBE__: JSON.stringify(process.env['WEBSKILL_WEBOFFICE_PROBE'] === '1')
  },
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    rollupOptions: {
      input: fromHere('src/content/mainWorld/index.ts'),
      output: {
        format: 'iife',
        entryFileNames: 'probe.js',
        inlineDynamicImports: true
      }
    }
  }
});

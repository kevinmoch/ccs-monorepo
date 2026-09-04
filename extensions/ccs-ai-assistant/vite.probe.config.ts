import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const fromHere = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/**
 * click 监听器探针的独立构建（分册 15 FR-15.8）。
 *
 * 与内容脚本分开的原因和内容脚本与主构建分开的原因相同：iife 只允许单入口。
 * 这里**不配 SDK 别名**——探针跑在页面自己的 JS 世界里，
 * 它绝不能捎带任何 SDK 代码，否则等于把 SDK 交到页面手上。
 */
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    rollupOptions: {
      input: fromHere('src/content/probe.ts'),
      output: {
        format: 'iife',
        entryFileNames: 'probe.js',
        inlineDynamicImports: true
      }
    }
  }
});

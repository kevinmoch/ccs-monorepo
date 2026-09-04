import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
// @ts-expect-error -- 纯 JS 单一事实源，无需为构建脚本引入 d.ts
import { sdkAliasList } from './scripts/sdkAliases.mjs';

const fromHere = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/**
 * 内容脚本单独构建。
 *
 * MV3 的内容脚本**不支持 ES module**（`background` 支持，`content_scripts` 不支持），
 * 所以它必须是一个自包含的 IIFE。而 rollup 的 iife 格式只允许单入口，
 * 这就是它没法和 side panel / options / background 一起构建的原因——
 * 不是配置没写好，是两种输出格式互斥。
 */
export default defineConfig({
  resolve: { alias: sdkAliasList(fromHere) },
  build: {
    outDir: 'dist',
    // 主构建已经清过一次；这里再清会把它的产物删光
    emptyOutDir: false,
    rollupOptions: {
      input: fromHere('src/content/main.ts'),
      output: {
        format: 'iife',
        entryFileNames: 'content.js',
        inlineDynamicImports: true
      }
    }
  }
});

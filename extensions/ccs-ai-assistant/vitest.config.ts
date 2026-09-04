import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
// @ts-expect-error -- 纯 JS 单一事实源，无需为构建脚本引入 d.ts
import { sdkAliasList } from './scripts/sdkAliases.mjs';

const fromHere = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// 测试只需要别名解析：@webskill/* 内部包名 → @webskill/sdk 子路径 / 本地垫片。
// 构建相关的插件（tailwindcss、产物拷贝）不走测试通道，不在此挂载。
export default defineConfig({
  resolve: { alias: sdkAliasList(fromHere) },
  test: {
    include: ['test/**/*.test.{ts,tsx}']
  }
});

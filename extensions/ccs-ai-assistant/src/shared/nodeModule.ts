import * as React from 'react';

/**
 * `node:module` 的浏览器 shim。
 *
 * @webskill/* 的发布产物（dist）由 rolldown 打包，其共享 runtime chunk 在模块顶层执行
 * `createRequire(import.meta.url)`，用产出的 `require` 装载被打成 CJS 的依赖。
 * Vite 对浏览器构建会把 node 内建模块外部化成「无导出」的空壳，于是这行在扩展页面加载时
 * 直接抛 `(0, r.createRequire) is not a function`——side panel 一开就白屏。
 *
 * 这里给出最小可用实现：`require` 只在 CJS 依赖真正初始化时被调用，目前只需映射 `react`；
 * 其余 id 抛带明确信息的错误，便于发现后补映射。
 * 与 apps/ccs-framework/src/webskill/shims/nodeModule.ts 同因同法。
 */
const registry: Record<string, unknown> = {
  react: React
};

export function createRequire(_url: string | URL): (id: string) => unknown {
  return (id: string) => {
    const mod = registry[id];
    if (!mod) {
      throw new Error(`[node-module-shim] require("${id}") is not available in the browser bundle`);
    }
    return mod;
  };
}

export default { createRequire };

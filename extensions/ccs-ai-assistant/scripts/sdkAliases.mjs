/**
 * 扩展源码从 SDK 仓库复制而来，import 写的是 SDK 工作区里的内部包名
 * （@webskill/core、@webskill/runtime、@webskill/browser……）。这些包不单独发布，
 * 发布形态是单一的 `@webskill/sdk`，内部包经其子路径导出（与 packages/sdk/src/*.ts
 * 的 barrel 一一对应）。这张表把旧包名映射到发布包的子路径，vite 三份配置共用，
 * 免得每份各写一遍后悄悄漂移。
 *
 * 两个例外：
 * - `@webskill/ui-kit` 没有发布形态（chatbot/console 的发布产物把它 bundle 进去了），
 *   指向本扩展的本地垫片 src/shared/uiKit.tsx + ui-kit.css；
 * - `@webskill/chatbot` / `@webskill/console` 有独立发布包，不在表里，走正常解析。
 *
 * find 一律用锚定正则：字符串前缀匹配会让 '@webskill/ui' 吃掉 '@webskill/ui-kit'。
 *
 * @param {(p: string) => string} fromHere 把扩展目录相对路径解析成绝对路径
 */
export function sdkAliasList(fromHere) {
  return [
    { find: /^@webskill\/ui-kit\/ui-kit\.css$/, replacement: fromHere('src/shared/ui-kit.css') },
    { find: /^@webskill\/ui-kit$/, replacement: fromHere('src/shared/uiKit.tsx') },
    { find: /^@webskill\/core$/, replacement: '@webskill/sdk' },
    { find: /^@webskill\/runtime$/, replacement: '@webskill/sdk' },
    { find: /^@webskill\/browser$/, replacement: '@webskill/sdk/browser' },
    { find: /^@webskill\/agent$/, replacement: '@webskill/sdk/agent' },
    { find: /^@webskill\/mcp$/, replacement: '@webskill/sdk/mcp' },
    { find: /^@webskill\/governance$/, replacement: '@webskill/sdk/governance' },
    { find: /^@webskill\/ui$/, replacement: '@webskill/sdk/ui' }
  ];
}

/**
 * `node:*` 的浏览器 shim 表（只给浏览器构建用，测试通道不能挂——那边要的是真的 node 内建模块）。
 *
 * @webskill/sdk 的发布产物是按 node 条件打的：`ui-react.js` 直接 import `node:path`/`node:url`/
 * `node:process`（打进去的 vfile 走了 node 分支），共享 runtime chunk 还在模块顶层执行
 * `createRequire(import.meta.url)`。Vite 把这些外部化成空壳后，side panel 一加载就抛
 * `(0 , r.createRequire) is not a function`。chatbot 与 console 都 import `@webskill/sdk/ui-react`，
 * 这条链绕不开，只能把 node 内建模块换成浏览器实现。
 *
 * @param {(p: string) => string} fromHere 把扩展目录相对路径解析成绝对路径
 */
export function nodeShimAliasList(fromHere) {
  return [
    { find: /^node:module$/, replacement: fromHere('src/shared/nodeModule.ts') },
    { find: /^node:path$/, replacement: fromHere('src/shared/nodePath.ts') },
    { find: /^node:url$/, replacement: fromHere('src/shared/nodeUrl.ts') },
    { find: /^node:process$/, replacement: fromHere('src/shared/nodeProcess.ts') }
  ];
}

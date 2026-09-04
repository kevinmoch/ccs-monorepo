/**
 * `@webskill/node` 的浏览器空壳（扩展构建用）。
 *
 * governance 的 stores 子集只以 `import type` 引用 `@webskill/node`，运行期不需要它的任何实现；
 * 但打包器会把 type-only 说明符也记进依赖图，解析到 node 源码 —— 其 `env.ts` import `node:fs`，
 * 进浏览器即崩。type 引用在编译期已被擦除，因此这里不需要导出任何东西。
 *
 * 与 examples/chatbot-playground/nodeStub.ts 同因同法。
 */
export {};

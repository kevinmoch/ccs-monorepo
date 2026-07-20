// ─── 全局 CCS fetchProxy 类型声明 ──────────────────────────
// 任何 import '@ccs/shared' 的子模块自动获得 window.fetchProxy 的类型支持。
// 运行时实现在 ccs-framework/src/lib/fetch-proxy.ts 的 setupFetchProxy() 中注入。
export {};

declare global {
  interface Window {
    fetchProxy?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  }
}

export * from './event-bus';
export * from './i18n';
export * from './theme';
export * from './utils';
export * from './runtime';
export * from './storage';
export * from './attendance';
export * from './offline-docs';
export * from './offline-photos';
export * from './store';
export * from './composables/useRuntimeOptions';

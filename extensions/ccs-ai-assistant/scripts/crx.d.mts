/** `crx.mjs` 的类型声明：该模块由 node 直接跑（不经 vite），但 `test/crxPack.test.ts` 要 import 它 */

export declare class CrxBuildError extends Error {
  constructor(message: string);
}

export declare function extensionIdFromPublicKeyDer(der: Uint8Array): string;
export declare function extensionIdFromManifestKey(base64Key: string): string;
export declare function extensionIdFromPem(pem: string): string;
export declare function crxFileName(version: string): string;

/** 打包副本的 manifest：去掉 `key`，必须带 `update_url` */
export declare function stageManifest(manifest: Record<string, unknown>): Record<string, unknown>;
export declare function codebaseFor(updateUrl: string, fileName: string, baseUrl?: string): string;
export declare function codebaseWarning(codebase: string): string | undefined;
export declare function buildUpdatesXml(input: { appId: string; version: string; codebase: string }): string;
export declare function assertKeyOutsideDist(keyPath: string, distDir: string): void;

export declare function findChrome(options?: {
  env?: Record<string, string | undefined>;
  platform?: string;
  exists?: (path: string) => boolean;
}): string;
export declare function runChromePack(input: { chrome: string; extensionDir: string; keyPath?: string }): string;
export declare function createKey(input: { keyPath: string; chrome: string }): { keyPath: string; id: string };

export interface PackResult {
  id: string;
  /** 文件夹安装的 ID（由 manifest 的 `key` 推出）；manifest 没有 `key` 时缺省 */
  folderId?: string;
  version: string;
  crxPath: string;
  xmlPath: string;
  codebase: string;
  sha256: string;
  warnings: string[];
}
export declare function packExtension(input: {
  distDir: string;
  keyPath: string;
  outDir: string;
  baseUrl?: string;
  chrome: string;
}): PackResult;

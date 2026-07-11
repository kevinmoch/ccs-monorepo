/**
 * 跨平台本地存储底层原语 —— Web-only 构建替身文件（不依赖 Capacitor）。
 *
 * 本文件与 `native-fs.ts`（默认/完整版本）导出完全相同的符号，是它的"瘦身版"：
 * - Web OPFS 相关函数：保留真实实现（Web / Electron 构建实际会用到）
 * - Android 专用函数：替换为抛错的桩实现（Web-only 构建中 `isAndroidNative()`
 *   恒为 false，这些函数在运行时永远不会被调用，仅用于满足类型和打包解析）
 *
 * 用途：CI「仅构建 Web 应用」流水线中，用本文件整体替换 `native-fs.ts`
 * （`cp native-fs.web.ts native-fs.ts`），从而使构建过程无需安装
 * `@capacitor-community/file-opener`、`@capacitor/core`、`@capacitor/filesystem`
 * 三个 Capacitor 依赖包。此替换不影响 Electron / Android 构建 —— 它们使用未替换的
 * 默认 `native-fs.ts`，其中包含真实的 Capacitor 调用。
 *
 * ⚠️ 请勿手动修改本文件之外，还需要同步维护 `native-fs.ts` 中的导出符号一致。
 */

// ---------------------------------------------------------------------------
// 类型（与 native-fs.ts 保持一致）
// ---------------------------------------------------------------------------

export type AndroidFilesystemMethod = 'mkdir' | 'readdir' | 'readFile' | 'writeFile' | 'appendFile' | 'deleteFile' | 'stat' | 'getUri';

export type OpfsStorageManager = StorageManager & {
  getDirectory?: () => Promise<FileSystemDirectoryHandle>;
};

export type DirectoryWithEntries = FileSystemDirectoryHandle & {
  entries: () => AsyncIterableIterator<[string, FileSystemHandle]>;
};

// ---------------------------------------------------------------------------
// Capacitor 常量占位（Web-only 构建中从未被实际使用）
// ---------------------------------------------------------------------------

export const ANDROID_DIRECTORY_DATA = 'DATA';
export const ANDROID_ENCODING_UTF8 = 'utf8';

// ---------------------------------------------------------------------------
// Base64 / Blob 互转（平台无关，保留真实实现）
// ---------------------------------------------------------------------------

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  return bytesToBase64(new Uint8Array(buffer));
}

// ---------------------------------------------------------------------------
// 桥接判定（Web-only 构建中恒为 false）
// ---------------------------------------------------------------------------

export function shouldUseParentPostMessageBridge(): boolean {
  return false;
}

// ---------------------------------------------------------------------------
// Android 文件系统 —— 桩实现（Web-only 构建中不会被调用）
// ---------------------------------------------------------------------------

function androidUnsupported(): never {
  throw new Error('Android storage APIs are not available in the web-only build');
}

export function androidFilesystem<T = unknown>(_method: AndroidFilesystemMethod, _args: Record<string, unknown>): Promise<T> {
  return androidUnsupported();
}

export function androidOpenFile(_filePath: string, _contentType: string): Promise<void> {
  return androidUnsupported();
}

export function androidCaptureViaBridge(): Promise<{ base64: string; mimeType: string }> {
  return androidUnsupported();
}

export async function ensureAndroidDir(_path: string): Promise<void> {
  return androidUnsupported();
}

export async function readAndroidText(_path: string): Promise<string> {
  return androidUnsupported();
}

export async function writeAndroidText(_path: string, _text: string): Promise<void> {
  return androidUnsupported();
}

export async function readAndroidBinary(_path: string): Promise<Uint8Array> {
  return androidUnsupported();
}

export async function writeAndroidBinary(_path: string, _bytes: Uint8Array): Promise<void> {
  return androidUnsupported();
}

export async function deleteAndroidFile(_path: string): Promise<void> {
  return androidUnsupported();
}

export async function listAndroidFileNames(_path: string): Promise<string[]> {
  return androidUnsupported();
}

export async function getAndroidFileSize(_path: string): Promise<number> {
  return androidUnsupported();
}

export async function getAndroidDirectoryBytes(_path: string): Promise<number> {
  return androidUnsupported();
}

export async function getAndroidFileUri(_path: string): Promise<string> {
  return androidUnsupported();
}

export function androidConvertFileSrc(_uri: string): string {
  return androidUnsupported();
}

// ---------------------------------------------------------------------------
// Web OPFS 便捷封装（保留真实实现）
// ---------------------------------------------------------------------------

export function isWebOpfsAvailable(): boolean {
  return typeof navigator !== 'undefined' && typeof (navigator.storage as OpfsStorageManager | undefined)?.getDirectory === 'function';
}

export async function getOpfsRoot(rootDir: string): Promise<FileSystemDirectoryHandle> {
  if (!isWebOpfsAvailable()) throw new Error('OPFS unavailable');
  const storage = navigator.storage as OpfsStorageManager;
  const originRoot = await storage.getDirectory?.();
  if (!originRoot) throw new Error('OPFS unavailable');
  return originRoot.getDirectoryHandle(rootDir, { create: true });
}

export async function getOpfsSubDir(parent: FileSystemDirectoryHandle, name: string): Promise<FileSystemDirectoryHandle> {
  return parent.getDirectoryHandle(name, { create: true });
}

export async function writeOpfsText(directory: FileSystemDirectoryHandle, name: string, text: string): Promise<void> {
  const handle = await directory.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  await writable.write(text);
  await writable.close();
}

export async function writeOpfsBlob(directory: FileSystemDirectoryHandle, name: string, blob: Blob): Promise<void> {
  const handle = await directory.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
}

export async function readOpfsFile(directory: FileSystemDirectoryHandle, name: string): Promise<File> {
  const handle = await directory.getFileHandle(name);
  return handle.getFile();
}

export async function listOpfsFileNames(directory: FileSystemDirectoryHandle): Promise<string[]> {
  const names: string[] = [];
  for await (const [name, handle] of (directory as DirectoryWithEntries).entries()) {
    if (handle.kind === 'file') names.push(name);
  }
  return names;
}

export async function removeOpfsEntry(directory: FileSystemDirectoryHandle, name: string): Promise<void> {
  try {
    await directory.removeEntry(name);
  } catch {
    // 已清除
  }
}

export async function getOpfsDirectoryBytes(directory: FileSystemDirectoryHandle): Promise<number> {
  let total = 0;
  for await (const [, handle] of (directory as DirectoryWithEntries).entries()) {
    if (handle.kind === 'file') total += (await (handle as FileSystemFileHandle).getFile()).size;
  }
  return total;
}

export async function persistOpfsStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

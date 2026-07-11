/**
 * 跨平台本地存储底层原语 —— 供离线文档、离线照片等模块复用。
 *
 * Web / Electron 渲染进程 → OPFS (Origin Private File System)
 * Android（iframe 子页面）→ postMessage 桥接到父壳的 Capacitor Filesystem
 * Android（直连原生）     → 直接调用 Capacitor Filesystem 插件
 *
 * 本模块只提供与业务无关的存储原语，不包含任何文档 / 照片的领域逻辑。
 */

import { FileOpener } from '@capacitor-community/file-opener';
import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import i18next from 'i18next';
import { isAndroidNative } from '../runtime';

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

export type AndroidFilesystemMethod = 'mkdir' | 'readdir' | 'readFile' | 'writeFile' | 'appendFile' | 'deleteFile' | 'stat' | 'getUri';

type AndroidFilesystemResponse<T> = {
  type: 'CCS_ANDROID_FS_RESPONSE';
  id: string;
  result?: T;
  error?: string;
};

type AndroidFileOpenResponse = {
  type: 'CCS_ANDROID_FILE_OPEN_RESPONSE';
  id: string;
  error?: string;
};

type AndroidCameraResponse = {
  type: 'CCS_ANDROID_CAMERA_RESPONSE';
  id: string;
  base64?: string;
  mimeType?: string;
  error?: string;
};

export type OpfsStorageManager = StorageManager & {
  getDirectory?: () => Promise<FileSystemDirectoryHandle>;
};

export type DirectoryWithEntries = FileSystemDirectoryHandle & {
  entries: () => AsyncIterableIterator<[string, FileSystemHandle]>;
};

// ---------------------------------------------------------------------------
// Capacitor 常量导出（供其他模块间接引用，避免直接 import @capacitor/filesystem）
// ---------------------------------------------------------------------------

/**
 * `Directory.Data` 的重导出。其他模块（如 offline-docs/opfs.ts）应通过此常量
 * 使用 Android Data 目录，而不是直接 `import { Directory } from '@capacitor/filesystem'`。
 * 这样可以把整个仓库对 Capacitor 包的静态依赖收敛到 native-fs.ts 这一个文件里，
 * 便于 Web-only 构建时用 native-fs.web.ts 整体替换掉 Capacitor 依赖。
 */
export const ANDROID_DIRECTORY_DATA = Directory.Data;

/** `Encoding.UTF8` 的重导出，用途同上。 */
export const ANDROID_ENCODING_UTF8 = Encoding.UTF8;

// ---------------------------------------------------------------------------
// Base64 / Blob 互转
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
// 桥接判定
// ---------------------------------------------------------------------------

/** 是否需要通过父壳 postMessage 桥接（Android iframe 子页面）。 */
export function shouldUseParentPostMessageBridge(): boolean {
  if (window === window.top) return false;
  if (!isAndroidNative()) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Android 文件系统（直连 / 桥接自动选择）
// ---------------------------------------------------------------------------

export function androidFilesystem<T = unknown>(method: AndroidFilesystemMethod, args: Record<string, unknown>): Promise<T> {
  if (!shouldUseParentPostMessageBridge()) {
    const operation = Filesystem[method] as unknown as (options: Record<string, unknown>) => Promise<T>;
    return operation(args);
  }

  return new Promise<T>((resolve, reject) => {
    const id = `${method}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const timeout = window.setTimeout(() => {
      window.removeEventListener('message', handleResponse);
      reject(new Error(i18next.t('storage.errorAndroidFsTimeout')));
    }, 30000);

    function handleResponse(event: MessageEvent<AndroidFilesystemResponse<T>>) {
      if (event.data?.type !== 'CCS_ANDROID_FS_RESPONSE' || event.data.id !== id) return;
      window.clearTimeout(timeout);
      window.removeEventListener('message', handleResponse);
      if (event.data.error) reject(new Error(event.data.error));
      else resolve(event.data.result as T);
    }

    window.addEventListener('message', handleResponse);
    window.top?.postMessage({ type: 'CCS_ANDROID_FS_REQUEST', id, method, args }, '*');
  });
}

export function androidOpenFile(filePath: string, contentType: string): Promise<void> {
  if (!shouldUseParentPostMessageBridge()) {
    return FileOpener.open({
      filePath,
      contentType,
      openWithDefault: true
    });
  }

  return new Promise<void>((resolve, reject) => {
    const id = `open-file-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const timeout = window.setTimeout(() => {
      window.removeEventListener('message', handleResponse);
      reject(new Error(i18next.t('storage.errorAndroidFileOpenTimeout')));
    }, 30000);

    function handleResponse(event: MessageEvent<AndroidFileOpenResponse>) {
      if (event.data?.type !== 'CCS_ANDROID_FILE_OPEN_RESPONSE' || event.data.id !== id) return;
      window.clearTimeout(timeout);
      window.removeEventListener('message', handleResponse);
      if (event.data.error) reject(new Error(event.data.error));
      else resolve();
    }

    window.addEventListener('message', handleResponse);
    window.top?.postMessage({ type: 'CCS_ANDROID_FILE_OPEN_REQUEST', id, filePath, contentType }, '*');
  });
}

/**
 * 通过父壳桥接调用 Android 原生相机拍照（iframe 子页面场景）。
 * 返回 base64（不含 data: 前缀）与 mimeType。
 */
export function androidCaptureViaBridge(): Promise<{
  base64: string;
  mimeType: string;
}> {
  return new Promise((resolve, reject) => {
    const id = `camera-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const timeout = window.setTimeout(() => {
      window.removeEventListener('message', handleResponse);
      reject(new Error(i18next.t('storage.errorAndroidCameraTimeout')));
    }, 120000);

    function handleResponse(event: MessageEvent<AndroidCameraResponse>) {
      if (event.data?.type !== 'CCS_ANDROID_CAMERA_RESPONSE' || event.data.id !== id) return;
      window.clearTimeout(timeout);
      window.removeEventListener('message', handleResponse);
      if (event.data.error) reject(new Error(event.data.error));
      else
        resolve({
          base64: event.data.base64 ?? '',
          mimeType: event.data.mimeType ?? 'image/jpeg'
        });
    }

    window.addEventListener('message', handleResponse);
    window.top?.postMessage({ type: 'CCS_ANDROID_CAMERA_REQUEST', id }, '*');
  });
}

// ---------------------------------------------------------------------------
// Android 文件读写便捷封装（Directory.Data）
// ---------------------------------------------------------------------------

export async function ensureAndroidDir(path: string): Promise<void> {
  try {
    await androidFilesystem('mkdir', {
      path,
      directory: Directory.Data,
      recursive: true
    });
  } catch {
    // 目录已存在则忽略
  }
}

export async function readAndroidText(path: string): Promise<string> {
  const result = await androidFilesystem<Awaited<ReturnType<typeof Filesystem.readFile>>>('readFile', { path, directory: Directory.Data, encoding: Encoding.UTF8 });
  return String(result.data);
}

export async function writeAndroidText(path: string, text: string): Promise<void> {
  await androidFilesystem('writeFile', {
    path,
    data: text,
    directory: Directory.Data,
    encoding: Encoding.UTF8,
    recursive: true
  });
}

export async function readAndroidBinary(path: string): Promise<Uint8Array> {
  const result = await androidFilesystem<Awaited<ReturnType<typeof Filesystem.readFile>>>('readFile', { path, directory: Directory.Data });
  return base64ToBytes(String(result.data));
}

export async function writeAndroidBinary(path: string, bytes: Uint8Array): Promise<void> {
  await androidFilesystem('writeFile', {
    path,
    data: bytesToBase64(bytes),
    directory: Directory.Data,
    recursive: true
  });
}

export async function deleteAndroidFile(path: string): Promise<void> {
  try {
    await androidFilesystem('deleteFile', { path, directory: Directory.Data });
  } catch {
    // 已清除
  }
}

export async function listAndroidFileNames(path: string): Promise<string[]> {
  try {
    const result = await androidFilesystem<Awaited<ReturnType<typeof Filesystem.readdir>>>('readdir', { path, directory: Directory.Data });
    return result.files.map((file) => (typeof file === 'string' ? file : file.name));
  } catch {
    return [];
  }
}

export async function getAndroidFileSize(path: string): Promise<number> {
  try {
    return (await androidFilesystem<Awaited<ReturnType<typeof Filesystem.stat>>>('stat', { path, directory: Directory.Data })).size ?? 0;
  } catch {
    return 0;
  }
}

export async function getAndroidDirectoryBytes(path: string): Promise<number> {
  try {
    const entries = await androidFilesystem<Awaited<ReturnType<typeof Filesystem.readdir>>>('readdir', { path, directory: Directory.Data });
    let total = 0;
    for (const entry of entries.files) {
      const name = typeof entry === 'string' ? entry : entry.name;
      const type = typeof entry === 'string' ? undefined : entry.type;
      const childPath = `${path}/${name}`;
      if (type === 'directory') total += await getAndroidDirectoryBytes(childPath);
      else total += await getAndroidFileSize(childPath);
    }
    return total;
  } catch {
    return 0;
  }
}

export async function getAndroidFileUri(path: string): Promise<string> {
  const result = await androidFilesystem<Awaited<ReturnType<typeof Filesystem.getUri>>>('getUri', { path, directory: Directory.Data });
  return result.uri;
}

/** 将原生文件 URI 转换为 WebView 可访问的 URL。 */
export function androidConvertFileSrc(uri: string): string {
  return Capacitor.convertFileSrc(uri);
}

// ---------------------------------------------------------------------------
// Web OPFS 便捷封装
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

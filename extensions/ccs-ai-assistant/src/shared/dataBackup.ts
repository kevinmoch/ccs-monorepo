import { strFromU8, strToU8, unzipSync, Zip, ZipDeflate, ZipPassThrough } from 'fflate';
import { WebSkillError } from '@webskill/core';
import type { FileSystemProvider } from '@webskill/core';

/**
 * 整机数据备份（0.26.0 分册 15）：OPFS 全部文件 + `webskill.*` 的 localStorage + `chrome.storage.local`。
 *
 * 为什么存在：移除扩展会清空这三处（扩展 ID 不变也一样），而「文件夹安装 → CRX 安装」必须先移除。
 * 备份文件是一个 zip，由 fflate 读写：
 *
 *   webskill-backup.json        清单：格式名、格式版本、创建时间、扩展版本、计数
 *   fs/<OPFS 路径>              文件系统里的每个文件
 *   local-storage.json          { 键: 字符串 }
 *   chrome-storage-local.json   { 键: JSON 值 }
 *
 * 不含用户画像记忆（`<chatRoot>/memory/user:*`）：它用一把**不可导出**的 AES 密钥加密，
 * 换一次安装密钥就没了，带过去的密文读不开。画像自己有设置 › 隐私里的导出导入。
 */

/** 与 `ConsoleDataBackup` 同形；本地声明让示例在依赖尚未升级的发布档下也能通过类型检查 */
export interface ExtensionBackupFile {
  name: string;
  data: Blob;
}

export interface ExtensionBackupSummary {
  files: number;
  settings: number;
  skipped?: number;
  warnings?: readonly string[];
}

export interface ExtensionDataBackup {
  exportBackup(): Promise<ExtensionBackupFile>;
  importBackup(source: Blob): Promise<ExtensionBackupSummary>;
}

export interface DataBackupDeps {
  fs: FileSystemProvider;
  /** 聊天数据根（如 `/chat`）：其下 `memory/user:*` 不进备份 */
  chatRoot: string;
  localStorage: Pick<Storage, 'length' | 'key' | 'getItem' | 'setItem'>;
  chromeStorage: {
    get(keys: null): Promise<Record<string, unknown>>;
    set(items: Record<string, unknown>): Promise<void>;
  };
  extensionVersion: string;
  /** 不进备份的 localStorage 键（换环境后没有意义的，如标签页编号） */
  excludeLocalKeys?: readonly string[];
  /** 还原完成后调用（技能目录缓在引擎实例里，要广播才看得见新技能） */
  onRestored?: () => void;
  now?: () => Date;
}

export const BACKUP_FORMAT = 'webskill-extension-backup';
export const BACKUP_FORMAT_VERSION = 1;

const MANIFEST_NAME = 'webskill-backup.json';
const LOCAL_STORAGE_NAME = 'local-storage.json';
const CHROME_STORAGE_NAME = 'chrome-storage-local.json';
const FS_PREFIX = 'fs/';
const LOCAL_KEY_PREFIXES = ['webskill.', 'webskill_'] as const;

/** 已是压缩格式的文件原样存放，再压只是白费 CPU */
const ALREADY_COMPRESSED = /\.(png|jpe?g|gif|webp|pdf|zip|docx|xlsx|pptx|dwg|gz|7z|mp3|mp4|woff2?)$/i;

/** Blob 攒到这个量就并成一个：Blob 可由浏览器落盘，不必把整份备份压在 JS 堆里 */
const FLUSH_BYTES = 8 * 1024 * 1024;
/** 导入时一批解压的上限；单个文件超过它就独占一批 */
const BATCH_BYTES = 32 * 1024 * 1024;
const MAX_ENTRIES = 500_000;
const MAX_ENTRY_BYTES = 1024 * 1024 * 1024;
const MAX_TOTAL_BYTES = 8 * 1024 * 1024 * 1024;

function invalid(message: string, cause?: unknown): WebSkillError {
  return new WebSkillError('VALIDATION_FAILED', message, cause);
}

function hasControlChar(text: string): boolean {
  for (let i = 0; i < text.length; i += 1) if (text.charCodeAt(i) < 0x20) return true;
  return false;
}

/** 归档里的相对路径 → OPFS 绝对路径；任何会逃出根的写法都返回 undefined */
function safeFsPath(relative: string): string | undefined {
  if (relative === '' || relative.includes('\\') || hasControlChar(relative)) return undefined;
  if (relative.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')) return undefined;
  return `/${relative}`;
}

/** Blob 的增量拼接器 */
class BlobSink {
  #blob = new Blob([]);
  #parts: Uint8Array<ArrayBuffer>[] = [];
  #bytes = 0;

  push(chunk: Uint8Array): void {
    // fflate 的流式输出可能复用内部缓冲区，必须拷一份
    const copy = chunk.slice();
    this.#parts.push(copy);
    this.#bytes += copy.byteLength;
    if (this.#bytes >= FLUSH_BYTES) {
      this.#blob = new Blob([this.#blob, ...this.#parts]);
      this.#parts = [];
      this.#bytes = 0;
    }
  }

  finish(type: string): Blob {
    return new Blob([this.#blob, ...this.#parts], { type });
  }
}

function stamp(date: Date): string {
  const two = (n: number): string => String(n).padStart(2, '0');
  return `${date.getFullYear()}${two(date.getMonth() + 1)}${two(date.getDate())}-${two(date.getHours())}${two(date.getMinutes())}${two(date.getSeconds())}`;
}

function parseJsonObject(bytes: Uint8Array, name: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(strFromU8(bytes));
  } catch (cause) {
    throw invalid(`"${name}" in the backup is not valid JSON.`, cause);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw invalid(`"${name}" in the backup must be a JSON object.`);
  }
  return parsed as Record<string, unknown>;
}

interface ArchiveEntry {
  name: string;
  originalSize: number;
}

/** 只读中央目录，不解压任何内容 */
function listEntries(bytes: Uint8Array): ArchiveEntry[] {
  const entries: ArchiveEntry[] = [];
  try {
    unzipSync(bytes, {
      filter: (file) => {
        entries.push({ name: file.name, originalSize: file.originalSize });
        return false;
      }
    });
  } catch (cause) {
    throw invalid('The file is not a valid zip archive.', cause);
  }
  return entries;
}

function readEntries(bytes: Uint8Array, names: ReadonlySet<string>): Record<string, Uint8Array> {
  try {
    return unzipSync(bytes, { filter: (file) => names.has(file.name) });
  } catch (cause) {
    throw invalid('The backup archive is damaged and cannot be read.', cause);
  }
}

export function createExtensionDataBackup(deps: DataBackupDeps): ExtensionDataBackup {
  const chatMemoryUser = `${deps.chatRoot.replace(/\/+$/, '')}/memory/user%3a`;
  const isProfileMemory = (path: string): boolean => path.toLowerCase().startsWith(chatMemoryUser);
  const excludedLocal = new Set(deps.excludeLocalKeys ?? []);
  const includeLocalKey = (key: string): boolean =>
    LOCAL_KEY_PREFIXES.some((prefix) => key.startsWith(prefix)) && !excludedLocal.has(key);

  async function collectFiles(dir: string, out: string[]): Promise<void> {
    let entries: Awaited<ReturnType<FileSystemProvider['list']>>;
    try {
      entries = await deps.fs.list(dir);
    } catch (error) {
      if (error instanceof WebSkillError && error.code === 'FS_NOT_FOUND') return;
      throw error;
    }
    for (const entry of entries) {
      if (isProfileMemory(entry.path)) continue;
      if (entry.type === 'directory') await collectFiles(entry.path, out);
      else out.push(entry.path);
    }
  }

  async function exportBackup(): Promise<ExtensionBackupFile> {
    const sink = new BlobSink();
    let zip!: Zip;
    const finished = new Promise<void>((resolve, reject) => {
      zip = new Zip((error, chunk, final) => {
        if (error) {
          reject(error);
          return;
        }
        sink.push(chunk);
        if (final) resolve();
      });
    });
    const add = (name: string, data: Uint8Array, store: boolean): void => {
      const entry = store ? new ZipPassThrough(name) : new ZipDeflate(name, { level: 6 });
      zip.add(entry);
      entry.push(data, true);
    };

    try {
      const paths: string[] = [];
      await collectFiles('/', paths);
      paths.sort();
      for (const path of paths) {
        add(`${FS_PREFIX}${path.replace(/^\/+/, '')}`, await deps.fs.readBinary(path), ALREADY_COMPRESSED.test(path));
      }

      const local: Record<string, string> = {};
      const keys: string[] = [];
      for (let i = 0; i < deps.localStorage.length; i += 1) {
        const key = deps.localStorage.key(i);
        if (key !== null) keys.push(key);
      }
      for (const key of keys.sort()) {
        const value = deps.localStorage.getItem(key);
        if (includeLocalKey(key) && value !== null) local[key] = value;
      }
      add(LOCAL_STORAGE_NAME, strToU8(JSON.stringify(local)), false);

      const chromeItems = await deps.chromeStorage.get(null);
      add(CHROME_STORAGE_NAME, strToU8(JSON.stringify(chromeItems)), false);

      const now = deps.now?.() ?? new Date();
      add(
        MANIFEST_NAME,
        strToU8(
          JSON.stringify(
            {
              format: BACKUP_FORMAT,
              formatVersion: BACKUP_FORMAT_VERSION,
              createdAt: now.toISOString(),
              extensionVersion: deps.extensionVersion,
              counts: {
                files: paths.length,
                localStorage: Object.keys(local).length,
                chromeStorage: Object.keys(chromeItems).length
              }
            },
            null,
            2
          )
        ),
        false
      );
      zip.end();
      await finished;
      return { name: `webskill-backup-${stamp(now)}.zip`, data: sink.finish('application/zip') };
    } catch (cause) {
      if (cause instanceof WebSkillError) throw cause;
      throw new WebSkillError('EXPORT_FAILED', `Could not create the backup: ${reasonOf(cause)}`, cause);
    }
  }

  async function importBackup(source: Blob): Promise<ExtensionBackupSummary> {
    const bytes = new Uint8Array(await source.arrayBuffer());

    // 阶段一：整体校验。此阶段不写任何东西（FR-15.10）
    const entries = listEntries(bytes);
    if (entries.length > MAX_ENTRIES) throw invalid(`The backup has too many entries (limit ${MAX_ENTRIES}).`);
    const seen = new Set<string>();
    let total = 0;
    for (const entry of entries) {
      if (seen.has(entry.name)) throw invalid(`The backup lists "${entry.name}" more than once.`);
      seen.add(entry.name);
      if (entry.originalSize > MAX_ENTRY_BYTES) throw invalid(`"${entry.name}" in the backup is too large.`);
      total += entry.originalSize;
    }
    if (total > MAX_TOTAL_BYTES) throw invalid('The backup is too large to restore.');

    if (!seen.has(MANIFEST_NAME)) throw invalid('This is not a WebSkill backup (webskill-backup.json is missing).');
    const manifest = parseJsonObject(
      readEntries(bytes, new Set([MANIFEST_NAME]))[MANIFEST_NAME] ?? new Uint8Array(),
      MANIFEST_NAME
    );
    if (manifest['format'] !== BACKUP_FORMAT) throw invalid('This is not a WebSkill extension backup.');
    const version = manifest['formatVersion'];
    if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
      throw invalid('The backup has no valid format version.');
    }
    if (version > BACKUP_FORMAT_VERSION) {
      throw invalid(`The backup was made by a newer version (format ${version}); update the extension and retry.`);
    }

    const fsEntries: Array<ArchiveEntry & { path: string }> = [];
    let skipped = 0;
    let skippedProfile = 0;
    let skippedUnknown = 0;
    for (const entry of entries) {
      if (entry.name === MANIFEST_NAME || entry.name === LOCAL_STORAGE_NAME || entry.name === CHROME_STORAGE_NAME)
        continue;
      if (entry.name.endsWith('/')) continue;
      if (!entry.name.startsWith(FS_PREFIX)) {
        skipped += 1;
        skippedUnknown += 1;
        continue;
      }
      const path = safeFsPath(entry.name.slice(FS_PREFIX.length));
      if (path === undefined) throw invalid(`The backup contains an unsafe path: "${entry.name}".`);
      if (isProfileMemory(path)) {
        skipped += 1;
        skippedProfile += 1;
        continue;
      }
      fsEntries.push({ ...entry, path });
    }

    const jsonNames = new Set([LOCAL_STORAGE_NAME, CHROME_STORAGE_NAME].filter((name) => seen.has(name)));
    const jsonBytes = readEntries(bytes, jsonNames);
    const localEntries: Array<[string, string]> = [];
    if (jsonNames.has(LOCAL_STORAGE_NAME)) {
      for (const [key, value] of Object.entries(parseJsonObject(jsonBytes[LOCAL_STORAGE_NAME]!, LOCAL_STORAGE_NAME))) {
        if (typeof value !== 'string') throw invalid(`"${LOCAL_STORAGE_NAME}" must map keys to strings.`);
        if (includeLocalKey(key)) localEntries.push([key, value]);
        else skipped += 1;
      }
    }
    const chromeItems = jsonNames.has(CHROME_STORAGE_NAME)
      ? parseJsonObject(jsonBytes[CHROME_STORAGE_NAME]!, CHROME_STORAGE_NAME)
      : {};

    // 阶段二：写入。失败时已写入的部分不回滚，错误里说清停在哪里
    let written = 0;
    try {
      let index = 0;
      while (index < fsEntries.length) {
        const batch: typeof fsEntries = [];
        let size = 0;
        while (index < fsEntries.length) {
          const next = fsEntries[index]!;
          if (batch.length > 0 && size + next.originalSize > BATCH_BYTES) break;
          batch.push(next);
          size += next.originalSize;
          index += 1;
        }
        const data = readEntries(bytes, new Set(batch.map((entry) => entry.name)));
        for (const entry of batch) {
          await deps.fs.writeBinary(entry.path, data[entry.name] ?? new Uint8Array());
          written += 1;
        }
      }
      for (const [key, value] of localEntries) deps.localStorage.setItem(key, value);
      if (Object.keys(chromeItems).length > 0) await deps.chromeStorage.set(chromeItems);
    } catch (cause) {
      const progress = `Restore stopped after ${written} of ${fsEntries.length} files`;
      if (cause instanceof WebSkillError) {
        throw new WebSkillError(cause.code, `${progress}: ${cause.message}`, cause);
      }
      throw new WebSkillError('INSTALL_FAILED', `${progress}: ${reasonOf(cause)}`, cause);
    }

    deps.onRestored?.();

    const warnings: string[] = [];
    if (skippedProfile > 0) {
      warnings.push(
        `${skippedProfile} user-profile memory files were not restored; use the profile export in Privacy settings instead.`
      );
    }
    if (skippedUnknown > 0)
      warnings.push(`${skippedUnknown} entries are not part of the backup format and were ignored.`);
    return {
      files: written,
      settings: localEntries.length + Object.keys(chromeItems).length,
      ...(skipped > 0 ? { skipped } : {}),
      ...(warnings.length > 0 ? { warnings } : {})
    };
  }

  return { exportBackup, importBackup };
}

function reasonOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

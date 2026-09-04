import { WebSkillError } from '@webskill/sdk';
import type { DownloadedFileEntry, DownloadedFileReader } from '@webskill/agent';

/**
 * 下载目录取件（0.14.0 分册 20 FR-20.7）。
 *
 * D-20-1 裁定的三条备选里本示例走 (a)：`chrome.downloads.search()` 列目录，
 * `fetch('file://…')` 取字节。(c) 的 File System Access 句柄留给宿主自己接——
 * 端口只有 `list` / `read` 两个方法，换实现不影响 SDK 侧任何一行。
 */

const UNAVAILABLE_MESSAGE =
  'This extension cannot read local files yet. Open chrome://extensions, find this extension, ' +
  'click "Details" and turn on "Allow access to file URLs", then try again.';

/** 权限已经确认过之后再取不到文件，只可能是文件本身没了；此时再劝用户去开开关是误导 */
const GONE_MESSAGE = 'The file could not be opened. It may have been moved or deleted.';

/** 一次列出的条数上限。目录可能有上万条，全下发只会把上下文撑爆 */
const LIST_LIMIT = 50;

function basename(filename: string): string {
  return filename.split(/[\\/]/).pop() ?? filename;
}

/** `file://` 需要百分号编码，Windows 的盘符路径还要补一个前导斜杠 */
function fileUrlOf(filename: string): string {
  const normalized = filename.replace(/\\/g, '/');
  const absolute = normalized.startsWith('/') ? normalized : `/${normalized}`;
  return `file://${absolute.split('/').map(encodeURIComponent).join('/')}`;
}

async function assertFileAccess(): Promise<void> {
  if (!(await chrome.extension.isAllowedFileSchemeAccess())) {
    // 静默失败会让模型以为「下载目录是空的」；这里必须说出开启路径（AC-20.13）
    throw new WebSkillError('DOWNLOADS_UNAVAILABLE', UNAVAILABLE_MESSAGE);
  }
}

export function createExtensionDownloadsReader(): DownloadedFileReader {
  /** 取件号 → 真实路径。**路径只留在这一侧**：`DownloadedFileEntry` 里不得出现它（H-12） */
  let pathById = new Map<string, string>();

  return {
    async list(): Promise<readonly DownloadedFileEntry[]> {
      await assertFileAccess();
      const items = await chrome.downloads.search({
        state: 'complete',
        exists: true,
        orderBy: ['-startTime'],
        limit: LIST_LIMIT
      });
      const entries: DownloadedFileEntry[] = [];
      const paths = new Map<string, string>();
      for (const item of items) {
        if (item.filename === '') continue;
        const id = String(item.id);
        paths.set(id, item.filename);
        entries.push({
          id,
          name: basename(item.filename),
          contentType: item.mime,
          size: item.fileSize > 0 ? item.fileSize : item.bytesReceived,
          at: item.endTime ?? item.startTime
        });
      }
      pathById = paths;
      return entries;
    },

    async read(id: string): Promise<{ contentType: string; bytes: Uint8Array }> {
      await assertFileAccess();
      const filename = pathById.get(id);
      if (filename === undefined) {
        throw new WebSkillError('TOOL_NOT_FOUND', `No downloaded file has id "${id}".`);
      }
      let response: Response;
      try {
        response = await fetch(fileUrlOf(filename));
      } catch {
        throw new WebSkillError('DOWNLOADS_UNAVAILABLE', GONE_MESSAGE);
      }
      if (!response.ok) {
        throw new WebSkillError('DOWNLOADS_UNAVAILABLE', `${GONE_MESSAGE} (HTTP ${String(response.status)})`);
      }
      // 类型以这一次为准，不复用 list() 那次的 mime
      const contentType = response.headers.get('content-type')?.split(';')[0]?.trim() ?? '';
      return { contentType, bytes: new Uint8Array(await response.arrayBuffer()) };
    }
  };
}

/**
 * 0.14.0 分册 20 FR-20.7 / AC-20.13：下载目录取件端口。
 *
 * AC-20.13 说的是「未开启 file scheme **或**所选路径不可读时给出引导，而不是静默失败」。
 * 后半句在扩展 e2e 里用真文件验（`e2e-extension/downloads.spec.ts`）；
 * 前半句只能在这里验——`--load-extension` 起的 profile 一律**自带** file scheme 访问权，
 * 真浏览器里根本走不到那条分支，而那句引导恰恰是用户第一次点进来最可能看到的话。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createExtensionDownloadsReader } from '../src/shared/downloadsReader';

interface DownloadItem {
  id: number;
  filename: string;
  mime: string;
  fileSize: number;
  bytesReceived: number;
  startTime: string;
  endTime?: string;
  state: string;
  exists: boolean;
}

const ITEM: DownloadItem = {
  id: 7,
  filename: '/Users/someone/Downloads/quarterly report.pdf',
  mime: 'application/pdf',
  fileSize: 2048,
  bytesReceived: 2048,
  startTime: '2026-08-01T00:00:00.000Z',
  endTime: '2026-08-01T00:00:03.000Z',
  state: 'complete',
  exists: true
};

/** 装一个只够本文件用的 `chrome`：真实实现只碰 `extension` 与 `downloads` 两个命名空间 */
function stubChrome(options: { fileAccess: boolean; items?: readonly DownloadItem[] }): void {
  (globalThis as unknown as Record<string, unknown>)['chrome'] = {
    extension: { isAllowedFileSchemeAccess: () => Promise.resolve(options.fileAccess) },
    downloads: { search: () => Promise.resolve(options.items ?? [ITEM]) }
  };
}

afterEach(() => {
  delete (globalThis as unknown as Record<string, unknown>)['chrome'];
  vi.unstubAllGlobals();
});

describe('下载目录取件（0.14.0 分册 20）', () => {
  it('file scheme 关着时，list 与 read 都给出能照做的引导', async () => {
    stubChrome({ fileAccess: false });
    const reader = createExtensionDownloadsReader();

    for (const call of [() => reader.list(), () => reader.read('7')]) {
      const error = await call().then(
        () => undefined,
        (e: unknown) => e as { code?: string; message: string }
      );
      expect(error?.code).toBe('DOWNLOADS_UNAVAILABLE');
      // 判据不是「有错」，而是「这句话照着做得了」：路径与开关名一个都不能少
      expect(error?.message).toContain('chrome://extensions');
      expect(error?.message).toContain('Allow access to file URLs');
    }
  });

  it('列出来的条目只带取件号与文件名，不带本机路径（H-12）', async () => {
    stubChrome({ fileAccess: true });

    const entries = await createExtensionDownloadsReader().list();

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ id: '7', name: 'quarterly report.pdf', contentType: 'application/pdf' });
    expect(JSON.stringify(entries)).not.toContain('/Users/someone/Downloads');
  });

  it('没列过的取件号读不了，且不冒充成「文件没了」', async () => {
    stubChrome({ fileAccess: true });

    const error = await createExtensionDownloadsReader()
      .read('7')
      .then(
        () => undefined,
        (e: unknown) => e as { code?: string }
      );

    expect(error?.code).toBe('TOOL_NOT_FOUND');
  });

  it('权限在、文件没了：引导指向文件而不是再劝用户去开开关', async () => {
    stubChrome({ fileAccess: true });
    vi.stubGlobal('fetch', () => Promise.reject(new Error('Failed to fetch')));
    const reader = createExtensionDownloadsReader();
    await reader.list();

    const error = await reader.read('7').then(
      () => undefined,
      (e: unknown) => e as { code?: string; message: string }
    );

    expect(error?.code).toBe('DOWNLOADS_UNAVAILABLE');
    expect(error?.message).toContain('moved or deleted');
    expect(error?.message).not.toContain('Allow access to file URLs');
  });

  it('读得到时按这一次的响应头定类型，而不是复用 list 那次的 mime', async () => {
    stubChrome({ fileAccess: true });
    vi.stubGlobal('fetch', () =>
      Promise.resolve({
        ok: true,
        headers: new Headers({ 'content-type': 'text/plain; charset=utf-8' }),
        arrayBuffer: () => Promise.resolve(new TextEncoder().encode('hi').buffer)
      })
    );
    const reader = createExtensionDownloadsReader();
    await reader.list();

    const file = await reader.read('7');

    expect(file.contentType).toBe('text/plain');
    expect(new TextDecoder().decode(file.bytes)).toBe('hi');
  });
});

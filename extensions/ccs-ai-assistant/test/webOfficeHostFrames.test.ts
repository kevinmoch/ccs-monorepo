// @vitest-environment jsdom
/**
 * 跨帧枚举与按帧寻址（0.21.0 分册 11 AC-11.12 / FR-11.4c）。
 *
 * 这条判据是被真实部署逼出来的：客户站点上的 Word / Excel 实例住在**孙帧**里
 * （顶层 → `#third-iframe` → `#office-iframe`），PDF 住在子帧里，顶层帧一个实例都没有。
 * 早先宿主把 `frameId` 写死成 0，于是「读得到」这件事在那套部署上从来没成立过，
 * 而全套单测照绿——因为它们全都假设实例在顶层。
 *
 * 用例一律**从宿主的公开面**驱动（`list` / `describe` / `call`），
 * 断言落在假 `chrome` 收到的寻址参数上：验的就是「投给了哪一帧」。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WEB_OFFICE_CHANNEL } from '../src/shared/messages';
import { createExtensionWebOfficeHost } from '../src/shared/webOfficeHost';

interface Sent {
  frameId: number;
  kind: string;
  handle?: string;
}

const TAB_ID = 7;

/** 记下每一条消息投给了哪一帧；`answers` 决定哪一帧答什么 */
function fakeChrome(
  frameIds: readonly number[],
  answers: (frameId: number, kind: string) => unknown
): { sent: Sent[] } {
  const sent: Sent[] = [];
  const chromeStub = {
    webNavigation: {
      getAllFrames: async ({ tabId }: { tabId: number }) => {
        expect(tabId).toBe(TAB_ID);
        return frameIds.map((frameId) => ({ frameId, parentFrameId: frameId === 0 ? -1 : 0 }));
      }
    },
    tabs: {
      sendMessage: async (tabId: number, message: Record<string, unknown>, options: { frameId: number }) => {
        expect(tabId).toBe(TAB_ID);
        expect(message['channel']).toBe(WEB_OFFICE_CHANNEL);
        sent.push({
          frameId: options.frameId,
          kind: String(message['kind']),
          ...(typeof message['handle'] === 'string' ? { handle: message['handle'] } : {})
        });
        return answers(options.frameId, String(message['kind']));
      }
    }
  };
  (globalThis as unknown as Record<string, unknown>)['chrome'] = chromeStub;
  return { sent };
}

function host(): ReturnType<typeof createExtensionWebOfficeHost> {
  return createExtensionWebOfficeHost({
    tabId: () => TAB_ID,
    origin: () => 'https://example.test',
    pageUrl: () => 'https://example.test/doc',
    maxImageBytes: () => 1_000_000
  });
}

beforeEach(() => {
  vi.useRealTimers();
});

afterEach(() => {
  Reflect.deleteProperty(globalThis as unknown as Record<string, unknown>, 'chrome');
});

describe('跨帧枚举（AC-11.12 / FR-11.4c）', () => {
  it('实例住在第三帧时照样枚举得到，不是只问顶层', async () => {
    fakeChrome([0, 1, 2], (frameId, kind) => {
      if (kind !== 'list') return { channel: WEB_OFFICE_CHANNEL, ok: true, value: undefined };
      const value =
        frameId === 2 ? [{ handle: 'wo-deep', claimedOfficeType: 'w', claimedFileId: 'f-1', ready: true }] : [];
      return { channel: WEB_OFFICE_CHANNEL, ok: true, value };
    });

    const records = await host().list();

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ handle: 'wo-deep', officeType: 'w', fileId: 'f-1', state: 'ready' });
  });

  it('后续调用投回它自己那一帧，而不是顶层', async () => {
    const { sent } = fakeChrome([0, 1, 2], (frameId, kind) => {
      if (kind === 'list') {
        return {
          channel: WEB_OFFICE_CHANNEL,
          ok: true,
          value: frameId === 2 ? [{ handle: 'wo-deep', claimedOfficeType: 'w', ready: true }] : []
        };
      }
      if (kind === 'describe') return { channel: WEB_OFFICE_CHANNEL, ok: true, value: ['GetDocumentText'] };
      return { channel: WEB_OFFICE_CHANNEL, ok: true, value: 'hello' };
    });

    const bound = host();
    await bound.list();
    await bound.read.describe('wo-deep');
    await bound.read.call('wo-deep', 'GetDocumentText', []);

    expect(sent.filter((entry) => entry.kind === 'describe')).toEqual([
      { frameId: 2, kind: 'describe', handle: 'wo-deep' }
    ]);
    expect(sent.filter((entry) => entry.kind === 'call')).toEqual([{ frameId: 2, kind: 'call', handle: 'wo-deep' }]);
  });

  it('一帧不应答不连累其余帧：那一帧多半只是没装内容脚本', async () => {
    fakeChrome([0, 1, 2], (frameId, _kind) => {
      if (frameId === 1) throw new Error('Could not establish connection.');
      return {
        channel: WEB_OFFICE_CHANNEL,
        ok: true,
        value: frameId === 2 ? [{ handle: 'wo-deep', claimedOfficeType: 'f', ready: false }] : []
      };
    });

    const records = await host().list();

    expect(records.map((record) => record.handle)).toEqual(['wo-deep']);
    expect(records[0]?.state).toBe('initialising');
  });

  it('两帧各有一份文档时两条都在，各自记住自己的帧', async () => {
    const { sent } = fakeChrome([0, 3, 4], (frameId, kind) => {
      if (kind === 'list') {
        const table: Record<number, unknown[]> = {
          0: [],
          3: [{ handle: 'wo-a', claimedOfficeType: 'w', ready: true }],
          4: [{ handle: 'wo-b', claimedOfficeType: 's', ready: true }]
        };
        return { channel: WEB_OFFICE_CHANNEL, ok: true, value: table[frameId] };
      }
      return { channel: WEB_OFFICE_CHANNEL, ok: true, value: [] };
    });

    const bound = host();
    expect((await bound.list()).map((record) => record.handle)).toEqual(['wo-a', 'wo-b']);
    await bound.read.describe('wo-b');
    await bound.read.describe('wo-a');

    expect(sent.filter((entry) => entry.kind === 'describe').map((entry) => entry.frameId)).toEqual([4, 3]);
  });
});

describe('宿主帧的远程句柄不算第二份文档（FR-11.1e）', () => {
  /** 顶层帧用 `config()` 造了个远程句柄，文档本体在它 mount 的第 2 帧里 */
  function mountedPair(frameIds: readonly number[], parents: Record<number, number>): { sent: Sent[] } {
    const stub = fakeChrome(frameIds, (frameId, kind) => {
      if (kind !== 'list') return { channel: WEB_OFFICE_CHANNEL, ok: true, value: undefined };
      const table: Record<number, unknown[]> = {
        0: [{ handle: 'wo-host', claimedOfficeType: 'f', claimedViaMount: true, ready: false }],
        2: [{ handle: 'wo-office', claimedOfficeType: 'f', ready: true }]
      };
      return { channel: WEB_OFFICE_CHANNEL, ok: true, value: table[frameId] ?? [] };
    });
    const chromeStub = (globalThis as unknown as Record<string, unknown>)['chrome'] as {
      webNavigation: { getAllFrames: (arg: { tabId: number }) => Promise<unknown> };
    };
    chromeStub.webNavigation.getAllFrames = async ({ tabId }: { tabId: number }) => {
      expect(tabId).toBe(TAB_ID);
      return frameIds.map((frameId) => ({ frameId, parentFrameId: parents[frameId] ?? -1 }));
    };
    return stub;
  }

  it('子帧报了同一份文档时，宿主帧那条远程句柄不出现在清单里', async () => {
    // 不去重就是「一页两份、请指名」——而那两份其实是同一份，用户看到的正是这个错
    mountedPair([0, 1, 2], { 1: 0, 2: 0 });

    const records = await host().list();

    expect(records.map((record) => record.handle)).toEqual(['wo-office']);
  });

  it('隔了一层中间帧也认得出祖先关系', async () => {
    mountedPair([0, 1, 2], { 1: 0, 2: 1 });

    const records = await host().list();

    expect(records.map((record) => record.handle)).toEqual(['wo-office']);
  });

  it('子帧一份都没报时，宿主帧那条留下——否则这份文档就彻底没人认领了', async () => {
    fakeChrome([0, 1], (frameId, kind) => {
      if (kind !== 'list') return { channel: WEB_OFFICE_CHANNEL, ok: true, value: undefined };
      const value = frameId === 0 ? [{ handle: 'wo-host', claimedOfficeType: 'f', claimedViaMount: true }] : [];
      return { channel: WEB_OFFICE_CHANNEL, ok: true, value };
    });

    const records = await host().list();

    expect(records.map((record) => record.handle)).toEqual(['wo-host']);
  });
});

describe('嗅探器空手时退到页面自己的原件直链（FR-12.5f）', () => {
  /** 枚举出一份住在第 2 帧的 PDF，之后 `answers` 说了算 */
  function pdfAt(answers: (frameId: number, kind: string) => unknown): { sent: Sent[] } {
    return fakeChrome([0, 1, 2], (frameId, kind) => {
      if (kind === 'list') {
        return {
          channel: WEB_OFFICE_CHANNEL,
          ok: true,
          value: frameId === 2 ? [{ handle: 'wo-pdf', claimedOfficeType: 'f', ready: true }] : []
        };
      }
      return answers(frameId, kind);
    });
  }

  it('嗅到了字节就到此为止，一条多余的请求都不发', async () => {
    const { sent } = pdfAt((_frameId, kind) => {
      if (kind === 'take-pdf') return { channel: WEB_OFFICE_CHANNEL, ok: true, value: 0 };
      if (kind === 'take-frame-pdf') return { channel: WEB_OFFICE_CHANNEL, ok: true, value: [0x25, 0x50, 0x44, 0x46] };
      return { channel: WEB_OFFICE_CHANNEL, ok: true, value: undefined };
    });

    const bound = host();
    await bound.list();
    const bytes = await bound.read.takeCapturedPdf!('wo-pdf');

    expect(bytes).toEqual(Uint8Array.from([0x25, 0x50, 0x44, 0x46]));
    expect(sent.some((entry) => entry.kind === 'take-linked-pdf')).toBe(false);
  });

  it('嗅探器空手时改问直链，且**逐帧**问——链接与实例从来不在同一帧', async () => {
    // 实测：`downloadurl` 在宿主帧（frameId 0），实例在 office 帧（frameId 2）。
    // 拿 handle 定位就只会去问 2 号帧，而那一帧一条链接也没有
    const { sent } = pdfAt((frameId, kind) => {
      if (kind === 'take-linked-pdf' && frameId === 0) {
        return { channel: WEB_OFFICE_CHANNEL, ok: true, value: [0x25, 0x50, 0x44, 0x46, 0x2d] };
      }
      return { channel: WEB_OFFICE_CHANNEL, ok: true, value: undefined };
    });

    const bound = host();
    await bound.list();
    const bytes = await bound.read.takeCapturedPdf!('wo-pdf');

    expect(bytes).toEqual(Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d]));
    expect(sent.filter((entry) => entry.kind === 'take-linked-pdf').map((entry) => entry.frameId)).toEqual([0]);
  });

  it('宿主帧没有时接着问下一帧，不因为第一帧空手就放弃', async () => {
    const { sent } = pdfAt((frameId, kind) => {
      if (kind === 'take-linked-pdf' && frameId === 2) {
        return { channel: WEB_OFFICE_CHANNEL, ok: true, value: [0x25, 0x50, 0x44, 0x46] };
      }
      return { channel: WEB_OFFICE_CHANNEL, ok: true, value: undefined };
    });

    const bound = host();
    await bound.list();
    const bytes = await bound.read.takeCapturedPdf!('wo-pdf');

    expect(bytes).toEqual(Uint8Array.from([0x25, 0x50, 0x44, 0x46]));
    expect(sent.filter((entry) => entry.kind === 'take-linked-pdf').map((entry) => entry.frameId)).toEqual([0, 1, 2]);
  });

  it('两条通道都空手仍旧回 undefined，让上层老实降级到视觉通道', async () => {
    pdfAt(() => ({ channel: WEB_OFFICE_CHANNEL, ok: true, value: undefined }));

    const bound = host();
    await bound.list();

    await expect(bound.read.takeCapturedPdf!('wo-pdf')).resolves.toBeUndefined();
  });
});

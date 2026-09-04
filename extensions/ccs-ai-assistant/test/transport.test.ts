import { beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createTabTransport } from '../src/shared/transport';
import { PAGE_AGENT_CHANNEL } from '../src/shared/messages';

/** 扩展一重载，已打开页面里的内容脚本就连着上一个实例，新实例发的消息它收不到 */
const ORPHAN = 'Could not establish connection. Receiving end does not exist.';

const REQUEST = { type: 'perceive', scope: { include: ['body'] } } as const;
const REPLY = { type: 'perceive-result', result: { nodes: [] }, targets: [] };
/** 内容脚本回的是套了信封的应答：里面带着本帧自报的地址（分册 16 AC-16.10） */
const RESPONSE = { channel: PAGE_AGENT_CHANNEL, reply: REPLY, documentUrl: 'https://app.example.com/' };

interface ChromeStub {
  tabs: { sendMessage: ReturnType<typeof vi.fn> };
  scripting: { executeScript: ReturnType<typeof vi.fn> };
  webNavigation: { getAllFrames: ReturnType<typeof vi.fn> };
}

function stubChrome(sendMessage: ReturnType<typeof vi.fn>, executeScript = vi.fn().mockResolvedValue([])): ChromeStub {
  const stub: ChromeStub = {
    tabs: { sendMessage },
    scripting: { executeScript },
    webNavigation: { getAllFrames: vi.fn().mockResolvedValue([]) }
  };
  (globalThis as { chrome?: unknown }).chrome = stub;
  return stub;
}

beforeEach(() => {
  delete (globalThis as { chrome?: unknown }).chrome;
});

describe('内容脚本失联时的补注入', () => {
  it('孤儿内容脚本：补注一次并重发，调用方拿到正常应答', async () => {
    const sendMessage = vi.fn().mockRejectedValueOnce(new Error(ORPHAN)).mockResolvedValueOnce(RESPONSE);
    const chrome = stubChrome(sendMessage);

    const reply = await createTabTransport(() => 7).send(REQUEST);

    expect(reply).toEqual(REPLY);
    expect(chrome.scripting.executeScript).toHaveBeenCalledWith({
      target: { tabId: 7, allFrames: true },
      files: ['content.js']
    });
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });

  it('AC-16.3：每次投递都带 frameId，主帧是 0', async () => {
    const sendMessage = vi.fn().mockResolvedValue(RESPONSE);
    stubChrome(sendMessage);

    await createTabTransport(() => 7).send(REQUEST);

    // 不带 frameId 时 Chrome 会广播给每一帧，而只有第一个应答会回来——读到哪一帧全看调度
    expect(sendMessage).toHaveBeenCalledWith(7, expect.anything(), { frameId: 0 });
  });

  it('内容脚本回了裸应答（没套信封）时判为协议不符，不当成正常结果收下', async () => {
    const sendMessage = vi.fn().mockResolvedValue(REPLY);
    stubChrome(sendMessage);

    await expect(createTabTransport(() => 7).send(REQUEST)).rejects.toThrow('not a page agent reply');
  });

  it('其它失败原因不补注入：页面已关闭时重注只会多一条无关报错', async () => {
    const sendMessage = vi.fn().mockRejectedValue(new Error('No tab with id: 7.'));
    const chrome = stubChrome(sendMessage);

    await expect(createTabTransport(() => 7).send(REQUEST)).rejects.toThrow('did not answer');
    expect(chrome.scripting.executeScript).not.toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it('注不进去的页面：错误里必须点明「让用户刷新该页面」，否则模型无从转达', async () => {
    const sendMessage = vi.fn().mockRejectedValue(new Error(ORPHAN));
    stubChrome(sendMessage, vi.fn().mockRejectedValue(new Error('Cannot access a chrome:// URL')));

    await expect(createTabTransport(() => 7).send(REQUEST)).rejects.toThrow(/reload that page/);
  });

  it('补注后仍不应答时不再重试：第三次发消息等于把失败拖成超时', async () => {
    const sendMessage = vi.fn().mockRejectedValue(new Error(ORPHAN));
    const chrome = stubChrome(sendMessage);

    await expect(createTabTransport(() => 7).send(REQUEST)).rejects.toThrow(/reload that page/);
    expect(chrome.scripting.executeScript).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });

  it('未绑定 tab 时直接失败，不去碰 chrome.scripting', async () => {
    const chrome = stubChrome(vi.fn());
    await expect(createTabTransport(() => undefined).send(REQUEST)).rejects.toThrow('No page is bound');
    expect(chrome.scripting.executeScript).not.toHaveBeenCalled();
  });
});

describe('帧路由只剩投递器适配（0.15.0 分册 11）', () => {
  it('AC-11.14：示例不再持有自己的编排实现', () => {
    // 两份实现一旦并存就会漂移，而只有一份有 SDK 测试。删掉是 D-11-6 的通过判据，
    // 不是清理——所以它需要一条会变红的判据，而不是一句注释
    expect(existsSync(resolve(import.meta.dirname, '../src/shared/frameRouting.ts'))).toBe(false);
  });

  it('扩展寻址接进导出的编排后，嵌套帧照样被下钻到', async () => {
    const nested = { url: 'https://app.example.com/inner', hint: '订单' };
    const sendMessage = vi.fn(async (_tabId: number, _message: unknown, options: { frameId: number }) =>
      options.frameId === 0
        ? {
            channel: PAGE_AGENT_CHANNEL,
            reply: {
              type: 'perceive-result',
              result: { nodes: [{ role: 'button', name: '首页' }], nestedFrames: [nested] },
              targets: []
            },
            documentUrl: 'https://app.example.com/'
          }
        : {
            channel: PAGE_AGENT_CHANNEL,
            reply: {
              type: 'perceive-result',
              result: { nodes: [{ role: 'button', name: '订单列表' }] },
              targets: []
            },
            documentUrl: nested.url
          }
    );
    const chrome = stubChrome(sendMessage as unknown as ReturnType<typeof vi.fn>);
    chrome.webNavigation.getAllFrames.mockResolvedValue([
      { frameId: 0, url: 'https://app.example.com/' },
      { frameId: 3, parentFrameId: 0, url: nested.url }
    ]);

    const reply = await createTabTransport(() => 7).send(REQUEST);

    if (reply.type !== 'perceive-result') throw new Error('expected a perceive result');
    expect(reply.result.nodes.map((node) => node.name)).toEqual(['首页', '订单列表']);
    expect(sendMessage).toHaveBeenCalledWith(7, expect.anything(), { frameId: 3 });
  });
});

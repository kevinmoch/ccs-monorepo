// @vitest-environment jsdom
/**
 * service worker 的唯一职责：点扩展图标就打开侧栏。
 *
 * 这一条只有真装进 Chrome 才看得见效果，但「有没有登记那两条路径」是可以就地验的——
 * 而它们正是曾经漏掉的那一半：只设 `openPanelOnActionClick`、不接 `action.onClicked`，
 * 开关没落地时用户就只剩「三个点 → 打开侧边栏」这一条路。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface FakeChrome {
  sidePanel: { setPanelBehavior: ReturnType<typeof vi.fn>; open: ReturnType<typeof vi.fn> };
  action: { onClicked: { addListener: ReturnType<typeof vi.fn> } };
}

let fake: FakeChrome;
let clicked: ((tab: { windowId?: number }) => void) | undefined;

beforeEach(async () => {
  clicked = undefined;
  fake = {
    sidePanel: { setPanelBehavior: vi.fn(async () => undefined), open: vi.fn(async () => undefined) },
    action: {
      onClicked: {
        addListener: vi.fn((listener: (tab: { windowId?: number }) => void) => {
          clicked = listener;
        })
      }
    }
  };
  vi.stubGlobal('chrome', fake);
  vi.resetModules();
  await import('../src/background/service-worker');
});

afterEach(() => vi.unstubAllGlobals());

describe('扩展图标打开侧栏', () => {
  it('装载时就把「点图标开侧栏」的开关打开', () => {
    expect(fake.sidePanel.setPanelBehavior).toHaveBeenCalledWith({ openPanelOnActionClick: true });
  });

  it('同时接上 action.onClicked：开关没生效时点图标仍然开得出侧栏', async () => {
    expect(clicked).toBeTypeOf('function');
    clicked?.({ windowId: 7 });
    // 窗口级，不是 tab 级——按 tab 开的话换个标签页侧栏就没了
    expect(fake.sidePanel.open).toHaveBeenCalledWith({ windowId: 7 });
  });

  it('开不出来只记日志，不抛到全局——service worker 里没人能接住', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    fake.sidePanel.open.mockRejectedValueOnce(new Error('no user gesture'));
    clicked?.({ windowId: 1 });
    await vi.waitFor(() => expect(error).toHaveBeenCalled());
    error.mockRestore();
  });
});

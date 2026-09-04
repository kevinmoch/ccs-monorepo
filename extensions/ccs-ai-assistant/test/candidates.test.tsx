// @vitest-environment jsdom
/**
 * 站点自荐数据源在扩展侧的两道判据（0.14.0 分册 21）：
 * 来源 tab 闸（AC-21.14）与「无候选时容器整个不存在」（AC-21.12）。
 *
 * 这里不装配整个 side panel——那需要 OPFS 与 sandbox iframe。
 * 被验的是两段真正独立的逻辑：消息闸的判据本身，和区块组件对端口的反应。
 */
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataSourceCandidatePolicy } from '@webskill/agent';
import type { DataSourceCandidate, DataSourceDef } from '@webskill/agent';
import { PAGE_DATA_SOURCES, isPageDataSourcesMessage } from '../src/shared/pageMcpClient';
import { PAGE_DATA_SOURCES_LIMIT, isPageMcpBridgeDataSources } from '../src/shared/pageMcpBridge';
import { DataSourceCandidates } from '../src/sidepanel/DataSourceCandidates';
import { SidePanelShell } from '../src/sidepanel/SidePanelShell';
import type { DataSourceCandidatesPort } from '../src/shared/assembly';

const OFFER = {
  id: 'orders',
  kind: 'http',
  description: 'Recent orders',
  target: 'https://api.shop.example.com/orders'
};

const SITE = 'https://shop.example.com';

/**
 * `assembly.ts` 里那段监听器的逐字复刻。
 *
 * 复刻而不是导入，是因为原件长在 `createSidePanelHost()` 里，而那个函数会去开 OPFS。
 * **闸的判据只有一行**，复刻它的成本远小于为了导入它把整个装配拆开——
 * 但也因此，改了那一行必须同步改这里。
 */
function gate(candidates: DataSourceCandidatePolicy, boundTabId: number | undefined, boundOrigin: string | undefined) {
  return (message: unknown, sender: { tab?: { id?: number } }): boolean => {
    if (!isPageDataSourcesMessage(message) || sender.tab?.id !== boundTabId) return false;
    if (boundOrigin === undefined) return false;
    candidates.offer(boundOrigin, message.sources);
    return true;
  };
}

describe('来源 tab 闸（AC-21.14）', () => {
  it('不是当前绑定 tab 发来的提议一律丢弃', () => {
    const candidates = new DataSourceCandidatePolicy();
    const listener = gate(candidates, 7, SITE);

    expect(listener({ channel: PAGE_DATA_SOURCES, sources: [OFFER] }, { tab: { id: 9 } })).toBe(false);
    // 没有 tab 的发送方（另一个扩展页面）同样进不来
    expect(listener({ channel: PAGE_DATA_SOURCES, sources: [OFFER] }, {})).toBe(false);
    expect(candidates.pending(SITE)).toEqual([]);

    expect(listener({ channel: PAGE_DATA_SOURCES, sources: [OFFER] }, { tab: { id: 7 } })).toBe(true);
    expect(candidates.pending(SITE).map((c) => c.id)).toEqual(['orders']);
  });

  it('信封不对的消息交还给别的监听器，不当成空提议吞掉', () => {
    const candidates = new DataSourceCandidatePolicy();
    const listener = gate(candidates, 7, SITE);

    expect(listener({ channel: 'webskill:page-mcp-changed' }, { tab: { id: 7 } })).toBe(false);
    expect(listener({ channel: PAGE_DATA_SOURCES, sources: 'not-an-array' }, { tab: { id: 7 } })).toBe(false);
    expect(listener(undefined, { tab: { id: 7 } })).toBe(false);
  });

  it('未绑定 tab 时提议无处可归，不落到任何 scope 上', () => {
    const candidates = new DataSourceCandidatePolicy();
    const listener = gate(candidates, undefined, undefined);

    expect(listener({ channel: PAGE_DATA_SOURCES, sources: [OFFER] }, { tab: { id: 7 } })).toBe(false);
  });

  it('桥信封只认带数组 sources 的那一种', () => {
    expect(isPageMcpBridgeDataSources({ channel: 'webskill:page-mcp-bridge', kind: 'data-sources', sources: [] })).toBe(
      true
    );
    expect(isPageMcpBridgeDataSources({ channel: 'webskill:page-mcp-bridge', kind: 'changed' })).toBe(false);
    expect(PAGE_DATA_SOURCES_LIMIT).toBeGreaterThan(0);
  });
});

let root: Root | undefined;
let container: HTMLElement | undefined;

function mount(element: ReturnType<typeof createElement>): HTMLElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  root.render(element);
  return container;
}

const tick = (): Promise<unknown> => new Promise((resolve) => setTimeout(resolve, 10));

/** 主题来自 store 的异步 load，固定 sleep 在满负载下会抢在 fallback 还生效时断言 */
async function waitUntil(done: () => boolean): Promise<void> {
  for (let i = 0; i < 100; i += 1) {
    if (done()) return;
    await tick();
  }
  throw new Error('timed out waiting for the condition');
}

afterEach(() => {
  root?.unmount();
  container?.remove();
  root = undefined;
  container = undefined;
  vi.restoreAllMocks();
});

function port(overrides: {
  pending?: readonly DataSourceCandidate[];
  approved?: readonly DataSourceDef[];
  scope?: string;
  shadowOf?: (id: string) => 'host' | 'user' | undefined;
}): DataSourceCandidatesPort & { approve: ReturnType<typeof vi.fn>; forget: ReturnType<typeof vi.fn> } {
  const approve = vi.fn(async () => undefined);
  const forget = vi.fn(async () => undefined);
  return {
    subscribe: () => () => undefined,
    version: () => 0,
    snapshot: () => ({
      ...(overrides.scope === undefined ? {} : { scope: overrides.scope }),
      pending: overrides.pending ?? [],
      approved: overrides.approved ?? [],
      shadowOf: overrides.shadowOf ?? (() => undefined)
    }),
    approve,
    forget
  };
}

const CANDIDATE: DataSourceCandidate = { ...OFFER, kind: 'http', provenance: 'page-declared' };
const APPROVED: DataSourceDef = { id: 'orders', kind: 'http', description: 'Recent orders', target: 'https://x/y' };

const at = (el: HTMLElement, id: string): HTMLElement | null => el.querySelector(`[data-testid="${id}"]`);
/** 弹窗经 portal 挂到 ThemeScope 容器（或 body）上，不在挂载容器里 */
const inDialog = (id: string): HTMLElement | null => document.body.querySelector(`[data-testid="${id}"]`);
const dialog = (): HTMLElement | null => document.body.querySelector('[role="dialog"]');

describe('候选区块（AC-21.3 / AC-21.6 / AC-21.12）', () => {
  it('AC-21.12 无候选也无已批时，DOM 里根本没有这个容器', async () => {
    const el = mount(createElement(DataSourceCandidates, { port: port({}), locale: 'zh' }));
    await tick();

    // 空区块会被读成「本站点没有数据」——不知道 ≠ 没有
    expect(at(el, 'datasource-candidates')).toBeNull();
    expect(dialog()).toBeNull();
  });

  it('AC-21.3 卡上同时出现 origin、id 与「说明由站点提供」', async () => {
    mount(createElement(DataSourceCandidates, { port: port({ pending: [CANDIDATE], scope: SITE }), locale: 'zh' }));
    await tick();

    expect(dialog()?.textContent).toContain(SITE);
    expect(inDialog('datasource-candidate')?.textContent).toContain('orders');
    expect(inDialog('datasource-candidate')?.textContent).toContain('Recent orders');
    expect(inDialog('datasource-candidate-untrusted')?.textContent).toContain('说明由该站点提供');
  });

  it('AC-21.6 被宿主写死的源盖掉时标出「未生效」及原因', async () => {
    mount(
      createElement(DataSourceCandidates, {
        port: port({ pending: [CANDIDATE], shadowOf: () => 'host' as const }),
        locale: 'zh'
      })
    );
    await tick();

    expect(inDialog('datasource-candidate-shadowed')?.textContent).toContain('本扩展写死');
  });

  it('AC-21.7 被用户手配的源盖掉时，原因指向设置页而不是扩展自身', async () => {
    mount(
      createElement(DataSourceCandidates, {
        port: port({ pending: [CANDIDATE], shadowOf: () => 'user' as const }),
        locale: 'zh'
      })
    );
    await tick();

    expect(inDialog('datasource-candidate-shadowed')?.textContent).toContain('设置 › 沙箱');
  });

  it('没被盖掉时不渲染「未生效」，避免每条都挂一句吓人的提示', async () => {
    mount(createElement(DataSourceCandidates, { port: port({ pending: [CANDIDATE] }), locale: 'zh' }));
    await tick();

    expect(inDialog('datasource-candidate-shadowed')).toBeNull();
  });

  it('「记住」是勾选后随批准一起提交，不是单独一次写入', async () => {
    const p = port({ pending: [CANDIDATE] });
    mount(createElement(DataSourceCandidates, { port: p, locale: 'zh' }));
    await tick();

    inDialog('datasource-candidate-approve')!.click();
    expect(p.approve).toHaveBeenCalledWith('orders', false);

    inDialog('datasource-candidate-remember')!.click();
    await tick();
    inDialog('datasource-candidate-approve')!.click();
    expect(p.approve).toHaveBeenLastCalledWith('orders', true);
  });

  it('一键允许把待批的逐条提交，且带上「记住」的当前取值', async () => {
    const second: DataSourceCandidate = { ...CANDIDATE, id: 'inventory' };
    const p = port({ pending: [CANDIDATE, second] });
    mount(createElement(DataSourceCandidates, { port: p, locale: 'zh' }));
    await tick();

    inDialog('datasource-candidate-remember')!.click();
    await tick();
    inDialog('datasource-candidates-approve-all')!.click();
    await tick();

    expect(p.approve.mock.calls).toEqual([
      ['orders', true],
      ['inventory', true]
    ]);
  });

  it('一键允许在英文下也有文案，且没有待批时不出现', async () => {
    mount(createElement(DataSourceCandidates, { port: port({ pending: [CANDIDATE] }), locale: 'en' }));
    await tick();
    expect(inDialog('datasource-candidates-approve-all')?.textContent).toBe('Allow all');

    root?.unmount();
    container?.remove();
    const el = mount(createElement(DataSourceCandidates, { port: port({ approved: [APPROVED] }), locale: 'zh' }));
    await tick();
    at(el, 'datasource-candidates-open')!.click();
    await tick();
    expect(inDialog('datasource-candidates-approve-all')).toBeNull();
  });

  it('已批准的可以就地撤销，且不再占着待批位置（FR-21.2）', async () => {
    const p = port({ approved: [APPROVED] });
    const el = mount(createElement(DataSourceCandidates, { port: p, locale: 'zh' }));
    await tick();

    at(el, 'datasource-candidates-open')!.click();
    await tick();
    expect(inDialog('datasource-candidate')).toBeNull();
    inDialog('datasource-approved-forget')!.click();
    expect(p.forget).toHaveBeenCalledWith('orders');
  });

  it('一键撤销把已允许的逐条交还，英文下也有文案', async () => {
    const p = port({ approved: [APPROVED, { ...APPROVED, id: 'inventory' }] });
    const el = mount(createElement(DataSourceCandidates, { port: p, locale: 'en' }));
    await tick();

    at(el, 'datasource-candidates-open')!.click();
    await tick();
    expect(inDialog('datasource-approved-forget-all')?.textContent).toBe('Revoke all');

    inDialog('datasource-approved-forget-all')!.click();
    await tick();
    expect(p.forget.mock.calls).toEqual([['orders'], ['inventory']]);
  });

  it('地址不进界面：已批准的条目只显示 id', async () => {
    const el = mount(createElement(DataSourceCandidates, { port: port({ approved: [APPROVED] }), locale: 'zh' }));
    await tick();

    at(el, 'datasource-candidates-open')!.click();
    await tick();
    expect(dialog()?.textContent).not.toContain('https://x/y');
  });

  it('只剩已批准时不自己弹出来，只留一个图标入口', async () => {
    const el = mount(createElement(DataSourceCandidates, { port: port({ approved: [APPROVED] }), locale: 'zh' }));
    await tick();

    expect(dialog()).toBeNull();
    expect(at(el, 'datasource-candidates-open')).not.toBeNull();
  });

  it('待批候选自己弹出来，全部处置完后收回成图标', async () => {
    let pending: readonly DataSourceCandidate[] = [CANDIDATE];
    const listeners = new Set<() => void>();
    let version = 0;
    const p: DataSourceCandidatesPort = {
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      version: () => version,
      snapshot: () => ({ pending, approved: pending.length === 0 ? [APPROVED] : [], shadowOf: () => undefined }),
      approve: async () => {
        pending = [];
        version += 1;
        for (const listener of [...listeners]) listener();
      },
      forget: async () => undefined
    };
    const el = mount(createElement(DataSourceCandidates, { port: p, locale: 'zh' }));
    await tick();
    expect(dialog()).not.toBeNull();

    inDialog('datasource-candidate-approve')!.click();
    // 弹窗卸载走 Radix 的关闭流程，不在一次 tick 内完成
    await waitUntil(() => dialog() === null);

    // 批完就该把对话区还回去；入口得留着，否则撤销无处可点
    expect(dialog()).toBeNull();
    expect(at(el, 'datasource-candidates-open')).not.toBeNull();
  });
});

/**
 * 候选源区块挂在 `Chatbot` **旁边**，`Chatbot` 自带的那层 `ThemeScope` 罩不到它。
 * 主题与语言因此必须由外壳自己接：读源码只能证明写了 `bg-background`，
 * 证明不了它落在带 `.dark` 的祖先里——而这正是它在暗色下变成白斑的原因。
 */
describe('面板外壳的主题与语言', () => {
  /** 只喂外观那一段；`withRuntimeConfigDefaults` 会把其余字段补齐 */
  function configStore(appearance: { theme: 'light' | 'dark'; locale: 'en' | 'zh' }) {
    const listeners = new Set<() => void>();
    let current = appearance;
    return {
      store: {
        load: async () => ({ appearance: { ...current, renderer: 'native', dictationLang: '' } }) as never,
        save: async () => undefined,
        reset: async () => undefined,
        subscribe: (listener: () => void) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        }
      },
      switchTo(next: { theme: 'light' | 'dark'; locale: 'en' | 'zh' }) {
        current = next;
        for (const listener of listeners) listener();
      }
    };
  }

  const FALLBACK = { theme: 'light', locale: 'zh', renderer: 'native', dictationLang: '' } as const;

  /** 焦点一致即提示条不存在（DV-3）；本组测的是候选源区块，用一致的桩把它排除在外 */
  const MATCHED_FOCUS = {
    subscribe: () => () => undefined,
    matched: () => true,
    page: () => undefined,
    follow: () => undefined
  };

  const shell = (store: ReturnType<typeof configStore>['store'], p: DataSourceCandidatesPort) =>
    createElement(SidePanelShell, {
      runtimeConfig: store,
      candidates: p,
      agentFocus: MATCHED_FOCUS,
      fallback: FALLBACK,
      children: null
    });

  it('暗色下候选源区块落在带 dark 的祖先里，语义色才取得到暗色值', async () => {
    const { store } = configStore({ theme: 'dark', locale: 'zh' });
    const el = mount(shell(store, port({ pending: [CANDIDATE] })));
    await waitUntil(() => at(el, 'datasource-candidates')?.closest('.dark') != null);

    const section = at(el, 'datasource-candidates');
    expect(section).not.toBeNull();
    expect(section!.closest('.dark')).not.toBeNull();
    // 弹窗走 portal，容易落到作用域外面去——那才是真正会变白斑的一块
    expect(dialog()!.closest('.dark')).not.toBeNull();
  });

  it('亮色下同一个区块不带 dark，否则整块反过来变黑', async () => {
    const { store } = configStore({ theme: 'light', locale: 'zh' });
    const el = mount(shell(store, port({ pending: [CANDIDATE] })));
    await tick();

    expect(at(el, 'datasource-candidates')!.closest('.dark')).toBeNull();
    expect(dialog()!.closest('.dark')).toBeNull();
  });

  it('语言跟着运行时配置走，切了不用重开面板', async () => {
    const { store, switchTo } = configStore({ theme: 'dark', locale: 'zh' });
    mount(shell(store, port({ pending: [CANDIDATE] })));
    await tick();
    expect(dialog()!.textContent ?? '').toContain('本站点自荐的数据源');

    switchTo({ theme: 'dark', locale: 'en' });
    await tick();

    const en = dialog()!.textContent ?? '';
    expect(en).not.toContain('本站点自荐的数据源');
    expect(en).toContain('Data sources declared by this site');
  });

  /**
   * 焦点提示条（0.16.0 分册 11 / FR-11.7）。它与候选源区块同为「挂在 Chatbot 旁边」的自绘块，
   * 因此受同一组硬约束：主题自适应、中英双语、一致时整个不存在。
   */
  describe('焦点提示条', () => {
    const focusPort = (state: { matched: boolean; page?: { title?: string; url?: string } }) => {
      const listeners = new Set<() => void>();
      return {
        subscribe: (listener: () => void) => {
          listeners.add(listener);
          return () => void listeners.delete(listener);
        },
        matched: () => state.matched,
        page: () => state.page,
        follow: vi.fn(() => {
          state.matched = true;
          for (const listener of [...listeners]) listener();
        })
      };
    };

    const shellWith = (
      store: ReturnType<typeof configStore>['store'],
      focus: ReturnType<typeof focusPort>
    ): ReturnType<typeof createElement> =>
      createElement(SidePanelShell, {
        runtimeConfig: store,
        candidates: port({}),
        agentFocus: focus,
        fallback: FALLBACK,
        children: null
      });

    it('DV-3：焦点一致时提示条整个不存在，而不是渲染一条隐藏的空条', async () => {
      const { store } = configStore({ theme: 'dark', locale: 'zh' });
      const el = mount(shellWith(store, focusPort({ matched: true })));
      await tick();

      expect(el.querySelector('[data-testid="agent-focus-notice"]')).toBeNull();
    });

    it('不一致时落在带 dark 的祖先里，语义色才取得到暗色值', async () => {
      const { store } = configStore({ theme: 'dark', locale: 'zh' });
      const el = mount(shellWith(store, focusPort({ matched: false, page: { title: '订单 1024' } })));
      await waitUntil(() => el.querySelector('[data-testid="agent-focus-notice"]')?.closest('.dark') != null);

      const notice = el.querySelector('[data-testid="agent-focus-notice"]');
      expect(notice!.textContent).toContain('助手正在另一个标签页上工作');
      expect(notice!.textContent).toContain('订单 1024');
    });

    it('语言跟着运行时配置走', async () => {
      const { store, switchTo } = configStore({ theme: 'light', locale: 'zh' });
      const el = mount(shellWith(store, focusPort({ matched: false })));
      await waitUntil(() =>
        (el.querySelector('[data-testid="agent-focus-notice"]')?.textContent ?? '').includes('助手')
      );

      switchTo({ theme: 'light', locale: 'en' });
      await waitUntil(() =>
        (el.querySelector('[data-testid="agent-focus-notice"]')?.textContent ?? '').includes('another tab')
      );
      expect(el.querySelector('[data-testid="agent-focus-notice"]')!.textContent).not.toContain('助手');
    });

    it('点「跟随」后提示条自行消失', async () => {
      const { store } = configStore({ theme: 'light', locale: 'zh' });
      const focus = focusPort({ matched: false });
      const el = mount(shellWith(store, focus));
      await waitUntil(() => el.querySelector('[data-testid="agent-focus-follow"]') != null);

      (el.querySelector('[data-testid="agent-focus-follow"]') as HTMLButtonElement).click();
      await waitUntil(() => el.querySelector('[data-testid="agent-focus-notice"]') == null);

      expect(focus.follow).toHaveBeenCalledTimes(1);
    });
  });
});

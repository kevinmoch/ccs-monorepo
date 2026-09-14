// @vitest-environment jsdom
/**
 * 双层叠加的投放面骨架（0.22.0 分册 35）。
 *
 * 与 `dwgPanelHeader.test.ts` 同法：走真的 `createExtensionDwgHost().project(...)`，
 * 把投放面换成记账用的假体，再用 DOM 解析真实吐出的 HTML。
 * 画布行为（叠加、换序、吸附）验不了——那要真画布，归 `e2e-extension/dwg.spec.ts`。
 */

import { describe, expect, it } from 'vitest';
import { createExtensionDwgHost } from '../src/shared/dwgHost';

interface Opened {
  skillName: string;
  dataSource: string;
  document: { html: string; css: string; data: unknown };
}

const DOC = {
  version: 'AC1018',
  layers: [{ name: 'WALL', color: '#00ff00', visible: true }],
  entities: [],
  bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 },
  omissions: [],
  views: []
} as never;

async function render(
  drawings: readonly { title: string; fileName?: string; document?: unknown }[],
  locale: 'zh' | 'en' = 'zh'
): Promise<{ dom: Document; css: string; opened: Opened }> {
  let opened: Opened | undefined;
  const host = createExtensionDwgHost({
    locale: () => locale,
    surface: () =>
      ({
        open: (request: Opened) => {
          opened = request;
          return Promise.resolve();
        }
      }) as never
  });
  await host.project({
    drawings: drawings.map((d) => ({ ...d, document: (d.document ?? DOC) as never }))
  });
  if (opened === undefined) throw new Error('surface was never opened');
  return { dom: new DOMParser().parseFromString(opened.document.html, 'text/html'), css: opened.document.css, opened };
}

describe('只打开一份时与分册 34 看不出差别（AC-35.4）', () => {
  it('没有图层栈、没有层提示', async () => {
    const { dom } = await render([{ title: 'a', fileName: 'a.dwg' }]);
    expect(dom.querySelectorAll('.dwg-panel')).toHaveLength(1);
    expect(dom.querySelector('#dwg-stack')).toBeNull();
    expect(dom.querySelector('#dwg-stack-list')).toBeNull();
    // 只有一层就没有「我在操作哪一层」可言，摆个常亮的提示是噪声
    expect(dom.querySelector('#dwg-active')).toBeNull();
  });

  it('面板内的 id 不带后缀，与分册 34 同名', async () => {
    const { dom } = await render([{ title: 'a', fileName: 'a.dwg' }]);
    for (const id of [
      'dwg-panel',
      'dwg-file',
      'dwg-tabs',
      'dwg-tab-views',
      'dwg-tab-layers',
      'dwg-tab-props',
      'dwg-page-views',
      'dwg-page-layers',
      'dwg-page-props',
      'dwg-views',
      'dwg-layers',
      'dwg-layers-all',
      'dwg-dense',
      'dwg-fit'
    ]) {
      expect(dom.querySelector(`#${id}`), id).not.toBeNull();
    }
    // 后缀只在真有第二块面板时才出现
    expect(dom.querySelector('#dwg-panel-1')).toBeNull();
  });
});

describe('两份时两块面板（AC-35.5）', () => {
  it('各显各的文件名，顺序与入参一致', async () => {
    const { dom } = await render([
      { title: 'a', fileName: '上一版.dwg' },
      { title: 'b', fileName: '这一版.dwg' }
    ]);
    const panels = [...dom.querySelectorAll('.dwg-panel[data-layer]')];
    expect(panels.map((el) => el.id)).toEqual(['dwg-panel', 'dwg-panel-1']);
    expect(dom.querySelector('#dwg-file')?.textContent).toBe('上一版.dwg');
    expect(dom.querySelector('#dwg-file-1')?.textContent).toBe('这一版.dwg');
  });

  it('两块面板各有一整套视图 / 图层 / 属性', async () => {
    const { dom } = await render([
      { title: 'a', fileName: 'a.dwg' },
      { title: 'b', fileName: 'b.dwg' }
    ]);
    for (const suffix of ['', '-1']) {
      const ids = [...dom.querySelectorAll(`#dwg-tabs${suffix} button`)].map((el) => el.id);
      expect(ids, suffix).toEqual([`dwg-tab-views${suffix}`, `dwg-tab-layers${suffix}`, `dwg-tab-props${suffix}`]);
      expect(dom.querySelector(`#dwg-layers${suffix}`), suffix).not.toBeNull();
      expect(dom.querySelector(`#dwg-views${suffix}`), suffix).not.toBeNull();
    }
  });

  it('id 全文档唯一，aria-controls 都指得到东西', async () => {
    // 两块面板共用同一套 id 的话，`aria-controls` 会把两块面板的页签绑到同一页上，
    // 屏幕阅读器与 `document.getElementById` 都只会看见第一块
    const { dom, opened } = await render([
      { title: 'a', fileName: 'a.dwg' },
      { title: 'b', fileName: 'b.dwg' }
    ]);
    const ids = [...dom.querySelectorAll('[id]')].map((el) => el.id);
    expect(new Set(ids).size, opened.document.html).toBe(ids.length);
    for (const tab of dom.querySelectorAll('[aria-controls]')) {
      expect(dom.getElementById(tab.getAttribute('aria-controls')!), tab.id).not.toBeNull();
    }
  });

  it('两份的文件名并排进窗口标题', async () => {
    const { dom } = await render([
      { title: 'a', fileName: 'a.dwg' },
      { title: 'b', fileName: 'b.dwg' }
    ]);
    expect(dom.querySelector('#dwg-root')?.getAttribute('data-viewer-title')).toBe('a.dwg · b.dwg');
  });
});

describe('图层栈面板（FR-35.5 / FR-35.7 / FR-35.11）', () => {
  it('只在两份时出现，四个控件齐全', async () => {
    const { dom } = await render([
      { title: 'a', fileName: 'a.dwg' },
      { title: 'b', fileName: 'b.dwg' }
    ]);
    expect(dom.querySelector('#dwg-stack')).not.toBeNull();
    // 列表由查看器按叠放顺序填，骨架里是空的
    expect(dom.querySelector('#dwg-stack-list')?.children).toHaveLength(0);
    for (const id of ['dwg-stack-swap', 'dwg-stack-tint', 'dwg-stack-align', 'dwg-stack-align-reset']) {
      expect(dom.querySelector(`#${id}`), id).not.toBeNull();
    }
    // 染色默认开、对位默认关
    expect(dom.querySelector('#dwg-stack-tint')?.getAttribute('aria-pressed')).toBe('true');
    expect(dom.querySelector('#dwg-stack-align')?.getAttribute('aria-pressed')).toBe('false');
  });

  it('层提示在画布上，不在面板里（FR-35.6）', async () => {
    const { dom } = await render([
      { title: 'a', fileName: 'a.dwg' },
      { title: 'b', fileName: 'b.dwg' }
    ]);
    const badge = dom.querySelector('#dwg-active');
    expect(badge).not.toBeNull();
    // 塞进左上角的面板里就等于「只在列表里加个高亮」，用户原话是要一眼能看出来
    expect(badge!.closest('#dwg-rail')).toBeNull();
    expect(badge!.querySelector('.dwg-active-name')).not.toBeNull();
  });

  it('中英双语各出各的字', async () => {
    const zh = await render([{ title: 'a' }, { title: 'b' }]);
    expect(zh.dom.querySelector('#dwg-stack-swap')?.textContent).toBe('换序');
    expect(zh.dom.querySelector('#dwg-stack')?.querySelector('h2')?.textContent).toBe('叠放');

    const en = await render([{ title: 'a' }, { title: 'b' }], 'en');
    expect(en.dom.querySelector('#dwg-stack-swap')?.textContent).toBe('Reorder');
    expect(en.dom.querySelector('#dwg-stack')?.querySelector('h2')?.textContent).toBe('Stack');
  });
});

describe('两块面板摆得下（FR-35.4）', () => {
  const ruleOf = (css: string, selector: string): string =>
    new RegExp(`\\n${selector.replace(/[#.]/g, '\\$&')} \\{([^}]*)\\}`).exec(css)?.[1] ?? '';

  it('面板区自己能滚，而不是把第二块挤出屏幕', async () => {
    const { css } = await render([{ title: 'a' }, { title: 'b' }]);
    const rail = ruleOf(css, '#dwg-rail');
    expect(rail).toContain('overflow: auto');
    expect(rail).toContain('position: fixed');
    // 底边留出量测工具栏的高度：面板区压到底就会盖住工具栏（它同样是 fixed）
    const bottom = /bottom:\s*(\d+)px/.exec(rail)?.[1];
    expect(Number(bottom)).toBeGreaterThanOrEqual(56);
  });

  it('面板不再各自 fixed，改由面板区排版', async () => {
    // 每块面板都 `position: fixed; top: 56px` 的话，两块会精确地叠在一起
    const { css } = await render([{ title: 'a' }, { title: 'b' }]);
    expect(ruleOf(css, '.dwg-panel')).not.toContain('position:');
    expect(css).not.toMatch(/\n#dwg-panel \{/);
  });
});

describe('投放载荷（AC-35.3 / AC-35.16）', () => {
  it('几何按份下发，顺序与入参一致', async () => {
    const first = { ...(DOC as unknown as Record<string, unknown>), version: 'AC1015' };
    const { opened } = await render([
      { title: 'a', fileName: 'a.dwg', document: first },
      { title: 'b', fileName: 'b.dwg' }
    ]);
    const data = opened.document.data as { kind: string; lang: string; drawings: { version: string }[] };
    expect(data.kind).toBe('dwg');
    expect(data.drawings).toHaveLength(2);
    expect(data.drawings[0]?.version).toBe('AC1015');
    expect(data.drawings[1]?.version).toBe('AC1018');
  });

  it('AC-35.16 投放载荷里的实体色与图层色原样透传，染色不碰它们', async () => {
    // 染色是画到画布上那一步的滤镜。写回载荷的话，切回原色就再也回不去了
    const { opened } = await render([{ title: 'a' }, { title: 'b' }]);
    const data = opened.document.data as { drawings: { layers: { color: string }[] }[] };
    for (const drawing of data.drawings) expect(drawing.layers[0]?.color).toBe('#00ff00');
    expect(opened.document.html).not.toContain('#ff3d9a');
    expect(opened.document.css).not.toContain('#ff3d9a');
  });

  it('数据来源列出全部取件号，两份都要进告知卡', async () => {
    const { opened } = await render([{ title: 'doc-aaa' }, { title: 'doc-bbb' }]);
    expect(opened.dataSource).toBe('doc-aaa, doc-bbb');
  });
});

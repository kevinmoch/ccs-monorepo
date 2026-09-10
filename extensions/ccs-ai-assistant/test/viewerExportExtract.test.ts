// @vitest-environment jsdom
/**
 * 语义抽取与未导出清单（0.21.0 分册 15 AC-15.3 / AC-15.9 / AC-15.10）。
 */
import { describe, expect, it, vi } from 'vitest';
import { WebSkillError } from '@webskill/core';
import { extractExportDoc, plain } from '../src/viewer/export/extract';
import { describeOmissions } from '../src/viewer/export/omissions';
import { setupViewerExport } from '../src/viewer/export/index';

const CHART_PROPS = JSON.stringify({
  type: 'bar',
  title: '季度营收',
  labels: ['Q1', 'Q2'],
  series: [{ name: '营收', values: [12, 18] }]
});
const GAUGE_PROPS = JSON.stringify({ label: '完成率', value: 72, min: 0, max: 100 });

const THREE_PAGES = `
<div data-viewer-mode="slides">
  <div class="slides">
    <section>
      <h2>开场白</h2>
      <p>本季度 <strong>超额</strong> 完成。</p>
      <ul><li>要点一</li><li>要点二</li></ul>
    </section>
    <section>
      <h2>营收结构</h2>
      <div data-webskill-component="Chart" data-webskill-props='${CHART_PROPS}'></div>
    </section>
    <section>
      <h2>下一步</h2>
      <table><thead><tr><th>事项</th><th>负责人</th></tr></thead>
        <tbody><tr><td>扩产</td><td>张三</td></tr></tbody></table>
    </section>
  </div>
</div>`;

describe('AC-15.3 · 抽取幻灯片', () => {
  const doc = extractExportDoc(THREE_PAGES);

  it('三个 section 就是三页，页标题逐字等于各自的 h2', () => {
    expect(doc.kind).toBe('slides');
    expect(doc.pages.map((page) => page.title)).toEqual(['开场白', '营收结构', '下一步']);
  });

  it('页标题不在正文里重复出现', () => {
    expect(doc.pages[0]?.blocks.some((block) => block.kind === 'heading')).toBe(false);
  });

  it('段落里的粗体是分片的，不是整段变粗', () => {
    const paragraph = doc.pages[0]?.blocks.find((block) => block.kind === 'paragraph');
    expect(paragraph?.kind).toBe('paragraph');
    if (paragraph?.kind !== 'paragraph') return;
    expect(plain(paragraph.runs)).toBe('本季度 超额 完成。');
    expect(paragraph.runs.filter((run) => run.bold === true).map((run) => run.text)).toEqual(['超额']);
  });

  it('列表、图表、表格各自成块', () => {
    expect(doc.pages[0]?.blocks.find((block) => block.kind === 'list')).toMatchObject({
      ordered: false,
      items: [[{ text: '要点一' }], [{ text: '要点二' }]]
    });
    expect(doc.pages[1]?.blocks[0]).toMatchObject({ kind: 'chart', props: { type: 'bar' } });
    expect(doc.pages[2]?.blocks[0]).toMatchObject({
      kind: 'table',
      props: { columns: ['事项', '负责人'], rows: [['扩产', '张三']] }
    });
  });

  it('文档标题取首页标题', () => {
    expect(doc.title).toBe('开场白');
  });
});

describe('AC-15.3 · 抽取公文', () => {
  const doc = extractExportDoc(
    '<div class="bulletin"><div class="bulletin__org">某某厅</div><h1>关于开展年度核查的通告</h1><p>各单位：</p></div>'
  );

  it('没有根节点标记的一律按公文抽，整篇是一页', () => {
    expect(doc.kind).toBe('bulletin');
    expect(doc.pages).toHaveLength(1);
  });

  it('裸 div 里的直接文字不会被吃掉', () => {
    expect(doc.pages[0]?.blocks[0]).toMatchObject({ kind: 'paragraph', runs: [{ text: '某某厅' }] });
  });

  it('标题保留在正文里，同时充当文档标题', () => {
    expect(doc.pages[0]?.blocks[1]).toMatchObject({ kind: 'heading', level: 1 });
    expect(doc.title).toBe('关于开展年度核查的通告');
  });
});

describe('AC-15.9 · 未导出清单如实列出', () => {
  const doc = extractExportDoc(`
    <div data-viewer-mode="slides"><div class="slides"><section>
      <h2>指标</h2>
      <div data-webskill-component="Gauge" data-webskill-props='${GAUGE_PROPS}'></div>
      <svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" /></svg>
      <div data-webskill-component="Nope" data-webskill-props='{}'></div>
      <div data-webskill-component="Chart" data-webskill-props='{ not json '></div>
    </section></div></div>`);

  it('逐类计数，一类不漏', () => {
    expect(doc.omissions).toEqual([
      { kind: 'gauge-shape', count: 1 },
      { kind: 'inline-graphic', count: 1 },
      { kind: 'css-decoration', count: 1 },
      { kind: 'unparsable-component-props', count: 1 },
      { kind: 'unknown-component', count: 1 }
    ]);
  });

  it('仪表盘的**数值**还在，丢的只是形态', () => {
    expect(doc.pages[0]?.blocks[0]).toMatchObject({ kind: 'textCard', label: '完成率', lines: ['72 / 100'] });
  });

  it('清单文案中英双语，且不暗示「换个方式就能导出」', () => {
    const zh = describeOmissions(doc.omissions, true);
    const en = describeOmissions(doc.omissions, false);
    expect(zh).toContain('1 张仪表盘的图形形态');
    expect(zh).toContain('技能自带的配色与版式');
    expect(en).toContain('1 gauge as shapes');
    for (const text of [zh, en]) {
      expect(text).not.toMatch(/重试|再试|retry|try again/i);
    }
  });

  it('空清单不说话', () => {
    expect(describeOmissions([], true)).toBe('');
  });

  it('降级与缺失分开说', () => {
    expect(describeOmissions([{ kind: 'chart-downgraded-to-table', count: 2 }], true)).toBe('2 张图表已降级为数据表。');
  });
});

describe('AC-15.10 · 抽不出东西就不产出字节', () => {
  it('幻灯片版式但没有 section → 抛 WebSkillError', () => {
    expect(() => extractExportDoc('<div data-viewer-mode="slides"><div class="slides"></div></div>')).toThrow(
      WebSkillError
    );
  });

  it('整篇没有一段文字 → 抛 WebSkillError', () => {
    expect(() => extractExportDoc('<div class="bulletin"><div></div></div>')).toThrow(WebSkillError);
  });

  it('点了导出也不会生成任何 blob，且就地把失败说清楚', async () => {
    const createObjectURL = vi.fn(() => 'blob:none');
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL: vi.fn() });
    const said: string[] = [];
    const ui = {
      button: document.createElement('button'),
      label: document.createElement('span'),
      notice: { show: (text: string) => void said.push(text) }
    };
    setupViewerExport('<div data-viewer-mode="slides"><div class="slides"></div></div>', ui, true);
    expect(ui.button.hidden).toBe(false);
    ui.button.click();
    await vi.waitFor(() => expect(said.at(-1)).not.toBe(''));
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(said.at(-1)).toContain('EXPORT_FAILED');
    expect(ui.button.disabled).toBe(false);
    vi.unstubAllGlobals();
  });
});

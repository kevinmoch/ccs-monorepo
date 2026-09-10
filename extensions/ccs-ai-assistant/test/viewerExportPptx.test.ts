// @vitest-environment jsdom
/**
 * 幻灯片 → PPTX（0.21.0 分册 15 AC-15.4 / AC-15.5 / AC-15.7）。
 *
 * 断言落在**解包后的 OOXML 部件**上，不是「函数返回了一个 Blob」——
 * 后者在编码器整个坏掉时照样能通过。
 */
import { unzipWithLimits } from '@webskill/core';
import { beforeAll, describe, expect, it } from 'vitest';
import { encodePptx } from '../src/viewer/export/pptx';
import type { ExportDoc } from '../src/viewer/export/extract';

const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

const chart = (type: string, seriesCount = 1): ExportDoc['pages'][number]['blocks'][number] => ({
  kind: 'chart',
  props: {
    type,
    title: `${type} 图`,
    labels: ['Q1', 'Q2', 'Q3'],
    series: Array.from({ length: seriesCount }, (_, i) => ({ name: `S${i + 1}`, values: [1 + i, 2 + i, 3 + i] }))
  }
});

const DOC: ExportDoc = {
  kind: 'slides',
  title: '年度汇报',
  omissions: [{ kind: 'css-decoration', count: 1 }],
  pages: [
    {
      title: '开场白',
      blocks: [
        { kind: 'paragraph', runs: [{ text: '本季度 ' }, { text: '超额', bold: true }, { text: ' 完成。' }] },
        { kind: 'list', ordered: false, items: [[{ text: '要点一' }], [{ text: '要点二' }]] },
        { kind: 'textCard', label: '完成率', lines: ['72 / 100'] }
      ]
    },
    { title: '营收结构', blocks: [chart('stacked-bar', 2)] },
    { title: '双轴对比', blocks: [chart('dual-axis', 2)] },
    { title: '不认识的类型', blocks: [chart('sankey')] },
    {
      title: '下一步',
      blocks: [{ kind: 'table', props: { columns: ['事项', '负责人'], rows: [['扩产', '张三']] } }]
    }
  ]
};

describe('encodePptx', () => {
  let blob: Blob;
  let omissions: { kind: string; count: number }[];
  let parts: Map<string, string>;
  let entryNames: string[];

  beforeAll(async () => {
    const encoded = await encodePptx(DOC);
    blob = encoded.blob;
    omissions = encoded.omissions;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const unzipped = await unzipWithLimits(bytes);
    entryNames = unzipped.map(([name]) => name);
    parts = new Map(unzipped.map(([name, data]) => [name, new TextDecoder().decode(data)]));
  }, 30_000);

  it('AC-15.7 · Blob 的 MIME 是 pptx，不是 pptxgenjs 交回来的 application/zip', () => {
    expect(blob.type).toBe(PPTX_MIME);
    expect(blob.size).toBeGreaterThan(1000);
  });

  it('AC-15.4 · 一页一张幻灯片，标题与正文都是可编辑的文本', () => {
    const slides = entryNames.filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name));
    expect(slides).toHaveLength(DOC.pages.length);
    const first = parts.get('ppt/slides/slide1.xml') ?? '';
    expect(first).toContain('<a:t>开场白</a:t>');
    expect(first).toContain('<a:t>超额</a:t>');
    expect(first).toContain('<a:t>要点一</a:t>');
    expect(first).toContain('<a:t>完成率</a:t>');
  });

  it('AC-15.4 · 表格落成 PPTX 原生表格（a:tbl），不是一张图', () => {
    const last = parts.get(`ppt/slides/slide${DOC.pages.length}.xml`) ?? '';
    expect(last).toContain('<a:tbl>');
    expect(last).toContain('<a:t>负责人</a:t>');
  });

  it('AC-15.4 · 图表落成原生图表部件，堆叠与双轴都成立', () => {
    const charts = entryNames.filter((name) => /^ppt\/charts\/chart\d+\.xml$/.test(name));
    // sankey 不受支持，降级成表，所以图表部件只有两个
    expect(charts).toHaveLength(2);
    const xml = charts.map((name) => parts.get(name) ?? '');
    expect(xml.some((one) => one.includes('<c:grouping val="stacked"/>'))).toBe(true);
    expect(xml.some((one) => (one.match(/<c:valAx>/g) ?? []).length === 2)).toBe(true);
  });

  it('AC-15.5 · 没有任何图片部件：一张位图都不许混进来', () => {
    // pptxgenjs 总会写一个空的 `ppt/media/` 目录项；判据是「目录下没有条目」，不是「没有目录」
    expect(entryNames.filter((name) => name.startsWith('ppt/media/') && !name.endsWith('/'))).toEqual([]);
  });

  it('不受支持的图表类型降级成数据表，并写进未导出清单', () => {
    expect(omissions).toContainEqual({ kind: 'unsupported-chart-type', count: 1 });
    expect(omissions).toContainEqual({ kind: 'css-decoration', count: 1 });
    const slide = parts.get('ppt/slides/slide4.xml') ?? '';
    expect(slide).toContain('<a:tbl>');
    expect(slide).toContain('<a:t>Q1</a:t>');
  });
});

describe('encodePptx · 受支持的图表类型逐个成立', () => {
  it.each(['bar', 'line', 'area', 'pie', 'scatter'])(
    '%s',
    async (type) => {
      const { blob, omissions } = await encodePptx({
        kind: 'slides',
        title: type,
        omissions: [],
        pages: [{ title: type, blocks: [chart(type, 2)] }]
      });
      expect(omissions).not.toContainEqual(expect.objectContaining({ kind: 'unsupported-chart-type' }));
      const unzipped = await unzipWithLimits(new Uint8Array(await blob.arrayBuffer()));
      expect(unzipped.some(([name]) => /^ppt\/charts\/chart\d+\.xml$/.test(name))).toBe(true);
    },
    30_000
  );
});

/**
 * 结构化投放那条路（0.21.0 分册 19）：版式与取色不再由编码器自己猜，
 * 而是照抄屏幕上用的那一份。
 */
describe('encodePptx · 结构化投放', () => {
  const MODEL: ExportDoc = {
    kind: 'slides',
    title: '三季度经营分析',
    omissions: [],
    theme: {
      background: '#0f1b2e',
      surface: '#17253c',
      text: '#f2f7ff',
      muted: '#a8bcd9',
      accent: '#4da3ff',
      border: '#2a3d5c'
    },
    pages: [
      {
        layout: 'cover',
        title: '三季度经营分析',
        subtitle: '经营管理部',
        meta: [{ label: '汇报日期', value: '2024-10-09' }],
        blocks: [],
        regions: []
      },
      {
        layout: 'split',
        title: '总体盘面',
        takeaway: '收入连续三个月环比上升。',
        blocks: [],
        regions: [
          [{ kind: 'metrics', items: [{ label: '总收入', value: '2 530 万', change: '+12.4%' }] }],
          [
            {
              kind: 'chart',
              props: {
                type: 'line',
                title: '月度收入',
                labels: ['7 月', '8 月'],
                series: [{ name: '收入', values: [780, 840] }]
              }
            }
          ]
        ]
      },
      {
        layout: 'grid',
        title: '分产品线',
        takeaway: '增长集中在支付一条线上。',
        blocks: [],
        regions: [
          [{ kind: 'table', props: { columns: ['产品线', '收入'], rows: [['支付', 1240]] } }],
          [{ kind: 'list', ordered: false, items: [[{ text: '支付贡献全部增量' }]] }],
          [{ kind: 'keyValue', items: [{ label: '口径', value: '含税' }] }]
        ]
      }
    ]
  };

  let parts: Map<string, string>;

  beforeAll(async () => {
    const encoded = await encodePptx(MODEL);
    const unzipped = await unzipWithLimits(new Uint8Array(await encoded.blob.arrayBuffer()));
    parts = new Map(unzipped.map(([name, data]) => [name, new TextDecoder().decode(data)]));
  }, 30_000);

  it('封面页把副标题与元信息一起带上', () => {
    const cover = parts.get('ppt/slides/slide1.xml') ?? '';
    expect(cover).toContain('<a:t>三季度经营分析</a:t>');
    expect(cover).toContain('<a:t>经营管理部</a:t>');
    expect(cover).toContain('<a:t>汇报日期：2024-10-09</a:t>');
  });

  it('两栏页真的是并排两栏，不是摊成一列', () => {
    const split = parts.get('ppt/slides/slide2.xml') ?? '';
    // 左槽的指标卡与右槽的图表各占半幅；靠左边距（EMU）区分，同一列的话两者会相等
    const offsets = [...split.matchAll(/<a:off x="(\d+)"/g)].map((match) => Number(match[1]));
    expect(new Set(offsets).size).toBeGreaterThan(1);
    expect(split).toContain('<a:t>总收入</a:t>');
    expect(split).toContain('<a:t>2 530 万</a:t>');
    expect(split).toContain('<a:t>收入连续三个月环比上升。</a:t>');
  });

  it('三栏页每个槽位各自成块，表格仍是原生表格', () => {
    const grid = parts.get('ppt/slides/slide3.xml') ?? '';
    expect(grid).toContain('<a:tbl>');
    expect(grid).toContain('<a:t>支付贡献全部增量</a:t>');
    expect(grid).toContain('<a:t>口径：</a:t>');
    expect(grid).toContain('<a:t>增长集中在支付一条线上。</a:t>');
  });

  it('取色用的是模型带过来的那一份，不是编码器自己配的', () => {
    const cover = parts.get('ppt/slides/slide1.xml') ?? '';
    // 深色底与强调色都来自 palette；写死是故意的——从 doc.theme 反算就变成它永远等于自己
    expect(cover).toContain('0F1B2E');
    expect(cover).toContain('4DA3FF');
  });
});

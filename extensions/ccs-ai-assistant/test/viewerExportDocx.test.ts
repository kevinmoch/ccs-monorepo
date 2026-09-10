// @vitest-environment jsdom
/**
 * 公文 → DOCX（0.21.0 分册 15 AC-15.6 / AC-15.7）。
 */
import { unzipWithLimits } from '@webskill/core';
import { beforeAll, describe, expect, it } from 'vitest';
import { encodeDocx } from '../src/viewer/export/docx';
import type { ExportDoc } from '../src/viewer/export/extract';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const DOC: ExportDoc = {
  kind: 'bulletin',
  title: '关于开展年度核查的通告',
  omissions: [{ kind: 'css-decoration', count: 1 }],
  pages: [
    {
      blocks: [
        { kind: 'heading', level: 1, runs: [{ text: '关于开展年度核查的通告' }] },
        { kind: 'paragraph', runs: [{ text: '各单位：' }] },
        { kind: 'heading', level: 2, runs: [{ text: '一、核查范围' }] },
        { kind: 'paragraph', runs: [{ text: '本次核查 ' }, { text: '覆盖全部', bold: true }, { text: ' 下属机构。' }] },
        { kind: 'list', ordered: true, items: [[{ text: '第一步' }], [{ text: '第二步' }]] },
        { kind: 'list', ordered: false, items: [[{ text: '注意事项' }]] },
        { kind: 'table', props: { title: '进度表', columns: ['阶段', '截止'], rows: [['自查', '3 月']] } },
        {
          kind: 'chart',
          props: {
            type: 'bar',
            title: '往年数量',
            labels: ['2023', '2024'],
            series: [{ name: '件数', values: [7, 9] }]
          }
        }
      ]
    }
  ]
};

describe('encodeDocx', () => {
  let blob: Blob;
  let omissions: { kind: string; count: number }[];
  let xml: string;
  let entryNames: string[];

  /** docx 总带 `xml:space="preserve"`，直接 `toContain('<w:t>x</w:t>')` 会全部落空 */
  const hasText = (text: string): boolean => new RegExp(`<w:t[^>]*>${text}</w:t>`).test(xml);

  beforeAll(async () => {
    const encoded = await encodeDocx(DOC);
    blob = encoded.blob;
    omissions = encoded.omissions;
    const unzipped = await unzipWithLimits(new Uint8Array(await blob.arrayBuffer()));
    entryNames = unzipped.map(([name]) => name);
    xml = new TextDecoder().decode(unzipped.find(([name]) => name === 'word/document.xml')?.[1] ?? new Uint8Array());
  }, 30_000);

  it('AC-15.7 · Blob 的 MIME 是 docx', () => {
    expect(blob.type).toBe(DOCX_MIME);
    expect(blob.size).toBeGreaterThan(1000);
  });

  it('AC-15.6 · 标题层级落成 w:pStyle，不是「字号大一点的普通段落」', () => {
    expect(xml).toContain('<w:pStyle w:val="Heading1"');
    expect(xml).toContain('<w:pStyle w:val="Heading2"');
    expect(hasText('关于开展年度核查的通告')).toBe(true);
  });

  it('AC-15.6 · 粗体只落在该粗的那一片上', () => {
    expect(xml).toMatch(/<w:b\b[^>]*\/>[\s\S]{0,120}<w:t[^>]*>覆盖全部<\/w:t>/);
  });

  it('AC-15.6 · 有序列表用 numbering，不是手写的「1.」', () => {
    expect(xml).toContain('<w:numPr>');
    expect(hasText('1\\. 第一步')).toBe(false);
    expect(entryNames).toContain('word/numbering.xml');
  });

  it('AC-15.6 · 表格落成 w:tbl', () => {
    expect(xml).toContain('<w:tbl>');
    expect(hasText('截止')).toBe(true);
  });

  it('DV-14 · 图表降级成数据表，并写进未导出清单', () => {
    expect(omissions).toContainEqual({ kind: 'chart-downgraded-to-table', count: 1 });
    expect(hasText('往年数量')).toBe(true);
    expect(hasText('2024')).toBe(true);
    expect(hasText('件数')).toBe(true);
  });

  it('A4 与 16mm 边距跟着走：这是打印契约，不是装饰', () => {
    // 210mm / 297mm / 16mm 换算成 twip 后的整数值；写死是故意的——
    // 拿 `convertMillimetersToTwip` 反算就变成它永远等于自己
    expect(xml).toContain('w:w="11905"');
    expect(xml).toContain('w:h="16837"');
    expect(xml).toContain('w:top="907"');
    expect(xml).toContain('w:left="907"');
  });
});

/**
 * 结构化投放那条路（0.21.0 分册 19）。
 *
 * 这些块在旧的「刮 DOM」通路上根本表达不出来——正是它们让另存件与屏幕漂开。
 */
const PNG_1PX =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const MODEL_DOC: ExportDoc = {
  kind: 'bulletin',
  title: '三季度交付质量分析',
  omissions: [],
  theme: {
    background: '#ffffff',
    surface: '#f5f7fa',
    text: '#1a1a1a',
    muted: '#5c6b7f',
    accent: '#1a6fd4',
    border: '#d8dee8'
  },
  header: {
    docType: 'plain',
    subtitle: '研发中心',
    meta: [{ label: '统计范围', value: '2024 Q3' }],
    signature: { org: '研发质量组', date: '2024 年 10 月 9 日' }
  },
  pages: [
    {
      blocks: [
        { kind: 'metrics', items: [{ label: '缺陷总数', value: 1284, change: '-12.4%' }] },
        { kind: 'keyValue', title: '统计口径', items: [{ label: '周期', value: '2024 Q3' }] },
        { kind: 'callout', tone: 'warning', title: '需要关注', runs: [{ text: '遗留缺陷连续两季度上升。' }] },
        { kind: 'quote', runs: [{ text: '质量红线不可突破。' }], source: '管理办法第 12 条' },
        { kind: 'divider' },
        { kind: 'pageBreak' },
        {
          kind: 'chart',
          props: {
            type: 'line',
            title: '月度趋势',
            labels: ['7 月', '8 月'],
            series: [{ name: '新增', values: [468, 421] }],
            image: { url: PNG_1PX, width: 800, height: 400 }
          }
        }
      ]
    }
  ]
};

describe('encodeDocx · 结构化投放', () => {
  let xml: string;
  let entryNames: string[];
  let omissions: { kind: string; count: number }[];
  const hasText = (text: string): boolean => new RegExp(`<w:t[^>]*>${text}</w:t>`).test(xml);

  beforeAll(async () => {
    const encoded = await encodeDocx(MODEL_DOC);
    omissions = encoded.omissions;
    const unzipped = await unzipWithLimits(new Uint8Array(await encoded.blob.arrayBuffer()));
    entryNames = unzipped.map(([name]) => name);
    xml = new TextDecoder().decode(unzipped.find(([name]) => name === 'word/document.xml')?.[1] ?? new Uint8Array());
  }, 30_000);

  it('页眉信息与落款都在，普通文档不出红头', () => {
    expect(hasText('三季度交付质量分析')).toBe(true);
    expect(hasText('研发中心')).toBe(true);
    expect(hasText('统计范围：2024 Q3')).toBe(true);
    expect(hasText('研发质量组')).toBe(true);
    // 红头那条粗红线只属于公文
    expect(xml).not.toContain('C0202A');
  });

  it('指标卡、键值表、提示框、引文都落成可编辑内容，不是丢掉', () => {
    expect(hasText('缺陷总数')).toBe(true);
    expect(hasText('1284')).toBe(true);
    expect(hasText('-12\\.4%')).toBe(true);
    expect(hasText('统计口径')).toBe(true);
    expect(hasText('周期')).toBe(true);
    expect(hasText('需要关注')).toBe(true);
    expect(hasText('遗留缺陷连续两季度上升。')).toBe(true);
    expect(hasText('质量红线不可突破。')).toBe(true);
    expect(hasText('—— 管理办法第 12 条')).toBe(true);
  });

  it('强制分页落成 pageBreakBefore', () => {
    expect(xml).toContain('<w:pageBreakBefore/>');
  });

  it('图表贴的是屏幕上那张画布，数字仍另附数据表', () => {
    expect(entryNames.some((name) => name.startsWith('word/media/'))).toBe(true);
    expect(xml).toContain('<a:blip');
    expect(omissions).toContainEqual({ kind: 'chart-as-picture', count: 1 });
    expect(omissions).not.toContainEqual(expect.objectContaining({ kind: 'chart-downgraded-to-table' }));
    // 数据表跟在图后面，所以数字还改得动
    expect(xml).toContain('<w:tbl>');
    expect(hasText('468')).toBe(true);
  });

  it('拿不到画布快照时退回数据表，并如实记账', async () => {
    const withoutImage: ExportDoc = {
      ...MODEL_DOC,
      pages: [
        {
          blocks: [
            {
              kind: 'chart',
              props: { type: 'line', labels: ['7 月'], series: [{ name: '新增', values: [468] }] }
            }
          ]
        }
      ]
    };
    const encoded = await encodeDocx(withoutImage);
    expect(encoded.omissions).toContainEqual({ kind: 'chart-downgraded-to-table', count: 1 });
    expect(encoded.omissions).not.toContainEqual(expect.objectContaining({ kind: 'chart-as-picture' }));
  }, 30_000);

  it('公文才出红头', async () => {
    const official: ExportDoc = {
      ...MODEL_DOC,
      header: { docType: 'official', official: { issuer: '某某集团办公室', recipient: '各分公司：' } }
    };
    const encoded = await encodeDocx(official);
    const unzipped = await unzipWithLimits(new Uint8Array(await encoded.blob.arrayBuffer()));
    const doc = new TextDecoder().decode(
      unzipped.find(([name]) => name === 'word/document.xml')?.[1] ?? new Uint8Array()
    );
    expect(doc).toContain('C0202A');
    expect(new RegExp('<w:t[^>]*>某某集团办公室</w:t>').test(doc)).toBe(true);
    expect(new RegExp('<w:t[^>]*>各分公司：</w:t>').test(doc)).toBe(true);
  }, 30_000);
});

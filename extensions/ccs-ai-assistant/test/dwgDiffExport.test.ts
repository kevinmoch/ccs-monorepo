// @vitest-environment jsdom
/**
 * 差异汇总与导出（分册 39）。
 *
 * 导出这一侧不打桩 xlsx 编码器：这份文件的全部价值就在于「能被 Excel 打开、
 * 里面的数对得上」，桩掉编码器就只剩下「我调用了一个函数」（T-39-C ~ T-39-F）。
 * 读侧要 `DOMParser` 解 OPC 部件，故走 jsdom。
 */

import { extractXlsxText } from '@webskill/browser';
import { describe, expect, it } from 'vitest';
import { summariseDiff } from '../src/viewer/dwgComponentDiff';
import type { DiffKind, DiffRow } from '../src/viewer/dwgComponentDiff';
import { buildDiffWorkbook, diffWorkbookFilename } from '../src/viewer/dwgDiffWorkbook';
import type { DiffExportInput, DiffExportRow } from '../src/viewer/dwgDiffWorkbook';

const ZH_KINDS: Readonly<Record<DiffKind, string>> = {
  count: '数量',
  moved: '位置',
  attribute: '属性',
  added: '新增',
  missing: '缺失'
};
const EN_KINDS: Readonly<Record<DiffKind, string>> = {
  count: 'count',
  moved: 'moved',
  attribute: 'attribute',
  added: 'added',
  missing: 'missing'
};

function row(kind: DiffKind, block = 'DOOR'): DiffRow {
  return { kind, block, at: { x: 1, y: 2 } };
}

function exportRows(n: number, kind: DiffKind = 'missing'): DiffExportRow[] {
  return Array.from({ length: n }, (_, i) => ({
    no: i + 1,
    kind,
    block: `BLK-${i + 1}`,
    detail: `乙 少了一个 BLK-${i + 1}`,
    x: 1000.123_45 + i,
    y: 2000.987_65
  }));
}

function input(overrides: Partial<DiffExportInput> = {}): DiffExportInput {
  const rows = overrides.rows ?? exportRows(3);
  return {
    zh: true,
    nameA: '甲-平面.dwg',
    nameB: '乙-平面.dwg',
    toleranceMm: 200,
    box: { minX: 0, minY: 0, maxX: 5000, maxY: 3000 },
    counts: { a: 8, b: 7 },
    stray: { a: 5, b: 4 },
    summary: { total: rows.length, byKind: { count: 0, moved: 0, attribute: 0, added: 0, missing: rows.length } },
    kindLabel: ZH_KINDS,
    at: new Date(2026, 8, 14, 15, 30),
    ...overrides,
    rows
  };
}

async function sheetsOf(blob: Blob): Promise<Map<string, string[]>> {
  const text = await extractXlsxText(new Uint8Array(await blob.arrayBuffer()));
  const out = new Map<string, string[]>();
  for (const block of text.split('\n\n')) {
    const [head, ...lines] = block.split('\n');
    out.set((head ?? '').replace(/^Sheet: /, ''), lines);
  }
  return out;
}

describe('T-39-A · 汇总按类型分项（FR-39.4）', () => {
  it('五类各数各的，总数是行数', () => {
    const rows = [row('missing'), row('missing'), row('added'), row('moved'), row('attribute'), row('count')];
    expect(summariseDiff(rows)).toEqual({
      total: 6,
      byKind: { count: 1, moved: 1, attribute: 1, added: 1, missing: 2 }
    });
  });

  it('没有差异时五类全零', () => {
    expect(summariseDiff([])).toEqual({
      total: 0,
      byKind: { count: 0, moved: 0, attribute: 0, added: 0, missing: 0 }
    });
  });
});

describe('T-39-B · 导出的是全量（AC-39.23）', () => {
  it('上千条差异也一条不少', async () => {
    const total = 1000;
    const sheets = await sheetsOf(await buildDiffWorkbook(input({ rows: exportRows(total) })));
    const detail = sheets.get('差异明细') ?? [];
    // 首行是表头，其余是数据
    expect(detail.length - 1).toBe(total);
  });

  it('序号从 1 连到最后一条，与画布编号同一套（AC-39.11）', async () => {
    const sheets = await sheetsOf(await buildDiffWorkbook(input({ rows: exportRows(5) })));
    const detail = (sheets.get('差异明细') ?? []).slice(1);
    expect(detail.map((line) => line.split(/\s+/)[0])).toEqual(['1', '2', '3', '4', '5']);
  });
});

describe('T-39-C · 汇总表把该说的都说了（FR-39.11）', () => {
  it('两份图纸名、容差、范围、覆盖率、总数与分项都在', async () => {
    const rows = exportRows(3);
    const sheets = await sheetsOf(await buildDiffWorkbook(input({ rows })));
    const summary = (sheets.get('汇总') ?? []).join('\n');
    expect(summary).toContain('甲-平面.dwg');
    expect(summary).toContain('乙-平面.dwg');
    expect(summary).toContain('2026-09-14 15:30');
    expect(summary).toContain('200');
    expect(summary).toContain('X 0.00 ~ 5000.00');
    expect(summary).toContain('Y 0.00 ~ 3000.00');
    // 覆盖率两侧分开报：合成一个数就看不出是哪份图纸的几何没参与比对
    expect(summary).toContain('甲未参与比对的几何条数');
    expect(summary).toContain('乙未参与比对的几何条数');
    expect(summary).toContain('差异总数');
  });

  it('计数为零的类别在表里保留，与面板那句话相反', async () => {
    const summary = ((await sheetsOf(await buildDiffWorkbook(input()))).get('汇总') ?? []).join('\n');
    for (const label of Object.values(ZH_KINDS)) expect(summary).toContain(label);
  });

  it('零差异也导得出来，并写明没有差异（AC-39.13）', async () => {
    const sheets = await sheetsOf(
      await buildDiffWorkbook(
        input({
          rows: [],
          summary: { total: 0, byKind: { count: 0, moved: 0, attribute: 0, added: 0, missing: 0 } }
        })
      )
    );
    expect((sheets.get('汇总') ?? []).join('\n')).toContain('选框内没有差异');
    // 明细只剩表头
    expect((sheets.get('差异明细') ?? []).length).toBe(1);
  });
});

describe('T-39-D · 英文工作簿里没有一个中文字（AC-39.16）', () => {
  it('表名、表头、汇总项全走英文', async () => {
    const blob = await buildDiffWorkbook(
      input({
        zh: false,
        kindLabel: EN_KINDS,
        nameA: 'plan-a.dwg',
        nameB: 'plan-b.dwg',
        rows: exportRows(2).map((r) => ({ ...r, detail: `plan-b.dwg is missing one ${r.block}` }))
      })
    );
    const text = await extractXlsxText(new Uint8Array(await blob.arrayBuffer()));
    expect(text).toContain('Summary');
    expect(text).toContain('Differences');
    expect(text).toContain('Total differences');
    expect(text).not.toMatch(/[\u4e00-\u9fff]/);
  });
});

describe('T-39-E · 文件名（FR-39.12）', () => {
  it('带上两份图纸名与时刻，扩展名是 xlsx', () => {
    expect(diffWorkbookFilename(input())).toBe('差异 甲-平面.dwg vs 乙-平面.dwg 20260914-1530.xlsx');
  });

  it('图纸名里的路径分隔符被清掉，不留下穿越的原料', () => {
    const name = diffWorkbookFilename(input({ nameA: '../../etc/passwd', nameB: 'b:c*d.dwg' }));
    expect(name).not.toContain('/');
    expect(name).not.toContain('..');
    expect(name).not.toContain(':');
    expect(name).not.toContain('*');
    expect(name.endsWith('.xlsx')).toBe(true);
  });

  it('英文语境下文件名也不带中文', () => {
    expect(diffWorkbookFilename(input({ zh: false, nameA: 'a.dwg', nameB: 'b.dwg' }))).toBe(
      'Diff a.dwg vs b.dwg 20260914-1530.xlsx'
    );
  });
});

describe('T-39-F · 坐标进表前收到两位小数', () => {
  it('十几位小数不原样铺开', async () => {
    const detail = ((await sheetsOf(await buildDiffWorkbook(input({ rows: exportRows(1) })))).get('差异明细') ?? [])[1];
    expect(detail).toContain('1000.12');
    expect(detail).not.toContain('1000.12345');
  });
});

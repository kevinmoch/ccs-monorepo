/**
 * 分册 30：属性字高、图案按边界裁剪、图纸只画打印窗口。
 *
 * 数值实测自 `~/Git/大堂平面图.dwg`、`~/Git/2D.dwg`、`~/Git/cad.dwg`，三份都不进仓库，
 * 所以这里断言的是链上那几个纯函数的行为，输入按实测数值构造；
 * 只能靠真实图纸证明的条目（AC-30.1 / 30.4 / 30.7 等）由源码护栏兜住，
 * 测量结果写在 `docs/0.22.0/30-req-dwg-attrib-height-hatch-clip-and-plot-window.md` §2。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { attributeTextHeight, clipSegmentsToLoops } from '../src/shared/dwgSource';
import { itemsWithinBox } from '../src/viewer/dwgGeometry';
import type { Drawn } from '../src/viewer/dwgGeometry';

type Loop = readonly { readonly x: number; readonly y: number }[];

/** 矩形环，逆时针 */
const rect = (x0: number, y0: number, x1: number, y1: number): Loop => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 }
];

describe('T-30-A 属性文字的字高取自块定义（AC-30.11）', () => {
  // 实测 `大堂平面图.dwg` 的 INSERT 9ACC3：block=$equip$00002655、xScale=-300，
  // 块里 ATTDEF tag=B 字高 0.4，而 ATTRIB 自报 36000 = 0.4 × 300²。
  const defs = new Map([
    ['B', 0.4],
    ['$TEXT$', 120]
  ]);

  it('配得上 ATTDEF 时按「块定义字高 × |缩放|」算，而不是信 ATTRIB 自报的平方值', () => {
    expect(attributeTextHeight({ tag: 'B', height: 36000 }, defs, -300)).toBeCloseTo(120, 9);
    // 实测 INSERT 9AF30：xScale=-448，ATTRIB $TEXT$ 自报 53760 = 120 × 448
    expect(attributeTextHeight({ tag: '$TEXT$', height: 53760 }, defs, -448)).toBeCloseTo(53760, 9);
  });

  it('缩放为 1 时与旧行为一致——2D.dwg 84 个属性里 73 个、cad.dwg 全部 44 个走这一支', () => {
    expect(attributeTextHeight({ tag: '$TEXT$', height: 120 }, defs, 1)).toBe(120);
  });

  it('块里没有同 tag 的 ATTDEF、或它的字高不是有限正数时回落到 ATTRIB 自己的字高', () => {
    expect(attributeTextHeight({ tag: '没这个', height: 2.5 }, defs, 300)).toBe(2.5);
    expect(attributeTextHeight({ tag: 'Z', height: 2.5 }, new Map([['Z', 0]]), 300)).toBe(2.5);
    expect(attributeTextHeight({ tag: 'Z', height: 2.5 }, new Map([['Z', Number.NaN]]), 300)).toBe(2.5);
    expect(attributeTextHeight({ tag: 'Z', height: 2.5 }, new Map([['Z', -3]]), 300)).toBe(2.5);
  });

  it('缩放为 0 / NaN / Infinity 时按 |缩放| = 1，绝不把文字压成零高', () => {
    for (const scale of [0, -0, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])
      expect(attributeTextHeight({ tag: 'B', height: 999 }, defs, scale)).toBe(0.4);
  });
});

describe('T-30-B 图案线段按边界环裁剪（AC-30.12 / AC-30.13）', () => {
  const square = [rect(0, 0, 100, 100)];

  it('完全在环内的线段原样返回', () => {
    expect(clipSegmentsToLoops([10, 10, 90, 90], square)).toEqual([10, 10, 90, 90]);
  });

  it('完全在环外的线段一段不留——这是 TR11 那片铺满画布的斜线消失的机制', () => {
    expect(clipSegmentsToLoops([200, 200, 300, 300], square)).toEqual([]);
    // 与环的包围盒相交但整条落在环外侧也要丢
    expect(clipSegmentsToLoops([-50, 50, -10, 50], square)).toEqual([]);
  });

  it('跨越边界的线段只留环内那一截', () => {
    const out = clipSegmentsToLoops([-50, 50, 50, 50], square);
    expect(out).toHaveLength(4);
    expect(out[0]).toBeCloseTo(0, 9);
    expect(out[1]).toBeCloseTo(50, 9);
    expect(out[2]).toBeCloseTo(50, 9);
    expect(out[3]).toBeCloseTo(50, 9);
  });

  it('穿过带岛的环返回两截，中间那个岛不返回', () => {
    // 外环 0..100，岛 40..60：奇偶规则下岛是洞
    const withIsland = [rect(0, 0, 100, 100), rect(40, 40, 60, 60)];
    const out = clipSegmentsToLoops([-10, 50, 110, 50], withIsland);
    expect(out).toHaveLength(8);
    expect([out[0], out[2]].map((v) => Math.round(v!))).toEqual([0, 40]);
    expect([out[4], out[6]].map((v) => Math.round(v!))).toEqual([60, 100]);
  });

  it('对已经在环内的输入是幂等的', () => {
    const once = clipSegmentsToLoops([-10, 50, 110, 50], [rect(0, 0, 100, 100), rect(40, 40, 60, 60)]);
    const twice = clipSegmentsToLoops(once, [rect(0, 0, 100, 100), rect(40, 40, 60, 60)]);
    expect(twice).toEqual(once);
  });

  it('没有环时不裁——没有边界就没有「内外」，丢弃会把整个填充删掉', () => {
    expect(clipSegmentsToLoops([200, 200, 300, 300], [])).toEqual([200, 200, 300, 300]);
  });
});

describe('T-30-C 图纸只画打印窗口内的实体（FR-30.3 第 1 步）', () => {
  const item = (x: number, y: number, w: number, h: number): Drawn => ({
    entity: {
      handle: `${x}:${y}`,
      kind: 'LWPOLYLINE',
      layer: '0',
      geometry: {
        kind: 'polyline',
        closed: true,
        points: [
          { x, y },
          { x: x + w, y },
          { x: x + w, y: y + h },
          { x, y: y + h }
        ]
      }
    },
    color: 'currentColor'
  });
  // 实测 `大堂平面图.dwg` 的 Layout1 打印窗口 841.00 × 594.00
  const sheet = { minX: 0, minY: 0, maxX: 841, maxY: 594 };

  it('纸外的邻图一个都不留，纸内与跨纸边的都留下', () => {
    const onSheet = item(100, 100, 50, 50);
    const crossing = item(800, 100, 200, 50);
    const neighbour = item(2000, 100, 50, 50);
    const kept = itemsWithinBox([onSheet, crossing, neighbour], sheet);
    expect(kept.map((x) => x.entity.handle)).toEqual([onSheet.entity.handle, crossing.entity.handle]);
  });

  it('文字按锚点与字高判位，不会因为摊不成折线就被整批丢掉', () => {
    const text = (x: number, y: number): Drawn => ({
      ...item(0, 0, 1, 1),
      entity: {
        handle: `t${x}`,
        kind: 'TEXT',
        layer: '0',
        geometry: { kind: 'text', at: { x, y }, text: 'A', height: 2.5, rotation: 0 }
      }
    });
    const kept = itemsWithinBox([text(400, 300), text(5000, 300)], sheet);
    expect(kept.map((x) => x.entity.handle)).toEqual(['t400']);
  });

  it('拿不到任何点的实体一律留下：没有位置可判时不能当成纸外', () => {
    const bare: Drawn = {
      ...item(0, 0, 1, 1),
      entity: { handle: 'bare', kind: 'HATCH', layer: '0', geometry: undefined }
    };
    expect(itemsWithinBox([bare], sheet)).toHaveLength(1);
  });
});

describe('T-30-D 源码护栏（AC-30.14 / AC-30.15）', () => {
  const read = (file: string): string => readFileSync(resolve(import.meta.dirname, '..', 'src', file), 'utf8');

  it('图案展开之后必须过一次边界裁剪（AC-30.14）', () => {
    const source = read('shared/dwgSource.ts');
    const body = source.slice(source.indexOf('function patternSegments('));
    expect(body.slice(0, body.indexOf('\n}\n'))).toContain('clipSegmentsToLoops(');
  });

  it('裁剪的边界必须取自实体自身空间，与图案偏移同一个坐标系（FR-30.2）', () => {
    // 传已经乘过块变换的 `loops` 会让边界和线段不在同一个空间里，裁出来是错的
    expect(read('shared/dwgSource.ts')).toContain('patternSegments(entity, m, hatchBoundaryPoints(entity, IDENTITY))');
  });

  it('图纸绘制路径必须同时做「按打印窗口剔除」与「按打印窗口裁画布」（AC-30.15）', () => {
    const source = read('viewer/viewerDwg.ts');
    expect(source).toContain('itemsWithinBox(drawn, box)');
    // 剔除之后画的必须是剔除后的那批，而不是原来的 `drawn`。
    // 分册 32 给它又叠了一层屏幕剔除：索引建在 `plotItems` 上，逐帧只查当前画面那块
    expect(source).toContain('plotScene = buildScene(plotItems)');
    expect(source).toContain('const items = plotScene.query(box[0], box[1], box[2], box[3]);');
    expect(source).toContain('drawTexts(items, toScreen, 1);');
    // 画布裁剪：取打印窗口的屏幕矩形后 clip
    const draw = source.slice(source.indexOf('const sheet = plotWindow();'));
    expect(draw.slice(0, draw.indexOf('drawViewports();'))).toContain('ctx.clip();');
  });

  it('打印窗口只对图纸空间生效，模型空间不许参与（FR-30.3）', () => {
    expect(read('viewer/viewerDwg.ts')).toContain("active.kind === 'layout' ? active.extent : undefined");
  });
});

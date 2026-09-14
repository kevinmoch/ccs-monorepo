/**
 * 图纸空间、视口、填充与线型（0.22.0 分册 23，AC-23.1 ~ AC-23.6）。
 *
 * 这一册的夹具**不能**用 `DwgWriter` 造，不是偏好问题而是造不出来：
 * acad-ts 3.1.0 的 `HatchPattern` 只暴露 solid、`new Layout()` 的
 * `associatedBlock` 是 null（分册 23 §2.3）。所以：
 *
 * - 判据（视口分类、线型换算）用**真实图纸抓到的原始数字**驱动；
 * - 数据形态用真实图纸的切片 `fixtures/dwgViews.json` 驱动，
 *   再喂给查看器的真实几何代码，验它确实画得出来。
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { DwgDocumentContent, DwgEntity, DwgOmission, DwgView } from '@webskill/sdk/agent';
import { dashFromLineType, dashOf, isPaperViewport } from '../src/shared/dwgSource.js';
import {
  collectDrawn,
  pickView,
  projectThroughViewport,
  robustViewport,
  tessellate,
  usedLayers,
  viewportTransform,
  viewsOf
} from '../src/viewer/dwgGeometry.js';

interface Fixture {
  readonly note: string;
  readonly version: string;
  readonly views: readonly { id: string; kind: string; entityCount: number; viewportCount: number }[];
  readonly layers: DwgDocumentContent['layers'];
  readonly omissions: readonly DwgOmission[];
  readonly elevationA: { entities: DwgEntity[]; bounds: DwgDocumentContent['bounds'] };
  readonly elevationB: { entities: DwgEntity[]; bounds: DwgDocumentContent['bounds'] };
  readonly sheet: DwgView;
  readonly emptySheet: DwgView;
}

const fixture = JSON.parse(readFileSync(resolve(import.meta.dirname, 'fixtures/dwgViews.json'), 'utf8')) as Fixture;

/**
 * `大堂立面图.dwg` 的 Layout1 里全部 6 个视口的原始参数。
 *
 * 注意 id=1：`representsPaper` 是 **true**，可它的 viewCenter 在 84 米开外，
 * 明明是个 50:1 的立面窗口。真正 1:1 显示图纸自身的是 id=2。
 * 这一组数字就是「不许再用 representsPaper」的证据，别删。
 */
const REAL_VIEWPORTS = [
  {
    id: 1,
    representsPaper: true,
    center: { x: 295.58, y: 535.35 },
    width: 308.48,
    height: 187.36,
    viewCenter: { x: 84295.98, y: 2495.93 },
    viewHeight: 9367.97
  },
  {
    id: 2,
    representsPaper: false,
    center: { x: 518.21, y: 422.19 },
    width: 1079.78,
    height: 501.35,
    viewCenter: { x: 518.21, y: 422.19 },
    viewHeight: 501.35
  },
  {
    id: 3,
    representsPaper: false,
    center: { x: 675.13, y: 534.98 },
    width: 251.12,
    height: 186.71,
    viewCenter: { x: 99085.54, y: 2477.54 },
    viewHeight: 9335.61
  },
  {
    id: 4,
    representsPaper: false,
    center: { x: 297.92, y: 258.04 },
    width: 308.49,
    height: 194.29,
    viewCenter: { x: 114074.21, y: 2861.27 },
    viewHeight: 9714.46
  },
  {
    id: 5,
    representsPaper: false,
    center: { x: 599.04, y: 251.11 },
    width: 256.16,
    height: 205.38,
    viewCenter: { x: 129213.14, y: 2514.76 },
    viewHeight: 10269.17
  },
  {
    id: 6,
    representsPaper: false,
    center: { x: 816.09, y: 253.17 },
    width: 40.94,
    height: 146.05,
    viewCenter: { x: 148072.72, y: 2617.69 },
    viewHeight: 7302.64
  }
] as const;

describe('isPaperViewport（AC-23.2）', () => {
  it('只把 1:1 显示自身的那一个判成整页视口', () => {
    const paper = REAL_VIEWPORTS.filter(isPaperViewport).map((v) => v.id);
    expect(paper).toEqual([2]);
  });

  it('acad-ts 的 representsPaper 在真实图纸上是错的，几何判据不跟着错', () => {
    const byFlag = REAL_VIEWPORTS.filter((v) => v.representsPaper).map((v) => v.id);
    const byGeometry = REAL_VIEWPORTS.filter(isPaperViewport).map((v) => v.id);
    expect(byFlag).not.toEqual(byGeometry);
    // 照 representsPaper 排会把 84 米处的立面窗口一起丢掉
    const dropped = REAL_VIEWPORTS.find((v) => v.representsPaper && !isPaperViewport(v));
    expect(dropped?.viewCenter.x).toBeCloseTo(84295.98, 2);
  });

  it('五个立面窗口各看向模型空间的不同位置', () => {
    const windows = REAL_VIEWPORTS.filter((v) => !isPaperViewport(v));
    expect(windows).toHaveLength(5);
    expect(new Set(windows.map((v) => Math.round(v.viewCenter.x))).size).toBe(5);
    // 50:1 左右的出图比例：视图高度远大于视口高度
    for (const w of windows) expect(w.viewHeight / w.height).toBeGreaterThan(30);
  });
});

describe('dashFromLineType（AC-23.5）', () => {
  it('没有线段的线型不产生虚线', () => {
    expect(dashFromLineType({ name: 'Continuous', patternLength: 0, segments: [] })).toBeUndefined();
    expect(dashFromLineType(undefined)).toBeUndefined();
  });

  it('正负长度换成 canvas 的 on/off 序列', () => {
    const dash = dashFromLineType({ name: '虚线', patternLength: 12, segments: [{ length: 6 }, { length: -6 }] });
    expect(dash).toEqual([6, 6]);
  });

  it('零长度的点段换成图案总长的百分之一，否则 canvas 什么都不画', () => {
    const dash = dashFromLineType({
      name: '点划线',
      patternLength: 15.87,
      segments: [{ length: 6.35 }, { length: -4.76 }, { length: 0 }, { length: -4.76 }]
    });
    expect(dash).toEqual([6.35, 4.76, 0.1587, 4.76]);
    expect(dash?.every((v) => v > 0)).toBe(true);
  });
});

describe('dashOf（AC-23.5）', () => {
  const layerDashes = new Map<string, readonly number[]>([['虚线层', [6, 6]]]);

  it('ByLayer 的实体落到图层的线型上', () => {
    const dash = dashOf({ lineType: { name: 'ByLayer' } }, '虚线层', layerDashes);
    expect(dash).toEqual([6, 6]);
  });

  it('实体自己的线型比例乘进去', () => {
    const dash = dashOf({ lineType: { name: 'ByLayer' }, lineTypeScale: 2.5 }, '虚线层', layerDashes);
    expect(dash).toEqual([15, 15]);
  });

  it('实线图层不产生虚线，也不算「取不到定义」', () => {
    expect(dashOf({ lineType: { name: 'Continuous' } }, '实线层', layerDashes)).toBeUndefined();
    expect(dashOf({ lineType: { name: 'ByBlock' } }, '实线层', layerDashes)).toBeUndefined();
    expect(dashOf({}, '实线层', layerDashes)).toBeUndefined();
  });

  it('指名要一个线型却没有它的图案定义时上报降级，而不是闷声画成实线', () => {
    expect(dashOf({ lineType: { name: 'CENTER2' } }, '实线层', layerDashes)).toBe('unavailable');
  });
});

describe('真实图纸的视图结构（AC-23.1）', () => {
  it('解析出模型空间与两个图纸空间，空布局也在列', () => {
    expect(fixture.views.map((v) => v.id)).toEqual(['Model', 'Layout1', 'Layout2']);
    expect(fixture.views.map((v) => v.kind)).toEqual(['model', 'layout', 'layout']);
    const byId = new Map(fixture.views.map((v) => [v.id, v] as const));
    expect(byId.get('Model')?.entityCount).toBe(3817);
    expect(byId.get('Layout1')?.entityCount).toBe(669);
    // 空布局不是「没有布局」，它得被列出来，否则用户以为图纸丢了
    expect(byId.get('Layout2')?.entityCount).toBe(0);
  });

  it('视口只挂在图纸空间上', () => {
    expect(fixture.views.find((v) => v.id === 'Model')?.viewportCount).toBe(0);
    expect(fixture.views.find((v) => v.id === 'Layout1')?.viewportCount).toBe(5);
  });
});

describe('图纸空间切片（AC-23.2）', () => {
  it('带着图框与会签栏的文字', () => {
    const texts = fixture.sheet.entities
      .filter((e) => e.geometry?.kind === 'text')
      .map((e) => (e.geometry as { kind: 'text'; text: string }).text);
    expect(texts.length).toBeGreaterThan(100);
    expect(texts.some((t) => t.includes('姓'))).toBe(true);
    expect(texts.some((t) => t.includes('日'))).toBe(true);
  });

  it('五个视口的参数齐全，整页视口不在里面', () => {
    expect(fixture.sheet.viewports).toHaveLength(5);
    for (const vp of fixture.sheet.viewports) {
      expect(vp.width).toBeGreaterThan(0);
      expect(vp.height).toBeGreaterThan(0);
      expect(vp.viewHeight).toBeGreaterThan(0);
      expect(Number.isFinite(vp.twistAngle)).toBe(true);
      expect(Array.isArray(vp.frozenLayers)).toBe(true);
      expect(isPaperViewport(vp)).toBe(false);
    }
    expect(new Set(fixture.sheet.viewports.map((v) => Math.round(v.viewCenter.x))).size).toBe(5);
  });

  it('图纸空间的坐标是纸面尺寸，不是模型坐标', () => {
    // 一张 A1 横排图框，毫米级；模型空间那边是十万级
    expect(fixture.sheet.bounds.maxX).toBeLessThan(2000);
    expect(fixture.elevationA.bounds.maxX).toBeGreaterThan(10000);
  });
});

describe('填充（AC-23.3、AC-23.4）', () => {
  const all = [...fixture.elevationA.entities, ...fixture.elevationB.entities, ...fixture.sheet.entities];

  it('实心、图案、遮罩三类填充都解析到了', () => {
    const kinds = new Set(all.filter((e) => e.fill).map((e) => e.fill!.kind));
    expect(kinds).toEqual(new Set(['solid', 'pattern', 'mask']));
  });

  it('实心与遮罩带闭合环，图案带四个一组的线段', () => {
    for (const e of all) {
      const fill = e.fill;
      if (!fill) continue;
      if (fill.kind === 'pattern') {
        expect(fill.segments.length % 4).toBe(0);
        expect(fill.segments.length).toBeGreaterThan(0);
      } else {
        expect(fill.loops.length).toBeGreaterThan(0);
        for (const loop of fill.loops) expect(loop.length).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('图案填充不膨胀成一堆实体', () => {
    const patterned = all.filter((e) => e.fill?.kind === 'pattern');
    expect(patterned.length).toBeGreaterThan(0);
    const segments = patterned.reduce(
      (n, e) => n + (e.fill as { kind: 'pattern'; segments: readonly number[] }).segments.length / 4,
      0
    );
    // 线段数远多于实体数——说明它们是被挂在实体上的，不是各自成了一条实体
    expect(segments).toBeGreaterThan(patterned.length * 5);
  });

  it('遮罩是矩形的四角，不是两点对角线', () => {
    const masks = all.filter((e) => e.fill?.kind === 'mask');
    expect(masks.length).toBeGreaterThan(0);
    for (const m of masks) {
      const loop = (m.fill as { kind: 'mask'; loops: readonly (readonly { x: number; y: number }[])[] }).loops[0]!;
      expect(loop).toHaveLength(4);
      expect(new Set(loop.map((p) => p.x)).size).toBeGreaterThan(1);
      expect(new Set(loop.map((p) => p.y)).size).toBeGreaterThan(1);
    }
  });
});

describe('降级要上报（AC-23.6）', () => {
  it('图案填充是近似绘制，按 degraded 上报而不是当成没画', () => {
    const degraded = fixture.omissions.filter((o) => o.severity === 'degraded');
    expect(degraded.length).toBeGreaterThan(0);
    expect(degraded.some((o) => o.reason === 'pattern-approximated')).toBe(true);
    for (const o of fixture.omissions) {
      expect(['dropped', 'degraded']).toContain(o.severity);
      expect(o.count).toBeGreaterThan(0);
    }
  });
});

describe('切片能喂给查看器的几何代码', () => {
  const view = (entities: readonly DwgEntity[], bounds: DwgDocumentContent['bounds']): DwgDocumentContent => ({
    version: fixture.version,
    layers: fixture.layers,
    entities,
    bounds,
    views: [],
    omissions: []
  });
  it('图纸空间的实体全都摊得开', () => {
    const drawn = collectDrawn({
      kind: 'dwg',
      lang: 'zh',
      after: view(fixture.sheet.entities, fixture.sheet.bounds)
    });
    expect(drawn).toHaveLength(fixture.sheet.entities.length);
    const empty = drawn.filter((d) => tessellate(d.entity.geometry).length === 0);
    expect(empty).toEqual([]);
    // 文字拿不到字形，用一个十字占位，因此是两条线
    const text = drawn.find((d) => d.entity.geometry?.kind === 'text');
    expect(tessellate(text?.entity.geometry)).toHaveLength(2);
  });

  it('立面切片的视野是有限的，图层表按实际用到的收窄', () => {
    const document = view(fixture.elevationA.entities, fixture.elevationA.bounds);
    const drawn = collectDrawn({ kind: 'dwg', lang: 'zh', after: document });
    const vp = robustViewport(drawn);
    expect(vp.maxX - vp.minX).toBeGreaterThan(0);
    expect(Number.isFinite(vp.maxY - vp.minY)).toBe(true);
    const layers = usedLayers(drawn, document);
    expect(layers.length).toBeGreaterThan(0);
    expect(layers.length).toBeLessThanOrEqual(fixture.layers.length);
  });
});

describe('视口的出图变换（AC-23.2）', () => {
  const vp = fixture.sheet.viewports[0]!;

  it('比例来自纸面高与模型视图高之比', () => {
    const t = viewportTransform(vp);
    expect(t.scale).toBeCloseTo(vp.height / vp.viewHeight, 12);
    // 这几个窗口都在 1:50 上下
    expect(1 / t.scale).toBeGreaterThan(30);
    expect(1 / t.scale).toBeLessThan(80);
  });

  it('模型里被看着的那个点落在窗口正中', () => {
    const t = viewportTransform(vp);
    const [x, y] = projectThroughViewport(t, vp.viewCenter.x, vp.viewCenter.y);
    expect(x).toBeCloseTo(vp.center.x, 9);
    expect(y).toBeCloseTo(vp.center.y, 9);
  });

  it('模型窗口的四角正好落在纸面窗口的四角', () => {
    const t = viewportTransform(vp);
    const halfH = vp.viewHeight / 2;
    const halfW = halfH * (vp.width / vp.height);
    const corners = [
      [vp.viewCenter.x - halfW, vp.viewCenter.y - halfH],
      [vp.viewCenter.x + halfW, vp.viewCenter.y + halfH]
    ] as const;
    const [[x0, y0], [x1, y1]] = corners.map((c) => projectThroughViewport(t, c[0], c[1])) as [
      readonly [number, number],
      readonly [number, number]
    ];
    expect(x1 - x0).toBeCloseTo(vp.width, 6);
    expect(y1 - y0).toBeCloseTo(vp.height, 6);
    expect((x0 + x1) / 2).toBeCloseTo(vp.center.x, 6);
    expect((y0 + y1) / 2).toBeCloseTo(vp.center.y, 6);
  });

  it('五个窗口看向模型空间的五处互不重叠的区域', () => {
    const spans = fixture.sheet.viewports
      .map((v) => {
        const halfW = (v.viewHeight / 2) * (v.width / v.height);
        return [v.viewCenter.x - halfW, v.viewCenter.x + halfW] as const;
      })
      .sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < spans.length; i++) expect(spans[i]![0]).toBeGreaterThan(spans[i - 1]![1]);
  });
});

describe('视图切换（FR-23.5、FR-23.7）', () => {
  const document: DwgDocumentContent = {
    version: fixture.version,
    layers: fixture.layers,
    entities: fixture.elevationA.entities,
    bounds: fixture.elevationA.bounds,
    views: [
      {
        id: 'Model',
        name: 'Model',
        kind: 'model',
        entities: fixture.elevationA.entities,
        bounds: fixture.elevationA.bounds,
        viewports: []
      },
      fixture.sheet,
      fixture.emptySheet
    ],
    omissions: fixture.omissions
  };

  it('按 id 取到对应视图的实体，而不是整份文档的', () => {
    const onSheet = collectDrawn({ kind: 'dwg', lang: 'zh', after: document }, 'Layout1');
    const onModel = collectDrawn({ kind: 'dwg', lang: 'zh', after: document }, 'Model');
    // 口径按分册 27 §6 修订：`Defpoints` 不进绘制集合（FR-27.4），所以基数是
    // 「视图里可绘制的条数」而不是「视图的实体条数」。夹具实测 827 条里有 84 条在该图层。
    const paintable = (v: { entities: readonly { layer: string }[] }): number =>
      v.entities.filter((e) => e.layer.toLowerCase() !== 'defpoints').length;
    expect(onSheet).toHaveLength(paintable(fixture.sheet));
    expect(onModel).toHaveLength(paintable(fixture.elevationA));
    expect(fixture.elevationA.entities.length - paintable(fixture.elevationA)).toBe(84);
    expect(onSheet[0]!.entity.handle).not.toBe(onModel[0]!.entity.handle);
  });

  it('空布局取到的是零条实体，不是回落到别的视图', () => {
    const drawn = collectDrawn({ kind: 'dwg', lang: 'zh', after: document }, fixture.emptySheet.id);
    expect(drawn).toEqual([]);
  });

  it('认不出的视图 id 退回第一个，而不是画不出东西', () => {
    expect(pickView(document, 'nope').id).toBe('Model');
    expect(pickView(document, undefined).id).toBe('Model');
  });

  it('分册 23 之前的载荷没有视图，补一个模型空间视图给它', () => {
    const legacy = { ...document, views: undefined } as unknown as DwgDocumentContent;
    const views = viewsOf(legacy);
    expect(views).toHaveLength(1);
    expect(views[0]!.kind).toBe('model');
    expect(views[0]!.entities).toHaveLength(fixture.elevationA.entities.length);
  });
});

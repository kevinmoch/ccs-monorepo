/**
 * 分册 27：实体坐标系、可见性约定、线宽成形与图纸取景。
 *
 * 数值全部实测自 `/Users/mochunhui/Git/2D.dwg`（17 MB，8028 条展开实体），
 * 仓库里不放这份图纸，所以断言的是解析链上那几个纯函数的行为，
 * 输入按实测数值构造。测量结果写在 `docs/0.22.0/27-req-*.md` §2。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isPaintedAttribute, ocsMatrix, resolvedColor, widePolylineLoops } from '../src/shared/dwgSource';
import { collectDrawn, isPaintable, viewViewport } from '../src/viewer/dwgGeometry';
import type { DwgEntity, DwgView, DwgViewport } from '@webskill/sdk/agent';

const IDENTITY = [1, 0, 0, 1, 0, 0];

describe('T-27-A 对象坐标系（AC-27.1 ~ AC-27.3）', () => {
  it('法向 (0,0,-1) 把 x 取反、y 不变', () => {
    const m = ocsMatrix({ x: 0, y: 0, z: -1 });
    expect(m[0]).toBeCloseTo(-1, 12);
    expect(m[1]).toBeCloseTo(0, 12);
    expect(m[2]).toBeCloseTo(0, 12);
    expect(m[3]).toBeCloseTo(1, 12);
    // 实测：A/C 文字在修复前落在 x=+66216，取反后 -66216 才进得了 P-08 的取景窗口
    const x = 66216;
    expect(m[0]! * x).toBeCloseTo(-66216, 6);
  });

  it('法向 (0,0,1) 与法向缺失都是恒等', () => {
    // 逐项比：算法在正 Z 上会算出 `-0`，而 `-0` 和 `0` 在 toEqual 下不相等
    const up = ocsMatrix({ x: 0, y: 0, z: 1 });
    for (const [i, want] of IDENTITY.entries()) expect(up[i]!).toBeCloseTo(want, 12);
    expect([...ocsMatrix(undefined)]).toEqual(IDENTITY);
  });

  it('法向非单位长度时先归一化', () => {
    // 实测视口的 viewDirection 就是 (0,0,25917.47) 这种非单位向量，法向同理
    const m = ocsMatrix({ x: 0, y: 0, z: -25917.47 });
    expect(m[0]).toBeCloseTo(-1, 12);
    expect(m[3]).toBeCloseTo(1, 12);
  });

  it('退化分支与常规分支各按算法定义走', () => {
    // |Nx| 与 |Ny| 都小于 1/64：用 Wy × N，Ax 基本沿 +X。
    // 错用常规分支的话 Ax = (-ny, nx, 0) 归一化后是 (-0.707, 0.707)，两者差得很远
    const degenerate = ocsMatrix({ x: 0.01, y: 0.01, z: 1 });
    expect(degenerate[0]).toBeCloseTo(1, 3);
    expect(degenerate[1]).toBeCloseTo(0, 9);
    // |Nx| 超过 1/64：用 Wz × N，Ax = (-ny, nx, 0)
    const regular = ocsMatrix({ x: 1, y: 0, z: 0 });
    expect(regular[0]).toBeCloseTo(0, 12);
    expect(regular[1]).toBeCloseTo(1, 12);
    // 法向正对着看时投影不改变面积；倾斜法向的投影只会收缩，不会放大
    const det = (m: readonly number[]): number => m[0]! * m[3]! - m[1]! * m[2]!;
    expect(Math.abs(det(ocsMatrix({ x: 0, y: 0, z: -1 })))).toBeCloseTo(1, 12);
    expect(Math.abs(det(degenerate))).toBeLessThanOrEqual(1);
    expect(Math.abs(det(regular))).toBeLessThanOrEqual(1);
  });

  it('零向量与非有限值回落恒等，不产出 NaN', () => {
    expect([...ocsMatrix({ x: 0, y: 0, z: 0 })]).toEqual(IDENTITY);
    expect([...ocsMatrix({ x: Number.NaN, y: 0, z: 1 })]).toEqual(IDENTITY);
  });
});

describe('T-27-B 属性可见性（AC-27.5）', () => {
  const attr = (flags: number, isInvisible?: boolean): { flags: number; isInvisible?: boolean } =>
    isInvisible === undefined ? { flags } : { flags, isInvisible };

  it('组码 60 的 isInvisible 让属性不画', () => {
    // 实测：图框标题栏每张图纸 7 条属性里有 6 条长这样（flags=0 而 isInvisible=true）
    expect(isPaintedAttribute(attr(0, true))).toBe(false);
    expect(isPaintedAttribute(attr(0, false))).toBe(true);
  });

  it('组码 70 bit0 的判据同时仍然生效', () => {
    // 实测：14 条 flags=1 与 1 条 flags=8|1 的属性，isInvisible 全是 false
    expect(isPaintedAttribute(attr(1, false))).toBe(false);
    expect(isPaintedAttribute(attr(9, false))).toBe(false);
    expect(isPaintedAttribute(attr(8, false))).toBe(true);
  });

  it('两套判据互不替代：只有都不成立才画', () => {
    expect(isPaintedAttribute(attr(1, true))).toBe(false);
    expect(isPaintedAttribute(attr(0))).toBe(true);
  });
});

describe('T-27-C ByBlock 颜色继承（AC-27.10）', () => {
  const entityWith = (color: unknown): Parameters<typeof resolvedColor>[0] =>
    ({ color }) as unknown as Parameters<typeof resolvedColor>[0];
  const byBlock = { isByBlock: true, isByLayer: false, getRgb: () => undefined };
  const byLayer = { isByBlock: false, isByLayer: true, getRgb: () => undefined };
  const red = { isByBlock: false, isByLayer: false, getRgb: () => [255, 0, 0] };

  it('ByBlock 取宿主块引用解出的颜色', () => {
    expect(resolvedColor(entityWith(byBlock), '#ff0000')).toBe('#ff0000');
  });

  it('宿主那里也没解出来时回落图层色（返回 undefined）', () => {
    expect(resolvedColor(entityWith(byBlock), undefined)).toBeUndefined();
  });

  it('ByLayer 不受影响：继承色在场也仍然回落图层色', () => {
    expect(resolvedColor(entityWith(byLayer), '#ff0000')).toBeUndefined();
  });

  it('实体自己写死的颜色优先于继承色', () => {
    expect(resolvedColor(entityWith(red), '#00ff00')).toBe('#ff0000');
  });
});

describe('T-27-D 多段线宽度成形（AC-27.7 ~ AC-27.9）', () => {
  const vertex = (x: number, y: number, startWidth: number, endWidth = startWidth, bulge = 0) => ({
    point: { x, y },
    bulge,
    startWidth,
    endWidth
  });

  it('固定宽度的一段铺成等宽四边形', () => {
    // 实测样本：constantWidth=10、2 个顶点、图层 J-D
    const loops = widePolylineLoops([vertex(0, 0, 10), vertex(100, 0, 10)], false, [1, 0, 0, 1, 0, 0]);
    expect(loops).toHaveLength(1);
    const ys = loops[0]!.map((p) => p.y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(10, 9);
    expect(Math.max(...loops[0]!.map((p) => p.x))).toBeCloseTo(100, 9);
  });

  it('宽度为 0 的多段线不产出面', () => {
    expect(widePolylineLoops([vertex(0, 0, 0), vertex(100, 0, 0)], false, [1, 0, 0, 1, 0, 0])).toEqual([]);
  });

  it('起止宽度不等时是梯形；终点宽度为 0 时收成三角形（箭头）', () => {
    const taper = widePolylineLoops([vertex(0, 0, 20, 0), vertex(100, 0, 0)], false, [1, 0, 0, 1, 0, 0]);
    expect(taper).toHaveLength(1);
    const quad = taper[0]!;
    const spanAt = (x: number): number => {
      const ys = quad.filter((p) => Math.abs(p.x - x) < 1e-6).map((p) => p.y);
      return Math.max(...ys) - Math.min(...ys);
    };
    expect(spanAt(0)).toBeCloseTo(20, 9);
    expect(spanAt(100)).toBeCloseTo(0, 9);
  });

  it('宽度随变换缩放，非均匀缩放下两端的宽度各缩各的', () => {
    // 竖直一段在 x 方向被压扁 0.5 倍：宽度沿 x 量，所以也该只剩一半
    const loops = widePolylineLoops([vertex(0, 0, 10), vertex(0, 100, 10)], false, [0.5, 0, 0, 2, 0, 0]);
    const xs = loops[0]!.map((p) => p.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(5, 9);
    const ys = loops[0]!.map((p) => p.y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(200, 9);
  });

  it('闭合多段线比开口的多铺一段', () => {
    const v = [vertex(0, 0, 4), vertex(100, 0, 4), vertex(100, 100, 4)];
    // 每段一块带面，每个转角一个接头（分册 29 FR-29.2）：
    // 开口是 2 段 + 1 个转角，闭合是 3 段 + 3 个转角
    expect(widePolylineLoops(v, false, [1, 0, 0, 1, 0, 0])).toHaveLength(3);
    expect(widePolylineLoops(v, true, [1, 0, 0, 1, 0, 0])).toHaveLength(6);
  });

  it('圆弧段按 bulge 离散后逐小段铺宽，不是一个四边形糊过去', () => {
    const loops = widePolylineLoops([vertex(0, 0, 6, 6, 1), vertex(100, 0, 6)], false, [1, 0, 0, 1, 0, 0]);
    expect(loops.length).toBeGreaterThan(4);
    // bulge=1 是半圆，逆时针从 (0,0) 绕到 (100,0)，弧顶在 y = -50；直线段铺不出这个
    expect(Math.min(...loops.flat().map((p) => p.y))).toBeLessThan(-40);
  });

  it('顶点少于两个、或前后重合时不产出退化面', () => {
    expect(widePolylineLoops([vertex(0, 0, 10)], false, [1, 0, 0, 1, 0, 0])).toEqual([]);
    expect(widePolylineLoops([vertex(0, 0, 10), vertex(0, 0, 10)], false, [1, 0, 0, 1, 0, 0])).toEqual([]);
  });
});

describe('T-27-E Defpoints 不参与绘制（AC-27.6）', () => {
  const entity = (layer: string, handle: string): DwgEntity =>
    ({ handle, kind: 'POINT', layer }) as unknown as DwgEntity;

  it('Defpoints 的实体不可绘制，大小写不敏感', () => {
    expect(isPaintable(entity('Defpoints', 'a'))).toBe(false);
    expect(isPaintable(entity('DEFPOINTS', 'b'))).toBe(false);
    expect(isPaintable(entity('defpoints', 'c'))).toBe(false);
    expect(isPaintable(entity('Defpoints-1', 'd'))).toBe(true);
    expect(isPaintable(entity('01平-家具', 'e'))).toBe(true);
  });

  it('绘制集合里滤掉它们，解析产出照旧保留', () => {
    // 实测比例：782 条 POINT 里 762 条在 Defpoints
    const entities = [entity('Defpoints', 'a'), entity('01平-家具', 'b'), entity('Defpoints', 'c')];
    const after = {
      views: [
        {
          id: 'Model',
          name: 'Model',
          kind: 'model',
          entities,
          viewports: [],
          bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 }
        }
      ],
      layers: [
        { name: 'Defpoints', color: '#ffffff' },
        { name: '01平-家具', color: '#ffffff' }
      ]
    } as unknown as Parameters<typeof collectDrawn>[0]['after'];
    const drawn = collectDrawn({ after, lang: 'zh' } as unknown as Parameters<typeof collectDrawn>[0]);
    expect(drawn.map((d) => d.entity.handle)).toEqual(['b']);
    expect(after.views?.[0]?.entities).toHaveLength(3);
  });
});

describe('T-27-F 图纸取景（AC-27.12 / AC-27.13）', () => {
  const viewport = (cx: number, cy: number, w: number, h: number): DwgViewport =>
    ({
      center: { x: cx, y: cy },
      width: w,
      height: h,
      viewCenter: { x: 0, y: 0 },
      viewHeight: h,
      twistAngle: 0,
      frozenLayers: []
    }) as unknown as DwgViewport;

  const drawnAt = (x: number, y: number) =>
    ({
      entity: {
        handle: `${x}`,
        kind: 'LINE',
        layer: '0',
        geometry: {
          kind: 'polyline',
          points: [
            { x, y },
            { x: x + 1, y: y + 1 }
          ],
          closed: false
        }
      },
      change: 'unchanged' as const,
      old: false,
      color: '#ffffff'
    }) as unknown as Parameters<typeof viewViewport>[1][number];

  it('有视口时取景框等于视口矩形，图纸空间里的远处实体撑不开它', () => {
    // 实测 P-08：图纸空间实体盒 x[941,2671]，而图框连同视口只占 x[968,1312]
    const view = { viewports: [viewport(1140, 153, 344, 282)] };
    const drawn = [drawnAt(1000, 100), drawnAt(2671, 298)];
    const box = viewViewport(view as unknown as DwgView & { viewports: readonly DwgViewport[] }, drawn);
    expect(box.minX).toBeCloseTo(968, 6);
    expect(box.maxX).toBeCloseTo(1312, 6);
    expect(box.minY).toBeCloseTo(12, 6);
    expect(box.maxY).toBeCloseTo(294, 6);
  });

  it('多个视口取并集', () => {
    const view = { viewports: [viewport(100, 100, 40, 40), viewport(300, 100, 40, 40)] };
    const box = viewViewport(view as unknown as DwgView & { viewports: readonly DwgViewport[] }, []);
    expect(box.minX).toBeCloseTo(80, 6);
    expect(box.maxX).toBeCloseTo(320, 6);
  });

  it('没有视口时仍按实体的分位盒取景', () => {
    const drawn = [drawnAt(0, 0), drawnAt(100, 100)];
    const box = viewViewport({ viewports: [] } as unknown as DwgView & { viewports: readonly DwgViewport[] }, drawn);
    expect(box.minX).toBeCloseTo(0, 6);
    expect(box.maxX).toBeCloseTo(101, 6);
  });

  it('视口尺寸退化时不返回空盒，回落到实体分位盒', () => {
    const view = { viewports: [viewport(100, 100, 0, 0)] };
    const box = viewViewport(view as unknown as DwgView & { viewports: readonly DwgViewport[] }, [
      drawnAt(0, 0),
      drawnAt(50, 50)
    ]);
    expect(box.maxX).toBeGreaterThan(box.minX);
    expect(box.maxX).toBeCloseTo(51, 6);
  });
});

describe('T-27-G 护栏：调用点（AC-27.4 / AC-27.11）', () => {
  const source = readFileSync(resolve(import.meta.dirname, '../src/shared/dwgSource.ts'), 'utf8');
  const viewer = readFileSync(resolve(import.meta.dirname, '../src/viewer/viewerDwg.ts'), 'utf8');

  it('块属性用宿主 INSERT 解出的图层，不是宿主的外层', () => {
    // 纯函数测不到「调用点传了哪个参数」，而传错的后果实测是 25 条 WF/PT/FT 标识
    // 全落进图层 0，视口冻结表一条也冻不掉。这里盯的就是那一处实参。
    const loop = source.slice(
      source.indexOf('for (const attribute of entity.attributes) {\n        if (!isPaintedAttribute')
    );
    const call = loop.slice(0, loop.indexOf('continue;\n    }'));
    expect(call).toContain('hostLayer');
    expect(call).not.toMatch(/\n\s+inherited,/);
  });

  it('块内容与属性用的是同一个宿主图层', () => {
    expect(source).toContain('const hostLayer = layerNameOf(entity, inherited);');
    expect(source).toMatch(/walk\(collector, block\.entities, compose\(em, local\)[^)]*hostLayer/);
  });

  it('实心填充不叠透明度，图案填充与遮罩不受影响', () => {
    const fill = viewer.slice(viewer.indexOf('const fillEntity'), viewer.indexOf('const strokeEntity'));
    const solidBranch = fill.slice(fill.indexOf("if (fill.kind === 'mask')"));
    expect(solidBranch).not.toContain('globalAlpha');
    // 图案分支照旧有自己的绘制设置，没被一并改掉
    expect(fill).toContain("fill.kind === 'pattern'");
    // 分册 28 FR-28.4 把实心分支改成按 `rule` 取值；遮罩分支仍是奇偶。
    // 本条断言的是透明度，填充规则的判据在 dwgHatchBudget.test.ts
    expect(solidBranch.slice(0, solidBranch.indexOf('} else {'))).toContain("ctx.fill('evenodd')");
  });
});

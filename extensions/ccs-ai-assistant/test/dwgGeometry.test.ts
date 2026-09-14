/**
 * DWG 查看器几何层的行为测试（0.22.0 分册 19）。
 *
 * 测的是「画出来对不对」里可以脱离画布验证的那一半：曲线采样的形状、
 * 对比时画的是不是新旧并集、以及自适应视口会不会被离群实体拽跑。
 */

import { describe, expect, it } from 'vitest';
import type { DwgDocumentContent, DwgEntity } from '@webskill/sdk/agent';
import { collectDrawn, robustViewport, tessellate, usedLayers } from '../src/viewer/dwgGeometry';
import type { DwgPayload } from '../src/viewer/dwgGeometry';

function entity(handle: string, layer: string, geometry: DwgEntity['geometry']): DwgEntity {
  return { handle, kind: 'LINE', layer, geometry };
}

function doc(entities: readonly DwgEntity[], layers: DwgDocumentContent['layers'] = []): DwgDocumentContent {
  return {
    version: 'AC1027',
    layers,
    entities,
    bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
    omissions: []
  };
}

const line = (x: number, y: number): DwgEntity['geometry'] => ({
  kind: 'polyline',
  points: [
    { x, y },
    { x: x + 10, y }
  ],
  closed: false
});

describe('曲线采样', () => {
  it('圆采样出的点都落在圆周上，且首尾闭合', () => {
    const lines = tessellate({ kind: 'circle', center: { x: 5, y: -3 }, radius: 4 });
    expect(lines).toHaveLength(1);
    const points = lines[0]!;
    expect(points.length).toBeGreaterThan(20);
    for (const [x, y] of points) {
      expect(Math.hypot(x - 5, y + 3)).toBeCloseTo(4, 6);
    }
    const [fx, fy] = points[0]!;
    const [lx, ly] = points[points.length - 1]!;
    expect(Math.hypot(lx - fx, ly - fy)).toBeCloseTo(0, 6);
  });

  it('弧的首尾点落在起止角上，且不会画成整圆', () => {
    const points = tessellate({
      kind: 'arc',
      center: { x: 0, y: 0 },
      radius: 2,
      startAngle: 0,
      endAngle: Math.PI / 2
    })[0]!;
    expect(points[0]).toEqual([2, 0]);
    const last = points[points.length - 1]!;
    expect(last[0]).toBeCloseTo(0, 6);
    expect(last[1]).toBeCloseTo(2, 6);
    // 全在第一象限：起止角搞反会绕出 3/4 圈
    for (const [x, y] of points) {
      expect(x).toBeGreaterThanOrEqual(-1e-9);
      expect(y).toBeGreaterThanOrEqual(-1e-9);
    }
  });

  it('起角大于止角的弧按逆时针补一圈，而不是反向扫出负角', () => {
    const points = tessellate({
      kind: 'arc',
      center: { x: 0, y: 0 },
      radius: 1,
      startAngle: (Math.PI * 3) / 2,
      endAngle: Math.PI / 2
    })[0]!;
    const last = points[points.length - 1]!;
    expect(last[0]).toBeCloseTo(0, 6);
    expect(last[1]).toBeCloseTo(1, 6);
    // 经过 x=+1 这一侧（0 度），而不是 x=-1
    expect(Math.max(...points.map(([x]) => x))).toBeCloseTo(1, 6);
  });

  it('椭圆按长轴方向摆放，而不是总对着 X 轴', () => {
    const points = tessellate({
      kind: 'ellipse',
      center: { x: 0, y: 0 },
      majorAxis: { x: 0, y: 10 },
      ratio: 0.5,
      startAngle: 0,
      endAngle: Math.PI * 2
    })[0]!;
    const maxY = Math.max(...points.map(([, y]) => y));
    const maxX = Math.max(...points.map(([x]) => x));
    expect(maxY).toBeCloseTo(10, 6);
    expect(maxX).toBeCloseTo(5, 6);
  });

  it('闭合折线补回首点，开放折线不补', () => {
    const closed = tessellate({
      kind: 'polyline',
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 }
      ],
      closed: true
    })[0]!;
    expect(closed).toHaveLength(4);
    expect(closed[3]).toEqual(closed[0]);

    const open = tessellate({
      kind: 'polyline',
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 0 }
      ],
      closed: false
    })[0]!;
    expect(open).toHaveLength(2);
  });
});

describe('要画的集合', () => {
  const after = doc([entity('A', 'W', line(0, 0)), entity('B', 'W', line(5, 10)), entity('D', 'W', line(0, 30))]);

  it('颜色优先取实体自己的，没有才回落到图层', () => {
    const layered: DwgPayload = {
      kind: 'dwg',
      lang: 'en',
      after: doc(after.entities, [{ name: 'W', color: '#123456', visible: true }])
    };
    const drawn = collectDrawn(layered);
    expect(drawn).toHaveLength(3);
    expect(drawn.every((d) => d.color === '#123456')).toBe(true);
  });

  it('实体自带颜色时压过图层色', () => {
    const own = { ...after.entities[0]!, color: '#abcdef' };
    const drawn = collectDrawn({
      kind: 'dwg',
      lang: 'zh',
      after: doc([own], [{ name: 'W', color: '#123456', visible: true }])
    });
    expect(drawn[0]!.color).toBe('#abcdef');
  });
});

describe('自适应视口', () => {
  it('离群实体不会把视口撑开', () => {
    const entities = [
      ...Array.from({ length: 500 }, (_, i) => entity(`M${i}`, 'W', line(i % 25, Math.floor(i / 25)))),
      entity('FAR', 'W', line(9_000_000, 8_000_000))
    ];
    const drawn = collectDrawn({ kind: 'dwg', lang: 'zh', after: doc(entities) });
    const view = robustViewport(drawn);
    // 主体在 0..34 × 0..19；离群点在百万级，被分位数裁掉
    expect(view.maxX).toBeLessThan(100);
    expect(view.maxY).toBeLessThan(100);
  });

  it('全部实体重合时也给得出有面积的视口', () => {
    const drawn = collectDrawn({
      kind: 'dwg',
      lang: 'zh',
      after: doc([entity('P', 'W', { kind: 'point', at: { x: 7, y: 7 } })])
    });
    const view = robustViewport(drawn);
    expect(view.maxX - view.minX).toBeGreaterThan(0);
    expect(view.maxY - view.minY).toBeGreaterThan(0);
  });
});

describe('图层列表', () => {
  it('只列出真正画了东西的图层，按实体数降序', () => {
    const entities = [
      entity('1', 'WALL', line(0, 0)),
      entity('2', 'WALL', line(0, 1)),
      entity('3', 'WALL', line(0, 2)),
      entity('4', 'DIM', line(0, 3))
    ];
    const document = doc(entities, [
      { name: 'WALL', color: '#ff0000', visible: true },
      { name: 'DIM', color: '#00ff00', visible: true },
      { name: 'EMPTY', color: '#0000ff', visible: true }
    ]);
    const layers = usedLayers(collectDrawn({ kind: 'dwg', lang: 'zh', after: document }), document);
    expect(layers.map((l) => l.name)).toEqual(['WALL', 'DIM']);
    expect(layers[0]).toMatchObject({ count: 3, color: '#ff0000' });
  });
});

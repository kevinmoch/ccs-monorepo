/**
 * 场景索引与吸附（0.22.0 分册 32，AC-32.4 ~ AC-32.11）。
 *
 * 这一册的两个判据都能被真图纸证伪，所以夹具一律用 `fixtures/dwgViews.json`
 * 里从 `大堂立面图.dwg` 抓下来的实体，不用手搓的几条线段：
 * 网格索引在均匀分布的假数据上怎么写都对，只有真图纸那种「一角密得化不开、
 * 大半张纸是空的」的分布才能把格子划分的毛病逼出来。
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { DwgDocumentContent, DwgEntity } from '@webskill/sdk/agent';
import { collectDrawn, projectThroughViewport, viewportTransform } from '../src/viewer/dwgGeometry.js';
import type { Drawn } from '../src/viewer/dwgGeometry.js';
import { buildScene, snapAt, snapRank, subScene } from '../src/viewer/dwgScene.js';
import type { SceneItem } from '../src/viewer/dwgScene.js';

interface Fixture {
  readonly version: string;
  readonly layers: DwgDocumentContent['layers'];
  readonly elevationA: { entities: DwgEntity[]; bounds: DwgDocumentContent['bounds'] };
  readonly sheet: {
    id: string;
    entities: DwgEntity[];
    bounds: DwgDocumentContent['bounds'];
    viewports: readonly {
      center: { x: number; y: number };
      width: number;
      height: number;
      viewCenter: { x: number; y: number };
      viewHeight: number;
      twistAngle?: number;
      frozenLayers: readonly string[];
    }[];
  };
}

const fixture = JSON.parse(readFileSync(resolve(import.meta.dirname, 'fixtures/dwgViews.json'), 'utf8')) as Fixture;

const documentOf = (entities: readonly DwgEntity[], bounds: DwgDocumentContent['bounds']): DwgDocumentContent => ({
  version: fixture.version,
  layers: fixture.layers,
  entities,
  bounds,
  views: [],
  omissions: []
});

const drawnOf = (entities: readonly DwgEntity[], bounds: DwgDocumentContent['bounds']): Drawn[] =>
  collectDrawn({ kind: 'dwg', lang: 'zh', after: documentOf(entities, bounds) });

const elevation = drawnOf(fixture.elevationA.entities, fixture.elevationA.bounds);
const scene = buildScene(elevation);

/** 网格要跑赢的那个参照物：逐个包围盒相交，谁都知道它是对的，就是慢 */
const bruteForce = (items: readonly SceneItem[], minX: number, minY: number, maxX: number, maxY: number): SceneItem[] =>
  items.filter((e) => e.minX > e.maxX || !(e.maxX < minX || e.minX > maxX || e.maxY < minY || e.minY > maxY));

/** 可复现的伪随机，免得测试每跑一次都是另一组样本 */
const randomOf = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
};

describe('网格索引（AC-32.4 / AC-32.5）', () => {
  it('真图纸上有东西可索引，不是在对空集断言', () => {
    expect(elevation.length).toBeGreaterThan(500);
    expect(scene.items).toHaveLength(elevation.length);
    expect(scene.items.some((e) => e.lines.length > 0)).toBe(true);
  });

  it('200 个随机矩形，网格的结果与逐个相交测试逐条相同', () => {
    const all = scene.items;
    const [boxMinX, boxMinY, boxMaxX, boxMaxY] = all.reduce<[number, number, number, number]>(
      (acc, e) =>
        e.minX > e.maxX
          ? acc
          : [Math.min(acc[0], e.minX), Math.min(acc[1], e.minY), Math.max(acc[2], e.maxX), Math.max(acc[3], e.maxY)],
      [Infinity, Infinity, -Infinity, -Infinity]
    );
    const spanX = boxMaxX - boxMinX;
    const spanY = boxMaxY - boxMinY;
    const random = randomOf(20260913);
    let nonEmpty = 0;
    let culled = 0;
    for (let i = 0; i < 200; i += 1) {
      const w = spanX * (0.01 + random() * 0.4);
      const h = spanY * (0.01 + random() * 0.4);
      const minX = boxMinX - spanX * 0.1 + random() * spanX;
      const minY = boxMinY - spanY * 0.1 + random() * spanY;
      const got = [...scene.query(minX, minY, minX + w, minY + h)].sort((a, b) => all.indexOf(a) - all.indexOf(b));
      const want = bruteForce(all, minX, minY, minX + w, minY + h);
      expect(got).toEqual(want);
      if (want.length > 0) nonEmpty += 1;
      if (want.length < all.length) culled += 1;
    }
    // 全都查空、或者全都一个没剔掉，上面那 200 次断言就什么都没证明
    expect(nonEmpty).toBeGreaterThan(100);
    expect(culled).toBe(200);
  });

  it('位置不明的实体永远返回，与 itemsWithinBox 同口径', () => {
    const homeless: Drawn = {
      entity: { handle: 'X', type: 'UNKNOWN', layer: '0' } as unknown as DwgEntity,
      color: 'currentColor'
    };
    const withHomeless = buildScene([...elevation, homeless]);
    const far = withHomeless.query(1e9, 1e9, 1e9 + 1, 1e9 + 1);
    expect(far.map((e) => e.item)).toEqual([homeless]);
  });

  it('subScene 拿已算好的条目重建索引，结果与从头建一致', () => {
    const half = scene.items.filter((e) => e.minX <= e.maxX).slice(0, 300);
    const rebuilt = subScene(half);
    const box = [half[0]!.minX - 1, half[0]!.minY - 1, half[0]!.maxX + 1, half[0]!.maxY + 1] as const;
    expect(
      [...rebuilt.query(box[0], box[1], box[2], box[3])].sort((a, b) => half.indexOf(a) - half.indexOf(b))
    ).toEqual(bruteForce(half, box[0], box[1], box[2], box[3]));
  });
});

describe('视口反解与正投互为逆（AC-32.7）', () => {
  const unproject = (t: ReturnType<typeof viewportTransform>, x: number, y: number): [number, number] => {
    const ux = x - t.cx;
    const uy = y - t.cy;
    const dx = ux * t.cos + uy * t.sin;
    const dy = -ux * t.sin + uy * t.cos;
    return [t.vx + dx / t.scale, t.vy + dy / t.scale];
  };

  it('真图纸的视口参数上往返 200 次，相对误差都在 1e-9 以内', () => {
    const vp = fixture.sheet.viewports[0]!;
    const t = viewportTransform({ ...vp, id: 1, frozenLayers: [] } as never);
    const random = randomOf(7);
    let checked = 0;
    for (let i = 0; i < 200; i += 1) {
      const x = vp.viewCenter.x + (random() - 0.5) * vp.viewHeight * 4;
      const y = vp.viewCenter.y + (random() - 0.5) * vp.viewHeight * 4;
      const [px, py] = projectThroughViewport(t, x, y);
      const [bx, by] = unproject(t, px, py);
      expect(Math.abs(bx - x)).toBeLessThanOrEqual(Math.max(1e-9, Math.abs(x) * 1e-9));
      expect(Math.abs(by - y)).toBeLessThanOrEqual(Math.max(1e-9, Math.abs(y) * 1e-9));
      checked += 1;
    }
    expect(checked).toBe(200);
    // 变换本身不是恒等，否则上面只证明了「什么都没做」
    const [ox, oy] = projectThroughViewport(t, vp.viewCenter.x + 1000, vp.viewCenter.y);
    expect(Math.hypot(ox - (vp.viewCenter.x + 1000), oy - vp.viewCenter.y)).toBeGreaterThan(1);
  });
});

describe('吸附（AC-32.8 ~ AC-32.11）', () => {
  /** 真图纸上第一条折线的第一个顶点：它是画图的人确实定过的一个端点 */
  const firstPolyline = elevation.find(
    (d) => d.entity.geometry?.kind === 'polyline' && d.entity.geometry.points.length >= 2
  )!;
  const firstGeometry = firstPolyline.entity.geometry;
  if (firstGeometry?.kind !== 'polyline') throw new Error('fixture lost its polyline');
  const vertex = firstGeometry.points[0]!;

  it('端点周围取样一律吸回那个端点本身，逐字节相等', () => {
    // 屏幕 5 px 在这个比例下的世界半径；捕捉半径给 12 px
    const scale = 0.05;
    const radius = 12 / scale;
    const random = randomOf(99);
    let hits = 0;
    for (let i = 0; i < 40; i += 1) {
      const jitter = 5 / scale;
      const hit = snapAt(scene, vertex.x + (random() - 0.5) * jitter, vertex.y + (random() - 0.5) * jitter, radius);
      if (hit.kind !== 'endpoint') continue;
      expect(hit.x).toBe(vertex.x);
      expect(hit.y).toBe(vertex.y);
      hits += 1;
    }
    expect(hits).toBe(40);
  });

  it('端点压中点：同一处两类都在时返回端点', () => {
    expect(snapRank('endpoint')).toBeLessThan(snapRank('midpoint'));
    expect(snapRank('midpoint')).toBeLessThan(snapRank('center'));
    expect(snapRank('center')).toBeLessThan(snapRank('intersection'));
    expect(snapRank('intersection')).toBeLessThan(snapRank('edge'));
    // 一条线段：指针离中点 (2, 0) 只有 0.2，离端点 (0, 0) 有 1.8，两者都在半径内
    const line: Drawn = {
      entity: {
        handle: 'L',
        type: 'LINE',
        layer: '0',
        geometry: {
          kind: 'polyline',
          closed: false,
          points: [
            { x: 0, y: 0 },
            { x: 4, y: 0 }
          ]
        }
      } as unknown as DwgEntity,
      color: 'currentColor'
    };
    const one = buildScene([line]);
    const hit = snapAt(one, 1.8, 0, 3);
    expect(hit.kind).toBe('endpoint');
    expect([hit.x, hit.y]).toEqual([0, 0]);
    // 半径缩到只够得着中点时才轮到它
    expect(snapAt(one, 1.8, 0, 0.5).kind).toBe('midpoint');
  });

  it('捕捉半径是屏幕像素：放大十倍后同一世界距离不再吸附（AC-32.10）', () => {
    // 同一个采样点，半径按 12 px 折算：比例放大十倍，世界半径就缩到十分之一
    const scale = 0.05;
    const probeX = vertex.x + 12 / scale / 2;
    expect(snapAt(scene, probeX, vertex.y, 12 / scale).kind).toBe('endpoint');
    expect(snapAt(scene, probeX, vertex.y, 12 / (scale * 10)).kind).not.toBe('endpoint');
  });

  it('附近什么都没有时原样返回指针位置，不标类型（AC-32.11）', () => {
    const hit = snapAt(scene, 1e9, 1e9, 1);
    expect(hit).toEqual({ x: 1e9, y: 1e9, kind: undefined });
  });

  it('圆心吸得到，而且压得住线上最近点', () => {
    const circle: Drawn = {
      entity: {
        handle: 'C',
        type: 'CIRCLE',
        layer: '0',
        geometry: { kind: 'circle', center: { x: 5, y: 5 }, radius: 4 }
      } as unknown as DwgEntity,
      color: 'currentColor'
    };
    const one = buildScene([circle]);
    const hit = snapAt(one, 5.3, 5.2, 2);
    expect(hit.kind).toBe('center');
    expect([hit.x, hit.y]).toEqual([5, 5]);
  });

  it('交点算得出来：两条交叉线段的交点优先于线上最近点', () => {
    const seg = (handle: string, a: [number, number], b: [number, number]): Drawn => ({
      entity: {
        handle,
        type: 'LINE',
        layer: '0',
        geometry: {
          kind: 'polyline',
          closed: false,
          points: [
            { x: a[0], y: a[1] },
            { x: b[0], y: b[1] }
          ]
        }
      } as unknown as DwgEntity,
      color: 'currentColor'
    });
    // 两条线段都故意偏心：端点与中点都跑到 10 以外，交点在 (0, 0)
    const cross = buildScene([seg('A', [-10, -10], [30, 30]), seg('B', [-30, 30], [10, -10])]);
    const hit = snapAt(cross, 0.4, 0.3, 2);
    expect(hit.kind).toBe('intersection');
    expect(Math.hypot(hit.x, hit.y)).toBeLessThan(1e-9);
  });
});

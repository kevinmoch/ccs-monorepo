/**
 * 渲染保真（0.22.0 分册 24，AC-24.1 ~ AC-24.6）。
 *
 * 这三处缺陷都躲过了分册 23 的验收，因为 23 的夹具是构造出来的，
 * 比例尺、线型比例、圆弧起止角恰好全落在「正好」的值上。所以这一册的判据
 * 一律拿**真实图纸的切片**驱动：`fixtures/dwgViews.json` 由
 * `scripts/makeDwgViewFixture.ts` 从 `大堂立面图.dwg` 切出，一个字节的 DWG 都不写。
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as acad from '@node-projects/acad-ts';
import type { DwgEntity, DwgView } from '@webskill/sdk/agent';
import { dashOf } from '../src/shared/dwgSource.js';
import { DASH_FLOOR_PX, PATTERN_SPACING_FLOOR_PX, patternSpacingPx, screenDash } from '../src/viewer/dwgGeometry.js';

interface Fixture {
  readonly sheet: DwgView;
  readonly elevationA: { entities: DwgEntity[]; bounds: { minX: number; minY: number; maxX: number; maxY: number } };
}

const fixture = JSON.parse(readFileSync(resolve(import.meta.dirname, 'fixtures/dwgViews.json'), 'utf8')) as Fixture;

describe('圆弧就是圆弧（AC-24.1）', () => {
  it('真实图纸的 ARC 产出 arc 几何，起止角没丢', () => {
    const arcs = fixture.sheet.entities.filter((e) => e.kind === 'ARC');
    // 修复前这里全是 circle：`Arc extends Circle`，父类分支写在了前面
    expect(arcs.length).toBeGreaterThan(0);
    expect(arcs.every((e) => e.geometry?.kind === 'arc')).toBe(true);

    const sweeps = arcs.map((e) => {
      const g = e.geometry as { kind: 'arc'; startAngle: number; endAngle: number };
      return g.endAngle - g.startAngle;
    });
    // 起止角真的带着信息：整圆会让每一条的跨度都是 0 或 2π
    expect(sweeps.some((s) => Math.abs(s) > 1e-6 && Math.abs(Math.abs(s) - Math.PI * 2) > 1e-6)).toBe(true);
  });
});

describe('子类必须判在父类前面（AC-24.2）', () => {
  /**
   * 这个护栏是 AC-24.1 那条缺陷的真正防线。
   *
   * 只测「这张图纸的 ARC 对不对」挡不住下一次：TypeScript 不会报错，
   * 两个分支的返回值都合法，缺陷只在运行时以「弧画成整圆」的形式出现。
   * 所以这里直接读源码里的分支顺序，对着 acad-ts 的真实继承关系判。
   */
  const source = readFileSync(resolve(import.meta.dirname, '../src/shared/dwgSource.ts'), 'utf8');

  const branchOrder = (fn: string): string[] => {
    const start = source.indexOf(`function ${fn}(`);
    expect(start, `找不到 ${fn}`).toBeGreaterThan(-1);
    // 从函数开头扫到下一个顶格 `function`，就是这个函数的全部函数体
    const rest = source.slice(start + 1);
    const end = rest.indexOf('\nfunction ');
    const body = end === -1 ? rest : rest.slice(0, end);
    return [...body.matchAll(/entity instanceof (\w+)/g)].map((m) => m[1]!);
  };

  it('geometryOf 的分支顺序扫得到，而且真有若干条', () => {
    const order = branchOrder('geometryOf');
    // 扫空的护栏永远是绿的：先确认它确实读到了分支
    expect(order.length).toBeGreaterThan(5);
    expect(order).toContain('Arc');
    expect(order).toContain('Circle');
    // 这一对就是分册 24 §2.1 的缺陷本体
    expect(order.indexOf('Arc')).toBeLessThan(order.indexOf('Circle'));
  });

  it('没有任何一个父类排在它的子类前面', () => {
    const order = branchOrder('geometryOf');
    const registry = acad as unknown as Record<string, unknown>;
    const isClass = (name: string): name is string => typeof registry[name] === 'function';

    const offenders: string[] = [];
    for (let i = 0; i < order.length; i++) {
      for (let j = i + 1; j < order.length; j++) {
        const parent = order[i]!;
        const child = order[j]!;
        if (!isClass(parent) || !isClass(child)) continue;
        const Parent = registry[parent] as { prototype: object };
        const Child = registry[child] as { prototype: object };
        if (Child.prototype instanceof (Parent as unknown as new () => object)) {
          offenders.push(`${parent}(第 ${i + 1} 支) 是 ${child}(第 ${j + 1} 支) 的父类`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('线型比例（AC-24.3 / AC-24.4）', () => {
  const lineType = {
    name: 'DASHDOT',
    patternLength: 11.9,
    segments: [{ length: 6.8 }, { length: -2.5 }, { length: 0.1 }, { length: -2.5 }]
  };
  const period = (dash: readonly number[] | 'unavailable' | undefined): number =>
    Array.isArray(dash) ? dash.reduce((a, b) => a + b, 0) : Number.NaN;

  it('图纸的全局线型比例乘进段长', () => {
    // 不乘 LTSCALE 时是 11.9，`大堂立面图.dwg` 的 LTSCALE 是 10
    expect(period(dashOf({ lineType }, 'L', new Map()))).toBeCloseTo(11.9, 6);
    expect(period(dashOf({ lineType }, 'L', new Map(), 10))).toBeCloseTo(119, 6);
  });

  it('实体自己的线型比例与全局的相乘，不是二选一', () => {
    expect(period(dashOf({ lineType, lineTypeScale: 2 }, 'L', new Map(), 10))).toBeCloseTo(238, 6);
  });

  it('全局比例是 0 或 NaN 时按不缩放处理，而不是把虚线压成零长', () => {
    expect(period(dashOf({ lineType }, 'L', new Map(), 0))).toBeCloseTo(11.9, 6);
    expect(period(dashOf({ lineType }, 'L', new Map(), Number.NaN))).toBeCloseTo(11.9, 6);
  });

  it('真实图纸的红色详图框确实带着换算后的段长', () => {
    const periods = new Set(
      fixture.sheet.entities.filter((e) => e.dash).map((e) => Number(e.dash!.reduce((a, b) => a + b, 0).toFixed(1)))
    );
    // 修复前这两个数是 11.9 与 30.0，正好差一个 LTSCALE
    expect(periods).toEqual(new Set([119.2, 300]));
  });

  it('虚实判据不区分视口内外：同样的屏幕周期得到同样的结果', () => {
    // 纸面上 unit=1，视口里 unit=1/50——两边最终喂进来的都是 px，判据只认它
    expect(screenDash([10, 10], 5)).toEqual(screenDash([500, 500], 0.1));
    expect(screenDash([10, 10], 5)).toEqual([50, 50]);
  });

  it('只有短到画不出来的周期才退回实线', () => {
    expect(screenDash([1], DASH_FLOOR_PX * 2)).toEqual([DASH_FLOOR_PX * 2]);
    expect(screenDash([1], DASH_FLOOR_PX / 4)).toEqual([]);
    // 旧实现还有个 4000 px 的上限，长虚线会被误判成实线；周期再长也该照画
    expect(screenDash([1000, 1000], 10)).toEqual([10000, 10000]);
  });

  it('没有线型、比例非法时不炸', () => {
    expect(screenDash(undefined, 5)).toEqual([]);
    expect(screenDash([], 5)).toEqual([]);
    expect(screenDash([10], Number.NaN)).toEqual([]);
    expect(screenDash([10], -1)).toEqual([]);
  });
});

describe('图案填充的剔除判据（AC-24.5 / AC-24.6）', () => {
  const patterns = fixture.elevationA.entities
    .map((e) => e.fill)
    .filter((f): f is Extract<NonNullable<DwgEntity['fill']>, { kind: 'pattern' }> => f?.kind === 'pattern');

  /** 初始 fit：把整块内容装进 1200 × 800 的画布 */
  const fitScale = ((): number => {
    const b = fixture.elevationA.bounds;
    return Math.min(1200 / (b.maxX - b.minX), 800 / (b.maxY - b.minY)) * 0.92;
  })();

  it('切片里真的有图案填充可验', () => {
    expect(patterns.length).toBeGreaterThan(10);
  });

  it('初始比例下绝大多数都画出来，被跳过的自证小于一个像素', () => {
    const spacings = patterns.map((f) => patternSpacingPx(f.segments, fitScale));
    const drawn = spacings.filter((s) => s >= PATTERN_SPACING_FLOOR_PX);
    // 旧判据在这个比例下一个都不画；现在绝大多数都画
    expect(drawn.length).toBeGreaterThan(patterns.length * 0.8);
    // 被跳过的不是「碰巧落在阈值下面」，是真的挤在一个像素里看不出线
    for (const s of spacings.filter((v) => v < PATTERN_SPACING_FLOOR_PX)) {
      expect(s).toBeLessThan(1);
    }
  });

  it('旧判据量的是比例尺，在同样的比例下把它们全剔了', () => {
    // `px * 4 < 1` 成立，也就是旧实现在这里一个填充都不画；
    // 而同一批填充按间距量，绝大多数远在阈值之上。这条断言防止有人把判据改回去
    expect(fitScale * 4).toBeLessThan(1);
    const wide = patterns.filter((f) => patternSpacingPx(f.segments, fitScale) > 5);
    expect(wide.length).toBeGreaterThan(patterns.length / 2);
  });

  it('缩到真的糊成一片时照样跳过', () => {
    const tiny = fitScale / 5000;
    // 退化的那几个（零面积、单段）按约定永远判「画」，不计入
    const measurable = patterns.filter((f) => Number.isFinite(patternSpacingPx(f.segments, tiny)));
    expect(measurable.length).toBeGreaterThan(patterns.length / 2);
    expect(measurable.every((f) => patternSpacingPx(f.segments, tiny) < PATTERN_SPACING_FLOOR_PX)).toBe(true);
  });

  it('间距与比例成正比', () => {
    const sample = patterns.find((f) => Number.isFinite(patternSpacingPx(f.segments, 1)))!.segments;
    expect(patternSpacingPx(sample, 2)).toBeCloseTo(patternSpacingPx(sample, 1) * 2, 6);
  });

  it('退化输入一律按「画」处理，不被误判为过密', () => {
    const spacing = (segments: readonly number[], px = 1): number => patternSpacingPx(segments, px);
    expect(spacing([])).toBe(Infinity); // 没有线段
    expect(spacing([0, 0, 10, 0])).toBe(Infinity); // 一条水平线：包围盒零高
    expect(spacing([5, 5, 5, 5])).toBe(Infinity); // 零长线段
    expect(spacing([0, 0, 10, 0], Number.POSITIVE_INFINITY)).toBe(Infinity);
    // 坐标里混进 NaN 时跳过那一段，用剩下的算，结果仍然是个可比的有限数
    const withNaN = spacing([0, 0, Number.NaN, 1, 0, 0, 0, 100, 10, 0, 10, 100]);
    expect(Number.isFinite(withNaN)).toBe(true);
    expect(withNaN).toBeGreaterThan(PATTERN_SPACING_FLOOR_PX);
  });
});

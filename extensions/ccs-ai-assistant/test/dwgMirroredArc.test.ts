/**
 * 分册 33：翻手（镜像）变换下的圆弧与椭圆弧。
 *
 * `isConformal` 对镜像同样成立——镜像保长度、保角度大小，只翻角度的符号。
 * 修复前 `geometryOf` 一律按「起止角 + 旋转量」搬到世界系，这在行列式为负时
 * 等于把弧绕中心转了过去而不是照镜子，画出来的圆弧凸向正好反了。
 * 实测 `大堂平面图.dwg` 的 16 859 条弧里有 3 586 条落在翻手变换下（21%），
 * 来源是法向 `(0,0,-1)` 的实体与单轴负缩放的块引用。
 *
 * 判据不看角度数值，看**离散出来的世界坐标**：把同一条弧先变换后离散、
 * 与先离散后变换比。两者必须逐点重合——镜像会让绕行方向反过来，所以比的是逆序。
 * 这样即使将来换一套角度约定，只要画出来的点对，测试就该是绿的。
 */

import { describe, expect, it } from 'vitest';
import * as acad from '@node-projects/acad-ts';
import type { Entity } from '@node-projects/acad-ts';
import { geometryOf, ocsMatrix, type DwgMatrix } from '../src/shared/dwgSource.js';
import { tessellate } from '../src/viewer/dwgGeometry.js';

const IDENTITY: DwgMatrix = [1, 0, 0, 1, 0, 0];

/** 独立重写一遍仿射变换：拿被测模块自己的实现当参照物等于什么都没测 */
const apply = (m: DwgMatrix, p: readonly [number, number]): readonly [number, number] => [
  m[0] * p[0] + m[2] * p[1] + m[4],
  m[1] * p[0] + m[3] * p[1] + m[5]
];

const det = (m: DwgMatrix): number => m[0] * m[3] - m[1] * m[2];

function points(entity: Entity, m: DwgMatrix): Array<readonly [number, number]> {
  const loops = tessellate(geometryOf(entity, m));
  expect(loops).toHaveLength(1);
  return loops[0]!;
}

/**
 * 先变换后离散 ≡ 先离散后变换。
 *
 * 这是「几何在变换下不变」的完整表述，比只对端点强：只比端点的话，
 * 同一对端点之间有两条弧（优弧与劣弧），凸向反了照样能过。
 */
function expectTransformInvariant(entity: Entity, m: DwgMatrix): void {
  const got = points(entity, m);
  const want = points(entity, IDENTITY).map((p) => apply(m, p));
  // 镜像把绕行方向翻过来，点序随之逆转；点集本身必须一模一样
  const expected = det(m) < 0 ? [...want].reverse() : want;
  expect(got).toHaveLength(expected.length);
  for (const [i, p] of expected.entries()) {
    expect(got[i]![0]).toBeCloseTo(p[0], 6);
    expect(got[i]![1]).toBeCloseTo(p[1], 6);
  }
}

function arc(startAngle: number, endAngle: number): Entity {
  const entity = new acad.Arc();
  entity.center = new acad.XYZ(120, -45, 0);
  entity.radius = 37.5;
  entity.startAngle = startAngle;
  entity.endAngle = endAngle;
  return entity;
}

function ellipse(startParameter: number, endParameter: number): Entity {
  const entity = new acad.Ellipse();
  entity.center = new acad.XYZ(-8, 22, 0);
  entity.majorAxisEndPoint = new acad.XYZ(40, 15, 0);
  entity.radiusRatio = 0.45;
  entity.startParameter = startParameter;
  entity.endParameter = endParameter;
  return entity;
}

/** 法向 (0,0,-1)：x 取反、y 不变，行列式 -1 */
const OCS_DOWN = ocsMatrix({ x: 0, y: 0, z: -1 }) as DwgMatrix;

/** 块引用单轴负缩放（xScale = -1）叠 40° 旋转，行列式同样是 -1 */
const ROT = (40 * Math.PI) / 180;
const MIRRORED_INSERT: DwgMatrix = [-Math.cos(ROT), -Math.sin(ROT), -Math.sin(ROT), Math.cos(ROT), 310, -90];

/** 对照组：旋转 40° + 等比放大 2 倍，行列式为正 */
const PLAIN: DwgMatrix = [2 * Math.cos(ROT), 2 * Math.sin(ROT), -2 * Math.sin(ROT), 2 * Math.cos(ROT), 30, -10];

describe('T-33 翻手变换下的圆弧（AC-33.1 ~ AC-33.3）', () => {
  it('前提：两个镜像矩阵都是「保角但翻手」，否则测的是非保角回退分支', () => {
    for (const m of [OCS_DOWN, MIRRORED_INSERT]) {
      expect(det(m)).toBeCloseTo(-1, 12);
      // 保角：两轴等长、无剪切——这正是 isConformal 会放行、而修复前算错的那一类
      expect(m[0] * m[0] + m[1] * m[1]).toBeCloseTo(m[2] * m[2] + m[3] * m[3], 12);
      expect(m[0] * m[2] + m[1] * m[3]).toBeCloseTo(0, 12);
    }
    expect(det(PLAIN)).toBeCloseTo(4, 12);
  });

  it('AC-33.1 法向 (0,0,-1) 的圆弧镜像后凸向不变', () => {
    // 修复前：起止角变成 start+π / end+π，等于绕中心转了半圈，弧凸向正好反了
    expectTransformInvariant(arc(0.3, 1.9), OCS_DOWN);
  });

  it('AC-33.1 跨 0 / 跨 π 的弧同样成立', () => {
    expectTransformInvariant(arc(5.6, 0.8), OCS_DOWN);
    expectTransformInvariant(arc(2.4, 4.7), OCS_DOWN);
  });

  it('AC-33.2 单轴负缩放的块引用里的圆弧也镜像', () => {
    expectTransformInvariant(arc(0.3, 1.9), MIRRORED_INSERT);
    expectTransformInvariant(arc(5.6, 0.8), MIRRORED_INSERT);
  });

  it('AC-33.3 行列式为正时按旋转搬角度，没被镜像分支带跑', () => {
    expectTransformInvariant(arc(0.3, 1.9), PLAIN);
    expectTransformInvariant(arc(5.6, 0.8), PLAIN);
  });

  it('圆弧半径与中心照常跟着变换走', () => {
    const geometry = geometryOf(arc(0.3, 1.9), MIRRORED_INSERT);
    expect(geometry?.kind).toBe('arc');
    if (geometry?.kind !== 'arc') throw new Error('unreachable');
    expect(geometry.radius).toBeCloseTo(37.5, 9);
    expect(geometry.center.x).toBeCloseTo(apply(MIRRORED_INSERT, [120, -45])[0], 9);
    expect(geometry.center.y).toBeCloseTo(apply(MIRRORED_INSERT, [120, -45])[1], 9);
  });
});

describe('T-33 翻手变换下的椭圆弧（AC-33.4）', () => {
  it('AC-33.4 镜像后的椭圆弧逐点重合', () => {
    // 短轴在渲染侧按「长轴逆时针转 90°」还原，镜像把它甩到另一侧 ⇒ 参数要取反
    expectTransformInvariant(ellipse(0.4, 2.6), OCS_DOWN);
    expectTransformInvariant(ellipse(4.9, 1.1), MIRRORED_INSERT);
  });

  it('AC-33.4 行列式为正的椭圆弧不受影响', () => {
    expectTransformInvariant(ellipse(0.4, 2.6), PLAIN);
  });
});

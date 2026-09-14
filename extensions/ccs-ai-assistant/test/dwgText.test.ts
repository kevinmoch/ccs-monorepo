/**
 * 文字定位、线宽与线型实虚（0.22.0 分册 25，AC-25.1 ~ AC-25.11）。
 *
 * 这四处缺陷全都躲过了分册 19 / 23 / 24 的验收，共同原因是一样的：
 * 前几册关心的是「几何有没有画出来」，而这一册关心的是「画在哪、画多粗、画实还是画虚」。
 * 判据一律拿真实图纸的切片驱动，夹具由 `scripts/makeDwgViewFixture.ts` 切出。
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { DwgEntity, DwgGeometry, DwgView } from '@webskill/sdk/agent';
import { lineWeightOf, mtextAnchor, singleLineAnchor, stripFormatCodes } from '../src/shared/dwgSource.js';
import {
  MAX_STROKE_PX,
  MIN_STROKE_PX,
  dashForGeometry,
  fitsOneDashPeriod,
  geometryLength,
  strokeWidthPx,
  wrapText
} from '../src/viewer/dwgGeometry.js';

interface Fixture {
  readonly sheet: DwgView;
  readonly modelTexts: DwgEntity[];
}

const fixture = JSON.parse(readFileSync(resolve(import.meta.dirname, 'fixtures/dwgViews.json'), 'utf8')) as Fixture;

/** 从契约里取，而不是自己抄一份：抄的那份不会随契约变，测了也是白测 */
type TextGeometry = Extract<DwgGeometry, { kind: 'text' }>;

const textsOf = (entities: readonly DwgEntity[]): TextGeometry[] =>
  entities.map((e) => e.geometry).filter((g): g is TextGeometry => g?.kind === 'text');

describe('文字落在它该在的地方（AC-25.1 / AC-25.2）', () => {
  it('模型空间的 178 个 MTEXT 按 attachmentPoint 分成正中与左上两组', () => {
    const texts = textsOf(fixture.modelTexts);
    expect(texts).toHaveLength(178);

    const tally = new Map<string, number>();
    for (const g of texts) {
      const key = `${g.anchorX}/${g.anchorY}`;
      tally.set(key, (tally.get(key) ?? 0) + 1);
    }
    // 修复前这 178 个全是 left/baseline——`attachmentPoint` 一个字都没读。
    // 96 个正中的文字因此整体偏出半个字高加半个字宽，溢到方框和圆圈外面
    expect(tally.get('center/middle')).toBe(96);
    expect(tally.get('left/top')).toBe(82);
    expect(tally.size).toBe(2);
  });

  it('图纸空间的单行 TEXT 也带上了对齐，不是只有 MTEXT', () => {
    const single = fixture.sheet.entities.filter((e) => e.kind === 'TEXT');
    const texts = textsOf(single);
    expect(texts.length).toBeGreaterThan(0);
    expect(texts.every((g) => g.anchorX !== undefined && g.anchorY !== undefined)).toBe(true);
    // 单行 TEXT 的 `textAnchor()` 早就算对了锚点**位置**，缺的一直是锚点的**语义**。
    // 这张图的单行文字用了不止一种对齐，否则这条断言等于没测
    expect(new Set(texts.map((g) => `${g.anchorX}/${g.anchorY}`)).size).toBeGreaterThan(1);
  });

  it('九种 attachmentPoint 各归各位，越界值回落到左基线而不是抛错', () => {
    expect(mtextAnchor(1)).toEqual({ anchorX: 'left', anchorY: 'top' });
    expect(mtextAnchor(2)).toEqual({ anchorX: 'center', anchorY: 'top' });
    expect(mtextAnchor(3)).toEqual({ anchorX: 'right', anchorY: 'top' });
    expect(mtextAnchor(4)).toEqual({ anchorX: 'left', anchorY: 'middle' });
    expect(mtextAnchor(5)).toEqual({ anchorX: 'center', anchorY: 'middle' });
    expect(mtextAnchor(6)).toEqual({ anchorX: 'right', anchorY: 'middle' });
    expect(mtextAnchor(7)).toEqual({ anchorX: 'left', anchorY: 'bottom' });
    expect(mtextAnchor(8)).toEqual({ anchorX: 'center', anchorY: 'bottom' });
    expect(mtextAnchor(9)).toEqual({ anchorX: 'right', anchorY: 'bottom' });

    const fallback = { anchorX: 'left', anchorY: 'baseline' };
    expect(mtextAnchor(0)).toEqual(fallback);
    expect(mtextAnchor(10)).toEqual(fallback);
    expect(mtextAnchor(undefined)).toEqual(fallback);
  });

  it('单行 TEXT 的 Middle 是「正中」，它把纵向也定死了', () => {
    // 组码 72 取 4 时组码 73 不起作用——纵向由 Middle 自己定，传什么都得是 middle
    expect(singleLineAnchor(4, 0)).toEqual({ anchorX: 'center', anchorY: 'middle' });
    expect(singleLineAnchor(4, 3)).toEqual({ anchorX: 'center', anchorY: 'middle' });

    expect(singleLineAnchor(0, 0)).toEqual({ anchorX: 'left', anchorY: 'baseline' });
    expect(singleLineAnchor(1, 3)).toEqual({ anchorX: 'center', anchorY: 'top' });
    expect(singleLineAnchor(2, 1)).toEqual({ anchorX: 'right', anchorY: 'bottom' });
    expect(singleLineAnchor(undefined, undefined)).toEqual({ anchorX: 'left', anchorY: 'baseline' });
  });
});

describe('MTEXT 的格式码要剥干净（AC-25.9 / AC-25.10）', () => {
  it('真实图纸里不再有格式码残留', () => {
    const texts = textsOf(fixture.modelTexts).concat(textsOf(fixture.sheet.entities));
    const leaked = texts.map((g) => g.text).filter((s) => /^[ACFHQTW][\d.]*[xX]?;/.test(s));
    // 修复前这里有 4 条：`W0.8;T0.8;深圳市杰恩创意设计股份有限公司` 等
    expect(leaked).toEqual([]);
  });

  it('「生产项目（G组团）」的 G 不再被格式码粘住', () => {
    const texts = textsOf(fixture.sheet.entities).map((g) => g.text);
    // 原文是 `生产项目（\W.8;G组团）`，被 acad-ts 读成 `W.8;G` 与 `组团）` 两条。
    // 剥掉残留后前一条就是干净的 `G`，两条并排显示才拼得回「G组团）」
    expect(texts).toContain('G');
    expect(texts).toContain('组团）');
    expect(texts.some((s) => s.includes('W.8;'))).toBe(false);
  });

  it('连着的多个格式码要反复剥', () => {
    expect(stripFormatCodes('W0.8;T0.8;深圳市杰恩创意设计股份有限公司')).toBe('深圳市杰恩创意设计股份有限公司');
    expect(stripFormatCodes('T0.9;FD1.1.04a')).toBe('FD1.1.04a');
    expect(stripFormatCodes('W.8;G')).toBe('G');
    expect(stripFormatCodes('H1.5x;标高')).toBe('标高');
  });

  it('正文里合法的字母数字分号不能误删', () => {
    // 剥的是**前缀**，中间的一律不动：反斜杠一没，正文与残留就完全同形，分不出来
    expect(stripFormatCodes('会议室 A1;B2')).toBe('会议室 A1;B2');
    expect(stripFormatCodes('W5 号楼')).toBe('W5 号楼');
    expect(stripFormatCodes('T3')).toBe('T3');
    // 后面跟的不是分号，就不是格式码形状
    expect(stripFormatCodes('W0.8 米')).toBe('W0.8 米');
    // 小写字母也是格式码，但纯正文的小写词不该被当成格式码
    expect(stripFormatCodes('code: abc')).toBe('code: abc');
  });

  it('整条文字都是格式码时不能剥成空串', () => {
    // 剥空等于让这条文字整个从图上消失，那比留着残留更糟
    expect(stripFormatCodes('W0.8;')).toBe('W0.8;');
  });
});

describe('线宽要解开三个间接值（AC-25.5 / AC-25.6）', () => {
  const layers = new Map([
    ['粗线层', 50],
    ['细线层', 5],
    ['默认层', -3]
  ]);

  it('ByLayer 解成图层的线宽', () => {
    expect(lineWeightOf({ lineWeight: -1 }, '粗线层', layers, undefined)).toBe(50);
    expect(lineWeightOf({ lineWeight: -1 }, '细线层', layers, undefined)).toBe(5);
  });

  it('图层自己写着 Default 时解成文档默认值，而不是把 -3 当线宽用', () => {
    // -3 直接当线宽会得到负数描边，canvas 会整条线不画
    expect(lineWeightOf({ lineWeight: -1 }, '默认层', layers, undefined)).toBe(25);
    expect(lineWeightOf({ lineWeight: -3 }, '粗线层', layers, undefined)).toBe(25);
  });

  it('ByBlock 解成块引用的线宽', () => {
    expect(lineWeightOf({ lineWeight: -2 }, '粗线层', layers, 40)).toBe(40);
    // 块引用自己也没解出来时就没得继承
    expect(lineWeightOf({ lineWeight: -2 }, '粗线层', layers, undefined)).toBeUndefined();
  });

  it('解不出来时省略，而不是编一个值', () => {
    expect(lineWeightOf({ lineWeight: -1 }, '查无此层', layers, undefined)).toBeUndefined();
    expect(lineWeightOf({ lineWeight: -4 }, '粗线层', layers, undefined)).toBeUndefined();
    expect(lineWeightOf({}, '粗线层', layers, undefined)).toBeUndefined();
    expect(lineWeightOf({ lineWeight: Number.NaN }, '粗线层', layers, undefined)).toBeUndefined();
  });

  it('真实图纸的线宽已经解开，不再剩下负数的间接值', () => {
    const weights = fixture.sheet.entities.map((e) => e.lineWeight).filter((w): w is number => typeof w === 'number');
    // 修复前这个数组是空的：`lineWeight` 根本没进载荷
    expect(weights.length).toBeGreaterThan(0);
    expect(weights.every((w) => w >= 0)).toBe(true);
    // 这张图的线宽跨十倍，正是官方图能分出层次的原因
    expect(Math.max(...weights) / Math.max(1, Math.min(...weights.filter((w) => w > 0)))).toBeGreaterThan(3);
  });

  it('最粗与最细在屏幕上分得出来，且都落在钳位区间里', () => {
    const thin = strokeWidthPx(5);
    const thick = strokeWidthPx(50);
    expect(thick).toBeGreaterThan(thin);
    for (const px of [thin, thick, strokeWidthPx(1), strokeWidthPx(2000)]) {
      expect(px).toBeGreaterThanOrEqual(MIN_STROKE_PX);
      expect(px).toBeLessThanOrEqual(MAX_STROKE_PX);
    }
    // 没线宽的实体按 1 px 画，与分册 24 的老样子一致
    expect(strokeWidthPx(undefined)).toBe(1);
    expect(strokeWidthPx(0)).toBe(1);
  });
});

describe('装不下一个周期的线按实线画（AC-25.7 / AC-25.8）', () => {
  it('Layout1 里那 9 条线长不足一个周期的折线改画实线', () => {
    const dashed = fixture.sheet.entities.filter((e) => e.dash && e.geometry?.kind === 'polyline');
    expect(dashed).toHaveLength(17);

    const solid = dashed.filter((e) => dashForGeometry(e.dash, e.geometry, 1).length === 0);
    // 典型是 `A-DETL-____-OTLN` 上的 `线长 117 / 周期 119 = 0.98`：
    // 只差一点点就够一个周期，画出来就是「一个短划加一段空白」，既虚又断
    expect(solid).toHaveLength(9);
    // 剩下 8 条装得下，仍旧是虚线——不能一刀切成全实线
    expect(dashed.length - solid.length).toBe(8);
  });

  it('判定与镜头缩放无关', () => {
    const entity = fixture.sheet.entities.find(
      (e) => e.dash && e.geometry?.kind === 'polyline' && dashForGeometry(e.dash, e.geometry, 1).length > 0
    );
    expect(entity).toBeDefined();
    // 同一条线在任意缩放下虚实判定必须一致：
    // 拿屏幕长度去判会让它放大时是实线、缩小时变虚线
    for (const px of [0.01, 1, 100]) {
      expect(fitsOneDashPeriod(entity!.dash, geometryLength(entity!.geometry))).toBe(true);
      expect(dashForGeometry(entity!.dash, entity!.geometry, px).length).toBeGreaterThan(0);
    }
  });

  it('周期与长度的比较就在世界单位上', () => {
    const dash = [6, 4];
    expect(fitsOneDashPeriod(dash, 10)).toBe(true);
    expect(fitsOneDashPeriod(dash, 9.9)).toBe(false);
    expect(fitsOneDashPeriod(dash, 0)).toBe(false);
    expect(fitsOneDashPeriod(undefined, 1000)).toBe(false);
    expect(fitsOneDashPeriod([], 1000)).toBe(false);
    // 退化输入按实线处理，与分册 24 的取向一致
    expect(fitsOneDashPeriod([0, 0], 1000)).toBe(false);
    expect(fitsOneDashPeriod(dash, Number.NaN)).toBe(false);
    expect(fitsOneDashPeriod([Number.NaN], 1000)).toBe(false);
  });

  it('各种几何都量得出长度', () => {
    expect(
      geometryLength({
        kind: 'polyline',
        points: [
          { x: 0, y: 0 },
          { x: 3, y: 4 }
        ],
        closed: false
      })
    ).toBe(5);
    // 闭合折线要把回到起点的那条边算进去
    expect(
      geometryLength({
        kind: 'polyline',
        points: [
          { x: 0, y: 0 },
          { x: 3, y: 0 },
          { x: 3, y: 4 }
        ],
        closed: true
      })
    ).toBe(12);
    expect(geometryLength({ kind: 'circle', center: { x: 0, y: 0 }, radius: 1 })).toBeCloseTo(Math.PI * 2);
    expect(
      geometryLength({ kind: 'arc', center: { x: 0, y: 0 }, radius: 2, startAngle: 0, endAngle: Math.PI })
    ).toBeCloseTo(Math.PI * 2);
    // 量不出长度的形状返回 0，于是一律按实线画
    expect(geometryLength({ kind: 'point', at: { x: 0, y: 0 } })).toBe(0);
    expect(geometryLength(undefined)).toBe(0);
  });
});

describe('按宽度折行（AC-25.11）', () => {
  // 每个字符算 10 px 的假字体：折行逻辑本身与真实字宽无关
  const measure = (s: string): number => s.length * 10;

  it('中文没有空格也要断得开', () => {
    expect(wrapText(measure, '修改次数时间修改内容', 30)).toEqual(['修改次', '数时间', '修改内', '容']);
  });

  it('英文优先在空格处断，不把单词劈两半', () => {
    expect(wrapText(measure, 'alpha beta gamma', 100)).toEqual(['alpha beta', 'gamma']);
  });

  it('单个词比一行还长时只能硬断，不能撑出去', () => {
    expect(wrapText(measure, 'supercalifragilistic', 50)).toEqual(['super', 'calif', 'ragil', 'istic']);
  });

  it('宽度无效或文本为空时原样返回单行', () => {
    expect(wrapText(measure, '一行字', 0)).toEqual(['一行字']);
    expect(wrapText(measure, '一行字', Number.NaN)).toEqual(['一行字']);
    expect(wrapText(measure, '', 100)).toEqual(['']);
  });

  it('真实图纸里带换行宽度的文字确实占多数', () => {
    const texts = textsOf(fixture.modelTexts);
    const wrapped = texts.filter((g) => (g.wrapWidth ?? 0) > 0);
    // 82 / 178 带 rectangleWidth，而它们的 plainText 一个换行符都没有——
    // 换行本来就该由这个宽度算出来，不算就会横着捅出格子
    expect(wrapped).toHaveLength(82);
    expect(texts.every((g) => !g.text.includes('\n'))).toBe(true);
  });
});

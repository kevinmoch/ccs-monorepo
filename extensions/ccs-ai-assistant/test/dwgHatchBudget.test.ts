/**
 * 分册 28：图案填充预算、遮罩边框、转角填充规则与图纸字体。
 *
 * 数值实测自 `/Users/mochunhui/Git/2D.dwg` 与 `/Users/mochunhui/Git/大堂平面图.dwg`，
 * 两份图纸都不进仓库，所以这里断言的是解析/渲染链上那几个纯函数的行为，
 * 输入按实测数值构造。测量结果写在 `docs/0.22.0/28-req-*.md` §2。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fontOf, patternSegmentEstimate, widePolylineLoops } from '../src/shared/dwgSource';
import { fontFamilyOf } from '../src/viewer/dwgGeometry';

const IDENTITY = [1, 0, 0, 1, 0, 0] as const;

/** 需求里写死的阈值；测试和实现各自独立持有，改实现不会连带改判据 */
const LIMIT = 20000;

type Loop = readonly { readonly x: number; readonly y: number }[];

/**
 * 两种填充规则下的点包含判定，与 canvas 的 `fill('evenodd')` / `fill('nonzero')` 同义。
 *
 * 用射线穿越计数：穿越次数的奇偶给奇偶规则，带方向的绕数给非零规则。
 */
function inside(loops: readonly Loop[], px: number, py: number): { evenodd: boolean; nonzero: boolean } {
  let crossings = 0;
  let winding = 0;
  for (const loop of loops) {
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i]!;
      const b = loop[(i + 1) % loop.length]!;
      if (a.y <= py ? b.y > py : b.y <= py) {
        const t = (py - a.y) / (b.y - a.y);
        if (a.x + t * (b.x - a.x) > px) {
          crossings += 1;
          winding += b.y > a.y ? 1 : -1;
        }
      }
    }
  }
  return { evenodd: crossings % 2 === 1, nonzero: winding !== 0 };
}

describe('T-28-A 展开前的图案预算（AC-28.2 / AC-28.3）', () => {
  it('估算是保守上界：2D.dwg 最密的那类填充估出来仍远低于阈值', () => {
    // 实测 2D.dwg 的 ACAD_ISO07W100：包围盒对角线 2789.3、偏移 75、dash 周期 52.5
    const estimate = patternSegmentEstimate(
      [{ offset: { x: 7.105427357601002e-15, y: 75.00000000000001 }, dashLengths: [7.500000000000001, -45] }],
      2789.3
    );
    expect(Math.round(estimate)).toBe(1976);
    expect(estimate).toBeLessThan(LIMIT);
  });

  it('大堂平面图那个爆堆的填充被判为超预算', () => {
    // 实测那个 CROSS：包围盒对角线 6.2586e8（patternScale 1000 下的病态数据）、
    // 两族图案线偏移模均 2245.3、dash 周期 3175。
    // 真去展开的话 V8 会 abort（不是异常，是进程级中止），扩展直接消失
    const estimate = patternSegmentEstimate(
      [
        { offset: { x: 792.9854401947741, y: 2100.353920566508 }, dashLengths: [793.75, -2381.25] },
        { offset: { x: -2100.353920566508, y: 792.9854401947741 }, dashLengths: [793.75, -2381.25] }
      ],
      625860274.6
    );
    expect(estimate).toBeGreaterThan(LIMIT);
    // 实测量级 1.099e11 段。不是擦线，是差了七个数量级
    expect(estimate).toBeGreaterThan(1e11);
  });

  it('点状图案的 dash 周期极小，靠 dash 因子才能被拦下', () => {
    // 实测大堂平面图的 DOTS：span 才 9445.7，单看偏移只算得 5322，不超阈值；
    // 乘上 dash 因子后是 3166 万。没有 dash 因子的估算会把它放过去
    const line = { offset: { x: 1.5874999999999997, y: -0.7937500000000003 }, dashLengths: [0, -1.5875] };
    expect(patternSegmentEstimate([{ ...line, dashLengths: [] }], 9445.7)).toBeLessThan(LIMIT);
    expect(patternSegmentEstimate([line], 9445.7)).toBeGreaterThan(3e7);
  });

  it('虚线图案按 dash 周期再乘一遍：同样的偏移，带 dash 的估得更多', () => {
    const solid = patternSegmentEstimate([{ offset: { x: 0, y: 10 }, dashLengths: [] }], 1000);
    const dashed = patternSegmentEstimate([{ offset: { x: 0, y: 10 }, dashLengths: [5, -5] }], 1000);
    expect(solid).toBeCloseTo(100, 6);
    // 每条线被切成 1000/10 = 100 段，总量 100 × 100
    expect(dashed).toBeCloseTo(10000, 6);
    expect(dashed).toBeGreaterThan(solid);
  });

  it('dash 周期比跨度还长时不放大，也不缩小', () => {
    // max(1, …) 少了的话这里会算成 1000/10 × 0.1 = 10，把病态数据放过去
    expect(patternSegmentEstimate([{ offset: { x: 0, y: 10 }, dashLengths: [99999] }], 1000)).toBeCloseTo(100, 6);
  });

  it('偏移为 0 或非有限值一律当超预算', () => {
    expect(patternSegmentEstimate([{ offset: { x: 0, y: 0 }, dashLengths: [] }], 1000)).toBe(Infinity);
    expect(patternSegmentEstimate([{ offset: { x: Number.NaN, y: 1 }, dashLengths: [] }], 1000)).toBe(Infinity);
    // 一族正常一族退化，整体仍要判超——否则退化那族展开时照样吃光堆
    expect(
      patternSegmentEstimate(
        [
          { offset: { x: 0, y: 10 }, dashLengths: [] },
          { offset: { x: 0, y: 0 }, dashLengths: [] }
        ],
        1000
      )
    ).toBe(Infinity);
  });

  it('没有图案线或跨度退化时估 0，不误伤', () => {
    expect(patternSegmentEstimate([], 1000)).toBe(0);
    expect(patternSegmentEstimate([{ offset: { x: 0, y: 10 }, dashLengths: [] }], 0)).toBe(0);
    expect(patternSegmentEstimate([{ offset: { x: 0, y: 10 }, dashLengths: [] }], Number.NaN)).toBe(0);
  });
});

describe('T-28-B 转角的填充规则（AC-28.9 ~ AC-28.11）', () => {
  // 实测 2D2 的穿梁套管红框：环带 9 px，外框 24 px。我们按奇偶规则画出来的一行是
  // 5 / 9 / 5 三截，中间被异或掉两个缺口——就是用户说的「像三个方框嵌套」。
  const vertices = [
    { point: { x: 0, y: 0 }, startWidth: 10, endWidth: 10, bulge: 0 },
    { point: { x: 100, y: 0 }, startWidth: 10, endWidth: 10, bulge: 0 },
    { point: { x: 100, y: 100 }, startWidth: 10, endWidth: 10, bulge: 0 },
    { point: { x: 0, y: 100 }, startWidth: 10, endWidth: 10, bulge: 0 }
  ];
  const loops = widePolylineLoops(vertices, true, IDENTITY) as readonly Loop[];

  it('闭合矩形铺出四段带面，转角处相邻两段真的重叠', () => {
    // 四段带面 + 分册 29 FR-29.2 补的四个外角接头
    expect(loops).toHaveLength(8);
    // 转角重叠区：底边那段盖 x∈[0,100] y∈[-5,5]，右边那段盖 x∈[95,105] y∈[0,100]，
    // 交集是角上那块 5×5。接头贴在**外侧**（x>100），盖不到这里
    const covered = loops.filter((loop) => inside([loop], 97.5, 2.5).nonzero);
    expect(covered).toHaveLength(2);
  });

  it('转角重叠点在非零规则下被填，在奇偶规则下被挖空', () => {
    const at = inside(loops, 97.5, 2.5);
    // 这两条必须一真一假，否则这个测试对规则不敏感，改回 evenodd 也照样绿
    expect(at.nonzero).toBe(true);
    expect(at.evenodd).toBe(false);
    // 四个角都是同一回事，不是某一处的偶然
    for (const [x, y] of [
      [97.5, 97.5],
      [2.5, 97.5],
      [2.5, 2.5]
    ] as const) {
      const corner = inside(loops, x, y);
      expect(corner.nonzero).toBe(true);
      expect(corner.evenodd).toBe(false);
    }
  });

  it('带面内部与外部两种规则判定一致，差别只在重叠处', () => {
    // 边的中段只被一个四边形盖住，两种规则都算在里面
    const mid = inside(loops, 50, -3);
    expect(mid.nonzero).toBe(true);
    expect(mid.evenodd).toBe(true);
    // 矩形正中是空的（线宽 10 撑不到中心），两种规则都算在外面
    const hollow = inside(loops, 50, 50);
    expect(hollow.nonzero).toBe(false);
    expect(hollow.evenodd).toBe(false);
  });
});

describe('T-28-C 图纸字体（AC-28.12 / AC-28.13 / AC-28.15）', () => {
  it('样式里的两个字体槽分别读出来', () => {
    // 实测 2D.dwg 的 TH-STYLE2：129 条中文走这个样式
    expect(fontOf({ style: { filename: 'th-rmc', bigFontFilename: 'th-chnc' } })).toEqual({
      font: { file: 'th-rmc', bigFile: 'th-chnc' }
    });
    expect(fontOf({ style: { filename: 'arial.ttf', bigFontFilename: '' } })).toEqual({ font: { file: 'arial.ttf' } });
    expect(fontOf({ style: { filename: 'simhei.ttf' } })).toEqual({ font: { file: 'simhei.ttf' } });
  });

  it('文件名为空的样式不产出字体，交给渲染端回落', () => {
    // 实测 2D.dwg 里名字叫「宋体」「微软雅黑 light」的样式，filename 都是空串
    expect(fontOf({ style: { filename: '', bigFontFilename: '' } })).toEqual({});
    expect(fontOf({ style: { filename: '   ' } })).toEqual({});
    expect(fontOf({})).toEqual({});
  });

  it('宽度因子只在不等于 1 时带出来', () => {
    expect(fontOf({ style: { filename: 'arial.ttf', width: 1 } })).toEqual({ font: { file: 'arial.ttf' } });
    expect(fontOf({ style: { filename: 'arial.ttf', width: 0.8 } })).toEqual({
      font: { file: 'arial.ttf', widthFactor: 0.8 }
    });
    // 0 与负值是坏数据，带出去会让文字被压成零宽
    expect(fontOf({ style: { filename: 'arial.ttf', width: 0 } })).toEqual({ font: { file: 'arial.ttf' } });
    expect(fontOf({ style: { width: 0.8 } })).toEqual({ font: { widthFactor: 0.8 } });
  });

  it('字体文件名映射到对应字体族，大小写与扩展名都不影响', () => {
    expect(fontFamilyOf({ file: 'simhei.ttf' })).toContain('SimHei');
    expect(fontFamilyOf({ file: 'SIMHEI.TTF' })).toContain('SimHei');
    expect(fontFamilyOf({ file: 'simsun' })).toContain('SimSun');
    expect(fontFamilyOf({ file: 'SIMYOU.TTF' })).toContain('YouYuan');
    expect(fontFamilyOf({ file: 'simkai.ttf' })).toContain('KaiTi');
    expect(fontFamilyOf({ file: 'msyh.ttf' })).toContain('Microsoft YaHei');
    expect(fontFamilyOf({ file: 'arial.ttf' })).toContain('Arial');
  });

  it('认不出来的字体（含所有 SHX）落到宋体/衬线，不落到微软雅黑', () => {
    // 用户看到的「原厂是宋体」正是官方查看器对 SHX 笔画字体的替代观感
    for (const file of ['th-rmc', 'SIMPLEX.shx', 'GBCBIG.shx', 'romantic.ttf', undefined]) {
      const family = fontFamilyOf(file === undefined ? undefined : { file });
      expect(family).toContain('serif');
      expect(family).not.toContain('Microsoft YaHei');
    }
    expect(fontFamilyOf(undefined)).toContain('SimSun');
  });

  it('大字体排在主字体前面，中文才轮得到它', () => {
    const family = fontFamilyOf({ file: 'arial.ttf', bigFile: 'simhei.ttf' });
    expect(family.indexOf('SimHei')).toBeLessThan(family.indexOf('Arial'));
  });

  it('任何情况下都以通用族收尾，不会出现空字体串', () => {
    for (const font of [undefined, {}, { file: 'arial.ttf' }, { file: 'zzz-unknown' }]) {
      const family = fontFamilyOf(font);
      expect(family.trim().length).toBeGreaterThan(0);
      expect(family.endsWith('serif')).toBe(true);
    }
  });

  it('同一个族出现在两个槽里不重复列出', () => {
    expect(fontFamilyOf({ file: 'simhei.ttf', bigFile: 'simhei.ttf' }).match(/SimHei/g)).toHaveLength(1);
  });
});

describe('T-28-D 护栏：调用点（AC-28.1 / AC-28.5 / AC-28.7 / AC-28.14 / AC-28.15）', () => {
  const source = readFileSync(resolve(import.meta.dirname, '../src/shared/dwgSource.ts'), 'utf8');
  const viewer = readFileSync(resolve(import.meta.dirname, '../src/viewer/viewerDwg.ts'), 'utf8');

  it('预算判断发生在 explodePattern 之前', () => {
    // 纯函数测不到「判断排在第几行」，而排错的后果实测是进程级 abort：
    // 扩展直接消失，连错误都报不出来。这里盯的就是这个顺序。
    const fn = source.slice(source.indexOf('function patternSegments('));
    const budget = fn.indexOf('PATTERN_ESTIMATE_LIMIT');
    const explode = fn.indexOf('explodePattern()');
    expect(budget).toBeGreaterThanOrEqual(0);
    expect(explode).toBeGreaterThanOrEqual(0);
    expect(budget).toBeLessThan(explode);
  });

  it('超预算走的是既有的 too-dense 降级路径，不另起一套', () => {
    // 取整个函数体而不是定长窗口：分册 30 在里面插了裁剪，定长窗口会随行数漂移。
    // 折行也一并抹平，判据盯的是那两道限额还在，不是 prettier 怎么换行
    const body = source.slice(source.indexOf('function patternSegments('));
    const fn = body.slice(0, body.indexOf('\n}\n')).replace(/\s+/g, ' ');
    expect(fn).toContain("> PATTERN_ESTIMATE_LIMIT) return 'too-dense'");
    // 后验限额没被顺手删掉：它兜的是估算偏乐观的漏网之鱼
    expect(fn).toContain("lines.length > PATTERN_SEGMENT_LIMIT) return 'too-dense'");
    // 降级分支照旧上报，不静默丢弃
    const hatch = source.slice(source.indexOf('const segments = patternSegments('));
    expect(hatch.slice(0, 400)).toContain('PATTERN_TOO_DENSE');
  });

  it('估算用的边界不带块变换，和图案偏移同一把尺子', () => {
    // 传世界坐标的 loops 进去的话，块缩放会把尺子整体放大/缩小，判据随之漂移
    expect(source).toContain('hatchBoundaryPoints(entity, IDENTITY)');
  });

  it('宽多段线的带面标成非零环绕', () => {
    const fn = source.slice(source.indexOf('function wideFill('), source.indexOf('function wideFill(') + 500);
    expect(fn).toContain("rule: 'nonzero'");
  });

  it('遮罩不描边', () => {
    const paint = viewer.slice(viewer.indexOf('const paintEntity'), viewer.indexOf('const dashPattern'));
    const guard = paint.indexOf("fill?.kind === 'mask'");
    expect(guard).toBeGreaterThanOrEqual(0);
    // 守卫必须在描边之前，放后面等于没放
    expect(guard).toBeLessThan(paint.indexOf('strokeEntity(entry'));
  });

  it('实心填充按解析端给的规则填，遮罩仍按奇偶', () => {
    const fill = viewer.slice(viewer.indexOf('const fillEntity'), viewer.indexOf('const strokeEntity'));
    expect(fill).toContain("ctx.fill(fill.rule === 'nonzero' ? 'nonzero' : 'evenodd')");
    const mask = fill.slice(fill.indexOf("if (fill.kind === 'mask')"), fill.indexOf('} else {'));
    expect(mask).toContain("ctx.fill('evenodd')");
  });

  it('文字用图纸字体，字号仍取图纸高度', () => {
    // 锚点必须切在 drawTexts 本体上：之前写的 'const drawLinks' 早就不在源码里了，
    // indexOf 返回 -1，slice 一路切到文件末尾，等于在拿整个后半段当 drawTexts 扫
    const start = viewer.indexOf('const drawTexts');
    const end = viewer.indexOf('const baseStale');
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const draw = viewer.slice(start, end);
    expect(draw).toContain('fontFamilyOf(geometry.font)');
    // 不再写死通用族
    expect(draw).not.toContain('system-ui');
    // 字号还是几何自带的高度乘缩放，没被字体改动带偏
    expect(draw).toContain('geometry.height * camera.scale * unit');
  });
});

/**
 * 分册 29：填充不描边、宽线转角接头、控制码解码、图纸声明范围与取景。
 *
 * 数值实测自 `/Users/mochunhui/Git/2D.dwg` 与 `/Users/mochunhui/Git/大堂平面图.dwg`，
 * 两份图纸都不进仓库，所以这里断言的是链上那几个纯函数的行为，输入按实测数值构造。
 * 测量结果写在 `docs/0.22.0/29-req-dwg-hatch-stroke-miter-controlcodes-and-extent.md` §2。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { decodeControlCodes, dwgFiniteBounds, dwgLayoutExtent, widePolylineLoops } from '../src/shared/dwgSource';
import { densestCluster, isHatch, modelViewport, viewViewport } from '../src/viewer/dwgGeometry';
import type { DwgEntity, DwgView, DwgViewport } from '@webskill/sdk/agent';

const IDENTITY = [1, 0, 0, 1, 0, 0] as const;

/** 需求里写死的斜接上限；测试独立持有，改实现不会连带改判据 */
const MITRE_LIMIT = 4;
/** FR-29.5 的簇采纳阈值 */
const CLUSTER_SHRINK = 10;

type Loop = readonly { readonly x: number; readonly y: number }[];

/** 与分册 28 同一个射线穿越判定：奇偶看穿越次数，非零看带方向的绕数 */
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

function signedArea(loop: Loop): number {
  let twice = 0;
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i]!;
    const b = loop[(i + 1) % loop.length]!;
    twice += a.x * b.y - b.x * a.y;
  }
  return twice / 2;
}

const rect = (x1: number, y1: number, x2: number, y2: number): Loop => [
  { x: x1, y: y1 },
  { x: x2, y: y1 },
  { x: x2, y: y2 },
  { x: x1, y: y2 }
];

describe('T-29-A 宽多段线的转角接头（AC-29.4 ~ AC-29.6）', () => {
  // 实测 2D2 的穿梁套管红框：外框 24 px、环带 8~9 px。这里按 100×100、线宽 10 复现
  const square = [
    { point: { x: 0, y: 0 }, startWidth: 10, endWidth: 10, bulge: 0 },
    { point: { x: 100, y: 0 }, startWidth: 10, endWidth: 10, bulge: 0 },
    { point: { x: 100, y: 100 }, startWidth: 10, endWidth: 10, bulge: 0 },
    { point: { x: 0, y: 100 }, startWidth: 10, endWidth: 10, bulge: 0 }
  ];
  const loops = widePolylineLoops(square, true, IDENTITY) as readonly Loop[];

  /**
   * 四段带面自己的覆盖范围，由几何直接写死，不经被测代码。
   *
   * 有它才谈得上「补接头」有没有意义：同一个点在这四块里没有、在 `loops` 里有，
   * 两个结论不同，这条测试才对实现敏感。
   */
  const segmentsOnly: readonly Loop[] = [
    rect(0, -5, 100, 5),
    rect(95, 0, 105, 100),
    rect(0, 95, 100, 105),
    rect(-5, 0, 5, 100)
  ];

  it('四个外角在没有接头时是空的——缺口确实存在', () => {
    for (const [x, y] of [
      [102.5, -2.5],
      [102.5, 102.5],
      [-2.5, 102.5],
      [-2.5, -2.5]
    ] as const) {
      const at = inside(segmentsOnly, x, y);
      expect(at.nonzero).toBe(false);
      expect(at.evenodd).toBe(false);
    }
  });

  it('补上接头之后四个外角都被填（AC-29.4）', () => {
    // 四段带面 + 四个接头
    expect(loops).toHaveLength(8);
    for (const [x, y] of [
      [102.5, -2.5],
      [102.5, 102.5],
      [-2.5, 102.5],
      [-2.5, -2.5]
    ] as const) {
      const at = inside(loops, x, y);
      expect(at.nonzero).toBe(true);
    }
  });

  it('接头只补外侧，内侧不再多画一块', () => {
    // 内角 (95,5) 附近本来就被两段带面重叠覆盖，接头不该再往这边扩
    const joints = loops.filter((loop) => !segmentsOnly.some((s) => sameBox(s, loop)));
    expect(joints).toHaveLength(4);
    for (const joint of joints) {
      // 每个接头都贴在某个角上，且不越过中线
      const xs = joint.map((p) => p.x);
      const ys = joint.map((p) => p.y);
      const hugsCorner =
        (Math.max(...xs) <= 5.000001 || Math.min(...xs) >= 94.999999) &&
        (Math.max(...ys) <= 5.000001 || Math.min(...ys) >= 94.999999);
      expect(hugsCorner).toBe(true);
    }
  });

  it('带面本身与中空区域的判定不受接头影响', () => {
    expect(inside(loops, 50, -3).nonzero).toBe(true);
    expect(inside(loops, 50, 50).nonzero).toBe(false);
    // 画面外的点不能因为接头被误填
    expect(inside(loops, 130, -30).nonzero).toBe(false);
  });

  it('近 180° 折返时接头退化成斜切，不长出尖刺（AC-29.5）', () => {
    const hairpin = [
      { point: { x: 0, y: 0 }, startWidth: 10, endWidth: 10, bulge: 0 },
      { point: { x: 100, y: 0 }, startWidth: 10, endWidth: 10, bulge: 0 },
      { point: { x: 0, y: 1 }, startWidth: 10, endWidth: 10, bulge: 0 }
    ];
    const sharp = widePolylineLoops(hairpin, false, IDENTITY) as readonly Loop[];
    // 两段带面 + 一个接头
    expect(sharp).toHaveLength(3);
    const joint = sharp[2]!;
    // 斜接点跑到 x≈1100，远超上限，所以退化成三点斜切
    expect(joint).toHaveLength(3);
    for (const p of joint) {
      expect(Math.hypot(p.x - 100, p.y - 0)).toBeLessThanOrEqual(MITRE_LIMIT * 5);
    }
  });

  it('直角转角的斜接点在上限之内，走的是四点斜接', () => {
    const joints = loops.filter((loop) => !segmentsOnly.some((s) => sameBox(s, loop)));
    for (const joint of joints) expect(joint).toHaveLength(4);
  });

  it('共线处不补接头，免得白画', () => {
    const straight = [
      { point: { x: 0, y: 0 }, startWidth: 10, endWidth: 10, bulge: 0 },
      { point: { x: 50, y: 0 }, startWidth: 10, endWidth: 10, bulge: 0 },
      { point: { x: 100, y: 0 }, startWidth: 10, endWidth: 10, bulge: 0 }
    ];
    expect(widePolylineLoops(straight, false, IDENTITY)).toHaveLength(2);
  });

  it('所有环绕向一致，镜像变换之后也一致（AC-29.6）', () => {
    for (const loop of loops) expect(signedArea(loop)).toBeGreaterThan(0);
    // x 轴镜像：绕向若不在变换之后统一，这里会全部翻成负数
    const mirrored = widePolylineLoops(square, true, [-1, 0, 0, 1, 0, 0]) as readonly Loop[];
    expect(mirrored).toHaveLength(8);
    for (const loop of mirrored) expect(signedArea(loop)).toBeGreaterThan(0);
  });

  it('零宽度的段不产生带面，也不产生接头', () => {
    const mixed = [
      { point: { x: 0, y: 0 }, startWidth: 10, endWidth: 10, bulge: 0 },
      { point: { x: 100, y: 0 }, startWidth: 0, endWidth: 0, bulge: 0 },
      { point: { x: 100, y: 100 }, startWidth: 10, endWidth: 10, bulge: 0 }
    ];
    // 中间那段没宽度，两段带面被断开，断口处不该出现接头
    expect(widePolylineLoops(mixed, false, IDENTITY)).toHaveLength(1);
  });
});

/** 两个环是否覆盖同一个轴对齐矩形（顶点顺序、起点可以不同） */
function sameBox(a: Loop, b: Loop): boolean {
  if (a.length !== 4 || b.length !== 4) return false;
  const box = (loop: Loop) => [
    Math.min(...loop.map((p) => p.x)),
    Math.min(...loop.map((p) => p.y)),
    Math.max(...loop.map((p) => p.x)),
    Math.max(...loop.map((p) => p.y))
  ];
  const [a1, a2, a3, a4] = box(a);
  const [b1, b2, b3, b4] = box(b);
  return (
    Math.abs(a1! - b1!) < 1e-9 && Math.abs(a2! - b2!) < 1e-9 && Math.abs(a3! - b3!) < 1e-9 && Math.abs(a4! - b4!) < 1e-9
  );
}

describe('T-29-B 控制码解码（AC-29.7）', () => {
  it('直径、度、正负、百分号各自解码', () => {
    // 实测大堂平面图：%%C 出现 34 次、%%P 8 次、%%% 1 次
    expect(decodeControlCodes('穿梁（墙）套管%%C110')).toBe('穿梁（墙）套管⌀110');
    expect(decodeControlCodes('%%P0.000')).toBe('±0.000');
    expect(decodeControlCodes('45%%D')).toBe('45°');
    expect(decodeControlCodes('90%%%')).toBe('90%');
  });

  it('大小写不敏感', () => {
    expect(decodeControlCodes('%%c1 %%d2 %%p3')).toBe('⌀1 °2 ±3');
  });

  it('划线开关被剥掉（本版不画划线）', () => {
    expect(decodeControlCodes('%%u下划%%u %%o上划%%o')).toBe('下划 上划');
  });

  it('三位十进制码位按码位取字符', () => {
    expect(decodeControlCodes('%%176')).toBe('°');
    expect(decodeControlCodes('%%065%%066')).toBe('AB');
  });

  it('认不出来的原样留着，不吞字符', () => {
    expect(decodeControlCodes('%%Z')).toBe('%%Z');
    expect(decodeControlCodes('100% 完成')).toBe('100% 完成');
    expect(decodeControlCodes('')).toBe('');
  });

  it('整串被解成空串时保留原文（与 stripFormatCodes 同约定）', () => {
    expect(decodeControlCodes('%%u')).toBe('%%u');
  });

  it('不含 %% 的文本原样返回，不白跑一趟正则', () => {
    const plain = '一层界面划分图 ID1.0';
    expect(decodeControlCodes(plain)).toBe(plain);
  });
});

describe('T-29-C 图纸声明的范围（AC-29.8 / AC-29.9）', () => {
  it('plotType 为窗口时取窗口四角——大堂平面图 Layout1 是 841×594', () => {
    const box = dwgLayoutExtent({
      plotType: 4,
      windowLowerLeftX: -5585.840128196403,
      windowLowerLeftY: -6551.088804489935,
      windowUpperLeftX: -4744.840128196402,
      windowUpperLeftY: -5957.088804489935
    });
    expect(box).toBeDefined();
    expect(box!.maxX - box!.minX).toBeCloseTo(841, 6);
    expect(box!.maxY - box!.minY).toBeCloseTo(594, 6);
  });

  it('2D.dwg 五张图纸的窗口相同，且等于 full bleed A3 的 420×297', () => {
    const box = dwgLayoutExtent({
      plotType: 4,
      windowLowerLeftX: 931.4166186219929,
      windowLowerLeftY: 3.6272366846095565,
      windowUpperLeftX: 1352.4640455325832,
      windowUpperLeftY: 301.6746635952037
    });
    expect(box).toBeDefined();
    expect(box!.maxX - box!.minX).toBeCloseTo(421.04742691059027, 9);
    expect(box!.maxY - box!.minY).toBeCloseTo(298.04742691059414, 9);
    // 与纸面 420×297 只差一圈出血，宽高比 1.413
    expect((box!.maxX - box!.minX) / (box!.maxY - box!.minY)).toBeCloseTo(1.4127, 3);
  });

  it('不是窗口的 plotType 不声明范围', () => {
    // 模型空间那条是 0（图形界限），窗口字段全是 0
    for (const plotType of [0, 1, 2, 3, 5, undefined]) {
      expect(
        dwgLayoutExtent({
          plotType,
          windowLowerLeftX: 0,
          windowLowerLeftY: 0,
          windowUpperLeftX: 100,
          windowUpperLeftY: 100
        })
      ).toBeUndefined();
    }
  });

  it('数值非有限或宽高退化为 0 时不声明范围', () => {
    expect(dwgFiniteBounds(0, 0, Number.NaN, 10)).toBeUndefined();
    expect(dwgFiniteBounds(0, 0, Number.POSITIVE_INFINITY, 10)).toBeUndefined();
    expect(dwgFiniteBounds(5, 0, 5, 10)).toBeUndefined();
    expect(dwgFiniteBounds(0, 7, 10, 7)).toBeUndefined();
    expect(dwgFiniteBounds('0', 0, 10, 10)).toBeUndefined();
  });

  it('四角顺序颠倒也能凑成盒——字段名叫 UpperLeft，装的其实是右上角', () => {
    expect(dwgFiniteBounds(10, 10, 0, 0)).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 10 });
  });

  it('模型空间取图纸头的 EXTMIN / EXTMAX 两维（AC-29.9）', () => {
    // 实测大堂平面图的图纸头
    expect(dwgFiniteBounds(-1472821.8185100185, -1085304906.5, 791058399, 365927.0834272068)).toEqual({
      minX: -1472821.8185100185,
      minY: -1085304906.5,
      maxX: 791058399,
      maxY: 365927.0834272068
    });
  });
});

describe('T-29-D 最大密集簇（AC-29.13）', () => {
  /**
   * 一团 cols×cols 的规则点阵。
   *
   * 列数要和网格同级（64）：网格是按**当前点集的跨度**切的，
   * 这团点自己就是全部内容时，列距不到一格才连得起来。
   */
  const blob = (cx: number, cy: number, cols: number, step: number) => {
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i < cols * cols; i++) {
      xs.push(cx + (i % cols) * step);
      ys.push(cy + Math.floor(i / cols) * step);
    }
    return { xs, ys };
  };

  it('同一组点两次计算结果相同', () => {
    const { xs, ys } = blob(0, 0, 64, 10);
    expect(densestCluster(xs, ys)).toEqual(densestCluster(xs, ys));
  });

  it('只有一个连通分量时等于不聚类', () => {
    const { xs, ys } = blob(0, 0, 64, 10);
    expect(densestCluster(xs, ys)).toHaveLength(4096);
  });

  it('两团离得远时只留点多的那团', () => {
    const near = blob(0, 0, 64, 10);
    const far = blob(1e9, -1e9, 10, 10);
    const xs = [...near.xs, ...far.xs];
    const ys = [...near.ys, ...far.ys];
    const picked = densestCluster(xs, ys);
    expect(picked).toHaveLength(4096);
    for (const i of picked) expect(xs[i]!).toBeLessThan(1e8);
  });

  it('格子挨着的两团算同一簇', () => {
    // 总跨度 6420 → 每格 100.3。A 到 格 6、B 从格 7 开始，挨着
    const a = blob(0, 0, 64, 10);
    const b = blob(800, 0, 64, 10);
    const away = blob(6400, 6400, 3, 10);
    const xs = [...a.xs, ...b.xs, ...away.xs];
    const ys = [...a.ys, ...b.ys, ...away.ys];
    expect(densestCluster(xs, ys)).toHaveLength(8192);
  });

  it('中间隔着空格就分开——连通判据不是把什么都连起来', () => {
    // 同样的总跨度，B 改从格 14 开始，中间 7 格是空的
    const a = blob(0, 0, 64, 10);
    const b = blob(1500, 0, 40, 10);
    const away = blob(6400, 6400, 3, 10);
    const xs = [...a.xs, ...b.xs, ...away.xs];
    const ys = [...a.ys, ...b.ys, ...away.ys];
    expect(densestCluster(xs, ys)).toHaveLength(4096);
  });

  it('点数或跨度退化时不聚类，原样奉还', () => {
    expect(densestCluster([], [])).toEqual([]);
    expect(densestCluster([5], [5])).toEqual([0]);
    expect(densestCluster([5, 5, 5], [5, 5, 5])).toHaveLength(3);
  });
});

describe('T-29-E 取景（AC-29.10 ~ AC-29.12 / AC-29.14）', () => {
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
        handle: `${x}:${y}`,
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
      old: false
    }) as unknown as Parameters<typeof viewViewport>[1][number];

  type FramedView = Parameters<typeof viewViewport>[0];
  type Drawn = Parameters<typeof viewViewport>[1][number];

  /**
   * 一团 64×64 的点，跨度 631（含每段末点的 +1）。
   *
   * 列数要和网格同级：这团点在夹完之后可能就是全部内容，
   * 那时网格按它自己的跨度切，列距不到一格才连得起来。
   */
  const dense = (x0: number, y0: number, step = 10): Drawn[] => {
    const out: Drawn[] = [];
    for (let i = 0; i < 64 * 64; i++) out.push(drawnAt(x0 + (i % 64) * step, y0 + Math.floor(i / 64) * step));
    return out;
  };
  const DENSE_SPAN = 631;

  it('图纸空间有声明范围时用它，不用视口并集（AC-29.10 / AC-29.11）', () => {
    // 实测 2D.dwg P-08：视口并集横到 x=2390.76，而纸的右边界在 1352.46
    const view = {
      kind: 'layout',
      viewports: [viewport(1140, 36, 344, 516), viewport(1679, 36, 1423, 515)],
      extent: { minX: 931.4166186219929, minY: 3.6272366846095565, maxX: 1352.4640455325832, maxY: 301.6746635952037 }
    } as unknown as FramedView;
    const box = viewViewport(view, [drawnAt(1000, 100), drawnAt(2671, 298)]);
    expect(box.maxX).toBeCloseTo(1352.4640455325832, 9);
    expect(box.maxX - box.minX).toBeCloseTo(421.04742691059027, 9);
    expect(box.maxY - box.minY).toBeCloseTo(298.04742691059414, 9);
  });

  it('图纸空间没有声明范围时仍走视口并集（分册 27 的兜底支）', () => {
    const view = {
      kind: 'layout',
      viewports: [viewport(100, 100, 40, 40), viewport(300, 100, 40, 40)]
    } as unknown as FramedView;
    const box = viewViewport(view, []);
    expect(box.minX).toBeCloseTo(80, 6);
    expect(box.maxX).toBeCloseTo(320, 6);
  });

  it('模型空间先按声明范围夹一刀，范围外的点撑不开取景（AC-29.12）', () => {
    // 实测大堂平面图：1311 个 ATTRIB 的原始插入点在 −3.6e10
    const drawn = [...dense(0, 0), drawnAt(-36297506670, -35576217725)];
    const box = modelViewport({ extent: { minX: -1e6, minY: -1e6, maxX: 1e6, maxY: 1e6 } }, drawn);
    expect(box.minX).toBeCloseTo(0, 6);
    expect(box.maxX).toBeCloseTo(DENSE_SPAN, 6);
    expect(box.maxY).toBeCloseTo(DENSE_SPAN, 6);
  });

  it('簇把跨度压掉不足 10 倍时用夹完的盒——2D.dwg 那支（AC-29.14）', () => {
    // 密的一团点最多，但它只比夹完的盒小 2.5 倍，稀疏的图签与详图本来就该在画面里
    const sparse: Drawn[] = [];
    for (let i = 0; i < 44; i++) sparse.push(drawnAt(800 + i * 18.6, 800 + i * 18.6));
    const box = modelViewport({ extent: { minX: -1e5, minY: -1e5, maxX: 1e5, maxY: 1e5 } }, [
      ...dense(0, 0),
      ...sparse
    ]);
    // 稀疏的那一串没被丢掉
    expect(box.maxX).toBeCloseTo(800 + 43 * 18.6 + 1, 6);
    expect(box.maxX / DENSE_SPAN).toBeLessThan(CLUSTER_SHRINK);
  });

  it('簇把跨度压掉 10 倍以上时用簇——大堂平面图那支（AC-29.14）', () => {
    // 远处那簇在声明范围之内，夹刀拦不住它，只有聚类能
    const far: Drawn[] = [];
    for (let i = 0; i < 300; i++) far.push(drawnAt(7.9e8 + (i % 20) * 500, -1.08e9 + Math.floor(i / 20) * 500));
    const box = modelViewport({ extent: { minX: -1.5e6, minY: -1.1e9, maxX: 7.92e8, maxY: 4e5 } }, [
      ...dense(0, 0),
      ...far
    ]);
    expect(box.maxX).toBeLessThan(1e7);
    expect(box.minY).toBeGreaterThan(-1e7);
    expect(box.maxX - box.minX).toBeCloseTo(DENSE_SPAN, 6);
  });

  it('两条分支给出不同结果，阈值才有意义（AC-29.14）', () => {
    const near = modelViewport({ extent: { minX: -1e4, minY: -1e4, maxX: 1e4, maxY: 1e4 } }, [
      ...dense(0, 0),
      drawnAt(2000, 2000)
    ]);
    const far = modelViewport({ extent: { minX: -1e7, minY: -1e7, maxX: 1e7, maxY: 1e7 } }, [
      ...dense(0, 0),
      drawnAt(1e6, 1e6)
    ]);
    // 近的那个离群点只把跨度撑到 3.2 倍，留着；远的撑到 1585 倍，丢掉
    expect(near.maxX).toBeCloseTo(2001, 6);
    expect(far.maxX).toBeCloseTo(DENSE_SPAN, 6);
  });

  it('模型空间没有声明范围时走分位裁剪，行为不变（AC-27.13 的保留支）', () => {
    const box = modelViewport({}, [drawnAt(0, 0), drawnAt(100, 100)]);
    expect(box.minX).toBeCloseTo(0, 6);
    expect(box.maxX).toBeCloseTo(101, 6);
  });

  it('夹完一个点都不剩时不返回空框', () => {
    const box = modelViewport({ extent: { minX: 1e9, minY: 1e9, maxX: 2e9, maxY: 2e9 } }, [
      drawnAt(0, 0),
      drawnAt(10, 10)
    ]);
    expect(box.maxX).toBeGreaterThan(box.minX);
    expect(box.maxY).toBeGreaterThan(box.minY);
    expect(box.maxX).toBeLessThan(1e9);
  });

  it('声明范围只夹住一个点时也不返回零尺寸的框', () => {
    const box = modelViewport({ extent: { minX: -0.5, minY: -0.5, maxX: 0.5, maxY: 0.5 } }, [
      drawnAt(0, 0),
      drawnAt(500, 500)
    ]);
    expect(box.maxX - box.minX).toBeGreaterThan(0);
    expect(box.maxY - box.minY).toBeGreaterThan(0);
  });
});

describe('T-29-F 护栏：填充不描边（AC-29.1 ~ AC-29.3）', () => {
  const viewer = readFileSync(resolve(import.meta.dirname, '../src/viewer/viewerDwg.ts'), 'utf8');

  const hatch = { handle: '1', kind: 'HATCH', layer: 'S-WC_HATCH' } as unknown as DwgEntity;

  it('isHatch 认的是实体类型，大小写不敏感', () => {
    expect(isHatch(hatch)).toBe(true);
    expect(isHatch({ handle: '2', kind: 'hatch', layer: '0' } as unknown as DwgEntity)).toBe(true);
    expect(isHatch({ handle: '3', kind: 'LWPOLYLINE', layer: '0' } as unknown as DwgEntity)).toBe(false);
    expect(isHatch({ handle: '4', kind: 'WIPEOUT', layer: '0' } as unknown as DwgEntity)).toBe(false);
  });

  it('二维绘制在填充上提前返回，走不到描边（AC-29.1）', () => {
    // 只看 paintEntity 这一段：画布上别处也有 ctx.stroke()（量测叠层），
    // 拿全文件的第一处当锚点会把这条护栏变成「谁先出现」的运气题
    const body = viewer.slice(viewer.indexOf('const paintEntity ='), viewer.indexOf('const dashPattern ='));
    expect(body).toMatch(/if \(isHatch\(item\.entity\)\) return;/);
    // 提前返回必须在调描边之前，否则拦不住
    const guard = body.indexOf('if (isHatch(item.entity)) return;');
    expect(guard).toBeGreaterThan(0);
    expect(guard).toBeLessThan(body.indexOf('strokeEntity('));
    // 描边确实发生在 strokeEntity 里，上面那个锚点才有意义
    expect(viewer.slice(viewer.indexOf('const strokeEntity ='))).toContain('ctx.stroke()');
  });

  it('边界环仍然入库，只是不画（AC-29.2 / 分册 28 AC-28.5 的修订）', () => {
    const source = readFileSync(resolve(import.meta.dirname, '../src/shared/dwgSource.ts'), 'utf8');
    // Hatch 分支照旧把边界环 push 成闭合 polyline，FR-29.1 只改绘制
    expect(source).toMatch(/kind: 'polyline'[\s\S]{0,80}closed: true/);
  });
});

describe('T-29-G 契约：DwgView.extent（AC-29.8 / AC-29.9）', () => {
  it('extent 是可选的，不设时类型照样成立', () => {
    const view: Pick<DwgView, 'id' | 'name' | 'kind' | 'bounds' | 'extent'> = {
      id: 'Model',
      name: 'Model',
      kind: 'model',
      bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 }
    };
    expect(view.extent).toBeUndefined();
  });

  it('extent 与 bounds 并存，两者不是一回事', () => {
    // 实测大堂平面图的模型视图：量出来的盒 4.79e10，声明的范围 7.93e8，差 60 倍
    const view: Pick<DwgView, 'bounds' | 'extent'> = {
      bounds: { minX: -47050782664.5, minY: -18889697209.35, maxX: 810159626.59, maxY: 2037798.61 },
      extent: { minX: -1472821.8185100185, minY: -1085304906.5, maxX: 791058399, maxY: 365927.0834272068 }
    };
    const measured = view.bounds.maxX - view.bounds.minX;
    const declared = view.extent!.maxX - view.extent!.minX;
    expect(measured / declared).toBeGreaterThan(50);
  });
});

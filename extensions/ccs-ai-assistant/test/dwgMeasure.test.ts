/**
 * 量测内核（0.22.0 分册 31，AC-31.9 ~ AC-31.20）。
 *
 * 主证据是**图纸自己的标注**：AutoCAD 已经把长度和角度算好写在文件里了，
 * 拿它当标尺比任何自造的期望值都硬。夹具由 `scripts/makeDwgMeasureFixture.ts` 从
 * 三份真实图纸切出，口径见需求文档 §2.3.1。
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { viewerWindowTitle } from '../src/shared/dwgHost';
import {
  IDLE_MEASURE_STATE,
  MEASURE_COLORS,
  angleBetween,
  formatArea,
  formatLength,
  hitMeasurement,
  livePreview,
  measureAbort,
  measureClear,
  measureClick,
  measureCommit,
  measureDropTail,
  measureScale,
  measureSelect,
  measurementLabel,
  polygonArea,
  polygonPerimeter,
  polylineLength,
  viewportAt
} from '../src/viewer/dwgMeasure';
import type { Measurement, MeasureState, MeasureText } from '../src/viewer/dwgMeasure';
import type { DwgViewport } from '@webskill/sdk/agent';
import fixture from './fixtures/dwgMeasure.json' with { type: 'json' };

const zh = (units: MeasureText['units'], decimals = 2): MeasureText => ({ lang: 'zh', units, decimals });
const en = (units: MeasureText['units'], decimals = 2): MeasureText => ({ lang: 'en', units, decimals });

const viewport = (over: Partial<DwgViewport> = {}): DwgViewport => ({
  center: { x: 0, y: 0 },
  width: 100,
  height: 100,
  viewCenter: { x: 0, y: 0 },
  viewHeight: 100,
  twistAngle: 0,
  frozenLayers: [],
  ...over
});

describe('量测：图纸自己的标注当标尺', () => {
  it('AC-31.9 383 条对齐标注的两点距离与 AutoCAD 的 measurement 相对误差 ≤ 1e-9', () => {
    expect(fixture.aligned.length).toBeGreaterThanOrEqual(300);
    let worst = 0;
    for (const sample of fixture.aligned) {
      const computed = polylineLength([
        [sample.a[0]!, sample.a[1]!],
        [sample.b[0]!, sample.b[1]!]
      ]);
      worst = Math.max(worst, Math.abs(computed - sample.measurement) / sample.measurement);
    }
    expect(worst).toBeLessThanOrEqual(1e-9);
  });

  it('AC-31.18 24 条三点角度标注与 AutoCAD 的 measurement（弧度）绝对误差 ≤ 1e-6 度', () => {
    expect(fixture.angular.length).toBeGreaterThanOrEqual(20);
    let worst = 0;
    for (const sample of fixture.angular) {
      const degrees = angleBetween(
        [sample.a[0]!, sample.a[1]!],
        [sample.vertex[0]!, sample.vertex[1]!],
        [sample.b[0]!, sample.b[1]!]
      );
      expect(degrees).toBeDefined();
      worst = Math.max(worst, Math.abs(degrees! - (sample.measurement * 180) / Math.PI));
    }
    expect(worst).toBeLessThanOrEqual(1e-6);
  });
});

describe('量测：几何', () => {
  const square = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10]
  ] as const;

  it('AC-31.11 面积与绕向无关', () => {
    expect(polygonArea(square)).toBeCloseTo(100, 12);
    expect(polygonArea([...square].reverse())).toBeCloseTo(100, 12);
  });

  it('周长把收尾那一段算进去', () => {
    // 折线长只有三条边 30，闭合后是 40
    expect(polylineLength(square)).toBeCloseTo(30, 12);
    expect(polygonPerimeter(square)).toBeCloseTo(40, 12);
  });

  it('AC-31.18 共线三点是 180°，重合点没有读数', () => {
    expect(angleBetween([-1, 0], [0, 0], [1, 0])).toBeCloseTo(180, 9);
    expect(angleBetween([0, 1], [0, 0], [1, 0])).toBeCloseTo(90, 9);
    expect(angleBetween([0, 0], [0, 0], [1, 0])).toBeUndefined();
  });

  it('点不够时不给读数', () => {
    expect(
      measurementLabel({ kind: 'distance', points: [[0, 0]] }, { space: 'model', factor: 1 }, zh('mm'))
    ).toBeUndefined();
    expect(
      measurementLabel(
        {
          kind: 'area',
          points: [
            [0, 0],
            [1, 1]
          ]
        },
        { space: 'model', factor: 1 },
        zh('mm')
      )
    ).toBeUndefined();
  });
});

describe('量测：单位', () => {
  const scale = { space: 'model', factor: 1 } as const;

  it('AC-31.12 insUnits 为 4（mm）时读数带 mm', () => {
    expect(formatLength(6000, scale, zh('mm'))).toBe('6 000.00 mm');
  });

  it('AC-31.12 单位缺席时说「单位 / units」，不出现 mm', () => {
    const missing = formatLength(6000, scale, zh(undefined));
    expect(missing).toBe('6 000.00 单位');
    expect(missing).not.toContain('mm');
    expect(formatLength(6000, scale, en('unitless'))).toBe('6 000.00 units');
  });

  it('AC-31.20 小数位改了，同一条量测的读数跟着变', () => {
    const points = [
      [0, 0],
      [3, 4]
    ] as const;
    const measurement = { kind: 'distance', points } as const;
    expect(measurementLabel(measurement, scale, zh('m', 2))).toBe('5.00 m');
    expect(measurementLabel(measurement, scale, zh('m', 0))).toBe('5 m');
    expect(measurementLabel(measurement, scale, zh('m', 4))).toBe('5.0000 m');
  });

  it('面积带平方号，且按系数的平方换算', () => {
    expect(formatArea(4, { space: 'model', factor: 10, ratio: 10 }, en('mm', 0))).toBe('400 mm²');
  });
});

describe('量测：图纸空间的出图比例', () => {
  const vp = viewport({ center: { x: 100, y: 100 }, width: 200, height: 100, viewHeight: 20000 });

  it('模型空间不换算', () => {
    expect(measureScale('model', [vp], [[0, 0]])).toEqual({ space: 'model', factor: 1 });
  });

  it('AC-31.13 同一个视口内按 1:200 换回模型尺寸', () => {
    const scale = measureScale(
      'layout',
      [vp],
      [
        [60, 80],
        [90, 120]
      ]
    );
    expect(scale).toEqual({ space: 'model', factor: 200, ratio: 200 });
    // 纸面 30 mm 在 1:200 的视口里是 6000 mm——正是这个 200 倍的坑（§2.4）。
    // 换算依据不再写进读数（分册 33），但换算本身要真发生
    expect(formatLength(30, scale, zh('mm', 0))).toBe('6 000 mm');
  });

  it('AC-31.13 跨视口或落在视口外时如实标成纸面尺寸', () => {
    const other = viewport({ center: { x: 500, y: 100 }, width: 100, height: 100, viewHeight: 5000 });
    const across = measureScale(
      'layout',
      [vp, other],
      [
        [60, 80],
        [500, 100]
      ]
    );
    expect(across).toEqual({ space: 'paper', factor: 1 });
    expect(formatLength(30, across, zh('mm', 0))).toBe('30 纸面单位');
    expect(measureScale('layout', [vp], [[900, 900]])).toEqual({ space: 'paper', factor: 1 });
  });

  it('viewHeight 为 0 的视口不参与换算，免得算出 Infinity', () => {
    const broken = viewport({ viewHeight: 0 });
    expect(measureScale('layout', [broken], [[0, 0]])).toEqual({ space: 'paper', factor: 1 });
  });
});

describe('量测：拾取', () => {
  const toScreen = (x: number, y: number): readonly [number, number] => [x, y];
  const list = [
    {
      kind: 'distance',
      points: [
        [0, 0],
        [100, 0]
      ]
    },
    { kind: 'point', points: [[500, 500]] }
  ] as const;

  it('AC-31.17 只命中被点中的那一条', () => {
    expect(hitMeasurement(list, toScreen, 50, 3, 8)).toBe(0);
    expect(hitMeasurement(list, toScreen, 502, 500, 8)).toBe(1);
  });

  it('离得太远时谁都不选', () => {
    expect(hitMeasurement(list, toScreen, 50, 40, 8)).toBe(-1);
  });

  it('区域的收尾边也能点中：闭合那条边不是画上去的假线', () => {
    const area = [
      {
        kind: 'area',
        points: [
          [0, 0],
          [100, 0],
          [100, 100]
        ]
      }
    ] as const;
    // (50, 50) 落在从 (100,100) 回到 (0,0) 的那条闭合边上
    expect(hitMeasurement(area, toScreen, 50, 50, 2)).toBe(0);
  });
});

describe('量测：取色', () => {
  it('量测线与图纸内容不共用一套颜色', () => {
    expect(new Set(Object.values(MEASURE_COLORS)).size).toBe(Object.keys(MEASURE_COLORS).length);
  });
});

describe('量测：视口命中', () => {
  it('边界上算命中，外面不算', () => {
    const vp = viewport({ center: { x: 0, y: 0 }, width: 10, height: 10 });
    expect(viewportAt([vp], 5, 5)).toBe(vp);
    expect(viewportAt([vp], 5.001, 0)).toBeUndefined();
  });
});

describe('量测：状态机', () => {
  const at = (x: number, y: number): readonly [number, number] => [x, y];
  const never = (): number => {
    throw new Error('pick must not be called outside erase mode');
  };

  it('AC-31.14 没选工具时点画布原样返回同一个状态对象', () => {
    const next = measureClick(IDLE_MEASURE_STATE, at(1, 2), never);
    expect(next).toBe(IDLE_MEASURE_STATE);
    expect(next.measurements).toHaveLength(0);
    expect(next.pending).toHaveLength(0);
  });

  it('FR-31.7 距离点满两个点自动收尾', () => {
    let state = measureSelect(IDLE_MEASURE_STATE, 'distance');
    state = measureClick(state, at(0, 0), never);
    expect(state.measurements).toHaveLength(0);
    expect(state.pending).toHaveLength(1);
    state = measureClick(state, at(3, 4), never);
    expect(state.pending).toHaveLength(0);
    expect(state.measurements).toEqual([{ kind: 'distance', points: [at(0, 0), at(3, 4)] }]);
  });

  it('FR-31.9 坐标一个点就收尾', () => {
    let state = measureSelect(IDLE_MEASURE_STATE, 'point');
    state = measureClick(state, at(7, 8), never);
    expect(state.measurements).toEqual([{ kind: 'point', points: [at(7, 8)] }]);
  });

  it('FR-31.8 区域不足三点不收尾，够了才收', () => {
    let state = measureSelect(IDLE_MEASURE_STATE, 'area');
    state = measureClick(state, at(0, 0), never);
    state = measureClick(state, at(10, 0), never);
    expect(measureCommit(state)).toBe(state);
    state = measureClick(state, at(10, 10), never);
    state = measureCommit(state);
    expect(state.measurements).toHaveLength(1);
    expect(state.measurements[0]!.points).toHaveLength(3);
  });

  it('FR-31.7 Esc 只丢没量完的那一条', () => {
    let state = measureSelect(IDLE_MEASURE_STATE, 'distance');
    state = measureClick(state, at(0, 0), never);
    state = measureClick(state, at(1, 0), never);
    state = measureClick(state, at(5, 5), never);
    expect(state.pending).toHaveLength(1);
    state = measureAbort(state);
    expect(state.pending).toHaveLength(0);
    expect(state.measurements).toHaveLength(1);
    // 没有未完成的量测时，Esc 什么都不该动
    expect(measureAbort(state)).toBe(state);
  });

  it('AC-31.17 删除只去掉被点中的那一条，清除把整张表清空', () => {
    let state = measureSelect(IDLE_MEASURE_STATE, 'point');
    state = measureClick(state, at(1, 1), never);
    state = measureClick(state, at(2, 2), never);
    state = measureClick(state, at(3, 3), never);
    state = measureSelect(state, 'erase');
    state = measureClick(state, at(0, 0), () => 1);
    expect(state.measurements.map((m) => m.points[0])).toEqual([at(1, 1), at(3, 3)]);
    // 没点中任何一条时状态不动
    expect(measureClick(state, at(0, 0), () => -1)).toBe(state);
    state = measureClear(state);
    expect(state.measurements).toHaveLength(0);
    expect(measureClear(state)).toBe(state);
  });

  it('换工具会丢掉没量完的那一条，再点同一个是关掉它', () => {
    let state = measureSelect(IDLE_MEASURE_STATE, 'area');
    state = measureClick(state, at(0, 0), never);
    state = measureSelect(state, 'distance');
    expect(state.tool).toBe('distance');
    expect(state.pending).toHaveLength(0);
    expect(measureSelect(state, 'distance').tool).toBeUndefined();
  });

  it('双击收尾时把 pointerup 重复收进来的那个点去掉', () => {
    let state = measureSelect(IDLE_MEASURE_STATE, 'area');
    for (const p of [at(0, 0), at(10, 0), at(10, 10), at(0, 10), at(0, 10.0001)]) {
      state = measureClick(state, p, never);
    }
    expect(state.pending).toHaveLength(5);
    const trimmed = measureDropTail(state, 0.01);
    expect(trimmed.pending).toHaveLength(4);
    // 没有重复点时返回同一个对象
    expect(measureDropTail(trimmed, 0.01)).toBe(trimmed);
  });
});

describe('查看器标题（FR-31.4）', () => {
  /** 标题只看 `fileName`，正文用不上；给一份空图纸把类型填满即可 */
  const title = (...names: readonly (string | undefined)[]): string =>
    viewerWindowTitle({
      drawings: names.map((fileName, i) => ({
        title: `doc-${i}`,
        ...(fileName === undefined ? {} : { fileName }),
        document: {} as never
      }))
    });

  it('AC-31.5 / AC-31.6 纯文件名，无前后缀', () => {
    expect(title('大堂平面图.dwg')).toBe('大堂平面图.dwg');
  });

  it('AC-31.7 没有文件名时返回空串，外壳据此不动标题', () => {
    expect(title(undefined)).toBe('');
    expect(title('   ')).toBe('');
  });

  it('AC-31.8 控制字符被剔除，超过 120 字符被截断', () => {
    expect(title('a\u0000b\u001fc\u007f.dwg')).toBe('abc.dwg');
    expect(title(`${'长'.repeat(200)}.dwg`)).toHaveLength(120);
  });

  it('AC-35.2 两份时两个名字并排，只有一份有名字就只出那一个', () => {
    expect(title('a.dwg', 'b.dwg')).toBe('a.dwg · b.dwg');
    expect(title('a.dwg', undefined)).toBe('a.dwg');
  });
});

describe('工具栏的位置（AC-31.15）', () => {
  const source = readFileSync(resolve(import.meta.dirname, '../src/shared/dwgHost.ts'), 'utf8');

  it('工具栏是 #dwg-root 的兄弟，不在画布容器里', () => {
    // 放进 #dwg-root 就会跟着画布一起被裁剪和变换，量测一平移就飘走了
    expect(source).toMatch(/<canvas id="dwg-canvas"><\/canvas>[\s\S]*?<\/div>\$\{toolbar\}/);
    const inside = source.slice(source.indexOf('<div id="dwg-root"'), source.indexOf('</div>${toolbar}'));
    expect(inside).not.toContain('dwg-tools');
  });

  it('工具栏与设置面板都是 position: fixed', () => {
    for (const id of ['#dwg-tools', '#dwg-tools-panel']) {
      const rule = new RegExp(`\\n${id} \\{([^}]*)\\}`).exec(source)?.[1] ?? '';
      expect(rule, id).toContain('position: fixed');
    }
  });

  it('工具栏无条件出现（分册 34 撤掉三维视图后没有第二种形态）', () => {
    expect(source).toContain('const toolbar = `');
    expect(source).not.toContain('input.mode');
  });
});

// ---- 分册 32：实时读数与源码护栏 ----

describe('实时读数与落定后的读数是同一套（AC-32.12 ~ AC-32.16）', () => {
  const tool = (kind: MeasureState['tool'], pending: readonly (readonly [number, number])[]): MeasureState => ({
    tool: kind,
    measurements: [],
    pending
  });
  const text = zh('mm');
  const label = (m: Measurement): string | undefined => measurementLabel(m, measureScale('model', [], m.points), text);

  it('AC-32.12 距离：橡皮筋上的读数与两点量完后的读数逐字节相同', () => {
    const start: readonly [number, number] = [1200, 800];
    const cursor: readonly [number, number] = [4700, 3100];
    const live = livePreview(tool('distance', [start]), cursor)!;
    expect(live).toEqual({ kind: 'distance', points: [start, cursor] });
    const committed = measureCommit(tool('distance', [start, cursor]));
    expect(label(live)).toBe(label(committed.measurements[0]!));
    // 读数不是空串，否则上面那条等式是「两个 undefined 相等」
    expect(label(live)).toMatch(/\d/);
  });

  it('AC-32.13 区域：点了两个点就有面积，不必等 Enter', () => {
    const points: readonly (readonly [number, number])[] = [
      [0, 0],
      [5000, 0]
    ];
    const cursor: readonly [number, number] = [5000, 3000];
    const live = livePreview(tool('area', points), cursor)!;
    const committed = measureCommit(tool('area', [...points, cursor]));
    expect(label(live)).toBe(label(committed.measurements[0]!));
    expect(label(live)).toMatch(/\d/);
    // 只点了一个点时还围不出面，不该硬报一个 0
    expect(livePreview(tool('area', [points[0]!]), cursor)).toBeUndefined();
  });

  it('AC-32.14 角度：点了两个点后指针就是第三点', () => {
    const points: readonly (readonly [number, number])[] = [
      [1000, 0],
      [0, 0]
    ];
    const cursor: readonly [number, number] = [0, 1000];
    const live = livePreview(tool('angle', points), cursor)!;
    const committed = measureCommit(tool('angle', [...points, cursor]));
    expect(label(live)).toBe(label(committed.measurements[0]!));
    expect(label(live)).toMatch(/90/);
    expect(livePreview(tool('angle', [points[0]!]), cursor)).toBeUndefined();
  });

  it('AC-32.15 坐标：一次点击都没有也有读数', () => {
    const cursor: readonly [number, number] = [12345.6, -789.1];
    const live = livePreview(tool('point', []), cursor)!;
    expect(live).toEqual({ kind: 'point', points: [cursor] });
    expect(label(live)).toMatch(/^X .*345\.60 · Y -789\.10$/);
  });

  it('AC-32.16 工具没激活、或是删除工具时，指针移动什么都不产生', () => {
    expect(livePreview(IDLE_MEASURE_STATE, [1, 2])).toBeUndefined();
    expect(livePreview(tool('erase', []), [1, 2])).toBeUndefined();
    // 距离工具一个点都没落下时也没有橡皮筋可拉
    expect(livePreview(tool('distance', []), [1, 2])).toBeUndefined();
  });
});

describe('渲染管线的护栏（AC-32.2 / AC-32.3 / AC-32.6）', () => {
  const source = readFileSync(resolve(import.meta.dirname, '../src/viewer/viewerDwg.ts'), 'utf8');

  it('AC-32.6 描边读一次性缓存，不再逐帧离散化', () => {
    // `tessellate` 整个模块都不该再出现：它只属于建索引的那一遍（dwgScene.ts）
    expect(source).not.toContain('tessellate');
    expect(source).toContain('for (const line of entry.lines)');
  });

  it('AC-32.2 首帧与作废之后是同步重绘，不等 rAF', () => {
    // 分册 35 把底图按层拆开，代价改成几层相加；判定本身没变
    expect(source).toContain('if (cost <= AFFORDABLE_BASE_MS)');
    expect(source).toMatch(/const invalidate = \(\): void => \{\s*baseState = undefined;\s*deps\.render\(\);/);
  });

  it('AC-32.3 同一帧只合成一次，且第一次是同步的', () => {
    expect(source).toMatch(/if \(frame !== undefined\) return;/);
    expect(source).toMatch(/if \(performance\.now\(\) - lastFrameAt >= 8\) \{\s*paintFrame\(\);/);
    // 卸载时排着的那一帧要撤掉，否则会往没人看的画布上画
    expect(source).toContain('if (frame !== undefined) cancelAnimationFrame(frame);');
    expect(source).toContain('if (settleTimer !== undefined) clearTimeout(settleTimer);');
  });

  it('AC-32.3 实体画进底图、量测画在叠层，两者不混', () => {
    const composite = source.slice(source.indexOf('const composite = ()'), source.indexOf('let frame:'));
    // 合成这一步只贴各层已经画好的底图再叠量测，一条实体都不重画
    expect(composite).toContain('layer.composite(viewCtx)');
    expect(composite).toContain('paintOverlay(viewCtx');
    expect(composite).not.toContain('drawEntities()');
    // 底图本体是一张离屏位图，贴过来而不是重画
    expect(source).toContain('target.drawImage(baseCanvas');
  });
});

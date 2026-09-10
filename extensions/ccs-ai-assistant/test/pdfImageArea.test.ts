import { describe, expect, it } from 'vitest';
import { imageAreaRatios, type PdfOperatorCodes } from '../src/shared/pdfImageArea';

/**
 * AC-22.19：面积占比按累计 CTM 算。
 *
 * 指令流是手写的，不经 pdfjs：要验的是矩阵的账，不是 pdfjs 会不会解析。
 * 操作码沿用 pdfjs 的真实取值，接错一位这里就会失配。
 */
const OPS: PdfOperatorCodes = {
  save: 10,
  restore: 11,
  transform: 12,
  paintFormXObjectBegin: 74,
  paintFormXObjectEnd: 75,
  paintImageXObject: 85,
  paintInlineImageXObject: 86
};

/** A4，单位 pt */
const PAGE_AREA = 595 * 842;

interface Op {
  fn: number;
  args?: unknown;
}

const listOf = (ops: readonly Op[]) => ({
  fnArray: ops.map((o) => o.fn),
  argsArray: ops.map((o) => o.args ?? null)
});

describe('imageAreaRatios', () => {
  it('单条 cm：占比就是 |ad − bc| / 页面面积', () => {
    const ratios = imageAreaRatios(
      listOf([
        { fn: OPS.save },
        { fn: OPS.transform, args: [300, 0, 0, 200, 50, 500] },
        { fn: OPS.paintImageXObject, args: ['img0'] },
        { fn: OPS.restore }
      ]),
      OPS,
      PAGE_AREA
    );
    expect(ratios).toHaveLength(1);
    expect(ratios[0]).toBeCloseTo((300 * 200) / PAGE_AREA, 10);
  });

  it('外层缩放计入：两条 cm 相乘，而不是只看最近那条', () => {
    // 外层把整个坐标系缩到一半，图实际只占 (300×0.5)×(200×0.5)
    const ratios = imageAreaRatios(
      listOf([
        { fn: OPS.transform, args: [0.5, 0, 0, 0.5, 0, 0] },
        { fn: OPS.save },
        { fn: OPS.transform, args: [300, 0, 0, 200, 0, 0] },
        { fn: OPS.paintImageXObject, args: ['img0'] },
        { fn: OPS.restore }
      ]),
      OPS,
      PAGE_AREA
    );
    expect(ratios[0]).toBeCloseTo((150 * 100) / PAGE_AREA, 10);
    // 旧实现（只回头找最近一条 transform）会得到 4 倍于此的值
    expect(ratios[0]).toBeLessThan((300 * 200) / PAGE_AREA);
  });

  it('Form XObject 自带的矩阵计入，结束时回到外层的 CTM', () => {
    const ratios = imageAreaRatios(
      listOf([
        {
          fn: OPS.paintFormXObjectBegin,
          args: [
            [0.25, 0, 0, 0.25, 0, 0],
            [0, 0, 100, 100]
          ]
        },
        { fn: OPS.transform, args: [400, 0, 0, 400, 0, 0] },
        { fn: OPS.paintImageXObject, args: ['inside'] },
        { fn: OPS.paintFormXObjectEnd },
        { fn: OPS.transform, args: [400, 0, 0, 400, 0, 0] },
        { fn: OPS.paintImageXObject, args: ['outside'] }
      ]),
      OPS,
      PAGE_AREA
    );
    expect(ratios[0]).toBeCloseTo((100 * 100) / PAGE_AREA, 10);
    expect(ratios[1]).toBeCloseTo((400 * 400) / PAGE_AREA, 10);
  });

  it('restore 之后不再带着被弹掉的那层变换', () => {
    const ratios = imageAreaRatios(
      listOf([
        { fn: OPS.save },
        { fn: OPS.transform, args: [10, 0, 0, 10, 0, 0] },
        { fn: OPS.restore },
        { fn: OPS.transform, args: [300, 0, 0, 200, 0, 0] },
        { fn: OPS.paintInlineImageXObject, args: [{}] }
      ]),
      OPS,
      PAGE_AREA
    );
    expect(ratios[0]).toBeCloseTo((300 * 200) / PAGE_AREA, 10);
  });

  it('旋转的图按行列式算面积，不因为 a/d 为 0 就漏掉', () => {
    // 90° 旋转 + 缩放：[0 300 −200 0]，|ad − bc| = 300 × 200
    const ratios = imageAreaRatios(
      listOf([
        { fn: OPS.transform, args: [0, 300, -200, 0, 0, 0] },
        { fn: OPS.paintImageXObject, args: ['rotated'] }
      ]),
      OPS,
      PAGE_AREA
    );
    expect(ratios[0]).toBeCloseTo((300 * 200) / PAGE_AREA, 10);
  });

  it('嵌套结构算出的占比不会超过 1', () => {
    const ratios = imageAreaRatios(
      listOf([
        { fn: OPS.transform, args: [0.24, 0, 0, 0.24, 0, 0] },
        { fn: OPS.save },
        {
          fn: OPS.paintFormXObjectBegin,
          args: [
            [2, 0, 0, 2, 0, 0],
            [0, 0, 100, 100]
          ]
        },
        { fn: OPS.transform, args: [595, 0, 0, 842, 0, 0] },
        { fn: OPS.paintImageXObject, args: ['img0'] },
        { fn: OPS.paintFormXObjectEnd },
        { fn: OPS.restore }
      ]),
      OPS,
      PAGE_AREA
    );
    expect(ratios[0]).toBeCloseTo(0.24 * 0.24 * 2 * 2, 10);
    expect(ratios[0]).toBeLessThanOrEqual(1);
  });

  it('面积为零的图与非法页面面积都不产出', () => {
    const degenerate = listOf([
      { fn: OPS.transform, args: [0, 0, 0, 0, 0, 0] },
      { fn: OPS.paintImageXObject, args: ['img0'] }
    ]);
    expect(imageAreaRatios(degenerate, OPS, PAGE_AREA)).toEqual([]);
    const normal = listOf([
      { fn: OPS.transform, args: [300, 0, 0, 200, 0, 0] },
      { fn: OPS.paintImageXObject, args: ['img0'] }
    ]);
    expect(imageAreaRatios(normal, OPS, 0)).toEqual([]);
    expect(imageAreaRatios(normal, OPS, Number.NaN)).toEqual([]);
  });

  it('参数不是六元数值矩阵时跳过这条变换，不让 NaN 传染', () => {
    const ratios = imageAreaRatios(
      listOf([
        { fn: OPS.transform, args: ['not', 'a', 'matrix'] },
        { fn: OPS.transform, args: [300, 0, 0, 200, 0, 0] },
        { fn: OPS.paintImageXObject, args: ['img0'] }
      ]),
      OPS,
      PAGE_AREA
    );
    expect(ratios[0]).toBeCloseTo((300 * 200) / PAGE_AREA, 10);
  });
});

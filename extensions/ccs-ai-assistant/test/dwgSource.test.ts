/**
 * DWG 解析的行为验证（0.22.0 分册 19，AC-19.5 / AC-19.6 / AC-19.9）。
 *
 * 夹具在内存里现造再写成 DWG 字节，不依赖任何本机文件：
 * `DwgWriter.writeToBuffer` → `parseDwgDocument`，走的是与扩展里完全相同的那条读路径。
 *
 * 这里钉住的每一条，都是在三份真实图纸上先踩到、再修掉的缺陷。
 */

import { describe, expect, it } from 'vitest';
import {
  BlockRecord,
  CadDocument,
  Circle,
  Color,
  DwgWriter,
  Insert,
  Layer,
  Line,
  TextEntity,
  XYZ
} from '@node-projects/acad-ts';
import { parseDwgDocument } from '../src/shared/dwgSource';

function line(x1: number, y1: number, x2: number, y2: number): Line {
  const entity = new Line();
  entity.startPoint = new XYZ(x1, y1, 0);
  entity.endPoint = new XYZ(x2, y2, 0);
  return entity;
}

/** 一个含两条线与一个圆的块，被以不同变换插入三次 */
function buildFixture(): CadDocument {
  const document = new CadDocument();

  const layer = new Layer('WALL');
  layer.color = new Color(1); // ACI 1 = 红
  document.layers!.add(layer);

  const block = new BlockRecord('UNIT');
  block.entities.add(line(0, 0, 10, 0));
  block.entities.add(line(10, 0, 10, 10));
  const circle = new Circle();
  circle.center = new XYZ(5, 5, 0);
  circle.radius = 2;
  block.entities.add(circle);
  document.blockRecords!.add(block);

  // 顶层实体：原样、不经任何块变换
  const top = line(-100, -100, -90, -100);
  top.layer = layer;
  document.entities!.add(top);

  // 三次插入同一个块：平移、旋转、非均匀缩放
  const plain = new Insert(block);
  plain.insertPoint = new XYZ(100, 0, 0);
  document.entities!.add(plain);

  const turned = new Insert(block);
  turned.insertPoint = new XYZ(0, 200, 0);
  turned.rotation = Math.PI / 2;
  document.entities!.add(turned);

  const stretched = new Insert(block);
  stretched.insertPoint = new XYZ(500, 0, 0);
  stretched.xScale = 3;
  stretched.yScale = 1;
  document.entities!.add(stretched);

  // 空文本：真实图纸里存在，且坐标是垃圾值
  const blank = new TextEntity();
  blank.value = '';
  blank.height = 59500;
  blank.insertPoint = new XYZ(9.8e6, 1.6e6, 0);
  document.entities!.add(blank);

  const labelled = new TextEntity();
  labelled.value = '客厅';
  labelled.height = 100;
  labelled.insertPoint = new XYZ(50, 50, 0);
  document.entities!.add(labelled);

  return document;
}

function parseFixture(): ReturnType<typeof parseDwgDocument> {
  return parseDwgDocument(DwgWriter.writeToBuffer(buildFixture()));
}

describe('块引用展开', () => {
  it('把块里的实体铺平到顶层，按插入次数各出一份', () => {
    const parsed = parseFixture();
    // 块里 3 个实体 × 插入 3 次 = 9，加 1 条顶层线与 1 条非空文字
    expect(parsed.entities.filter((e) => e.kind === 'LINE')).toHaveLength(1 + 2 * 3);
    expect(parsed.entities.some((e) => e.kind === 'INSERT')).toBe(false);
  });

  it('把变换烘焙进世界坐标，而不是留给投放面', () => {
    const parsed = parseFixture();
    const starts = parsed.entities
      .filter((e) => e.kind === 'LINE' && e.geometry?.kind === 'polyline')
      .map((e) => (e.geometry as { points: readonly { x: number; y: number }[] }).points[0]!);

    // 平移插入：块内 (0,0) → (100,0)
    expect(starts).toContainEqual({ x: 100, y: 0 });
    // 旋转 90°：块内 (10,0) → (0,210)
    const turned = starts.find((p) => Math.abs(p.x) < 1e-6 && Math.abs(p.y - 210) < 1e-6);
    expect(turned).toBeDefined();
    // 非均匀缩放 x3：块内 (10,0) → (530,0)
    const stretched = starts.find((p) => Math.abs(p.x - 530) < 1e-6 && Math.abs(p.y) < 1e-6);
    expect(stretched).toBeDefined();
  });

  it('给块内实体带上实例路径，句柄才唯一', () => {
    const parsed = parseFixture();
    // 块定义里的实体共用一个句柄，插入三次就会出现三个同句柄实体——
    // 句柄是 diff 的主键，重复会让匹配错乱
    const handles = new Set(parsed.entities.map((e) => e.handle));
    expect(handles.size).toBe(parsed.entities.length);
    expect(parsed.entities.some((e) => e.handle.includes('/'))).toBe(true);
  });
});

describe('块内实体的图层归属', () => {
  /** 一个块，块里一条线用「随块」的 0 层、一条线钉死在自己的图层 */
  function buildLayeredFixture(): CadDocument {
    const document = new CadDocument();

    const socket = new Layer('08插座-强电');
    socket.color = new Color(2);
    document.layers!.add(socket);

    const fixed = new Layer('WALL');
    fixed.color = new Color(1);
    document.layers!.add(fixed);

    const block = new BlockRecord('SOCKET');
    block.entities.add(line(0, 0, 10, 0)); // 未指定图层 = 0 层 = 随块
    const pinned = line(0, 5, 10, 5);
    pinned.layer = fixed;
    block.entities.add(pinned);
    document.blockRecords!.add(block);

    const placed = new Insert(block);
    placed.insertPoint = new XYZ(100, 0, 0);
    placed.layer = socket;
    document.entities!.add(placed);

    // 顶层的 0 层实体没有「块」可继承，应当原样留在 0 层
    document.entities!.add(line(-50, -50, -40, -50));

    return document;
  }

  it('块里画在 0 层的实体，继承块引用所在的图层', () => {
    const parsed = parseDwgDocument(DwgWriter.writeToBuffer(buildLayeredFixture()));
    const inherited = parsed.entities.find((e) => e.handle.includes('/') && e.geometry?.kind === 'polyline');

    // AutoCAD 的「随块」语义：块能一次定义、按图层复用，全靠这条。
    // 照字面取 entity.layer.name 会把真实图纸里过半的实体错归到 0 层，
    // 图层开关、三维分册、按图层的差异汇总会跟着一起失真
    expect(inherited?.layer).toBe('08插座-强电');
  });

  it('块里显式指定了图层的实体，保留自己的图层', () => {
    const parsed = parseDwgDocument(DwgWriter.writeToBuffer(buildLayeredFixture()));
    const layers = parsed.entities.filter((e) => e.handle.includes('/')).map((e) => e.layer);
    expect(layers).toContain('WALL');
  });

  it('顶层的 0 层实体不受影响', () => {
    const parsed = parseDwgDocument(DwgWriter.writeToBuffer(buildLayeredFixture()));
    const top = parsed.entities.filter((e) => !e.handle.includes('/'));
    expect(top.map((e) => e.layer)).toContain('0');
  });
});

describe('非保角变换下的曲线', () => {
  it('等比插入保留圆的参数式表达', () => {
    const parsed = parseFixture();
    const circles = parsed.entities.filter((e) => e.kind === 'CIRCLE' && e.geometry?.kind === 'circle');
    // 三次插入里有两次是等比的
    expect(circles).toHaveLength(2);
    for (const c of circles) {
      expect((c.geometry as { radius: number }).radius).toBeCloseTo(2, 6);
    }
  });

  it('非等比插入把圆降成折线，不硬塞进单一半径', () => {
    const parsed = parseFixture();
    const flattened = parsed.entities.filter((e) => e.kind === 'CIRCLE' && e.geometry?.kind === 'polyline');
    expect(flattened).toHaveLength(1);

    const points = (flattened[0]!.geometry as { points: readonly { x: number; y: number }[] }).points;
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    // x 方向拉伸 3 倍：宽 12、高 4
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(12, 3);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(4, 3);
  });
});

describe('文字', () => {
  it('空文本不产出几何，免得垃圾坐标撑爆包围盒', () => {
    const parsed = parseFixture();
    const texts = parsed.entities.filter((e) => e.geometry?.kind === 'text');
    expect(texts).toHaveLength(1);
    expect((texts[0]!.geometry as { text: string }).text).toBe('客厅');

    // 那个空文本的坐标在 1e6 量级，被算进去包围盒就没法看了
    expect(parsed.bounds.maxX).toBeLessThan(1000);
    expect(parsed.bounds.maxY).toBeLessThan(1000);
  });
});

describe('图层', () => {
  it('把 DWG 的索引色解析成十六进制色值', () => {
    const parsed = parseFixture();
    const wall = parsed.layers.find((l) => l.name === 'WALL');
    expect(wall).toBeDefined();
    expect(wall!.color).toMatch(/^#[0-9a-f]{6}$/);
    expect(wall!.color).toBe('#ff0000');
  });
});

describe('投放载荷（分册 38）', () => {
  it('实体上不再带 fingerprint', () => {
    const parsed = parseFixture();
    expect(parsed.entities.length).toBeGreaterThan(0);
    for (const entity of parsed.entities) {
      expect(Object.hasOwn(entity, 'fingerprint')).toBe(false);
    }
  });
});

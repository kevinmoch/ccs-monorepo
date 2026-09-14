/**
 * 构件清单与按构件比差异（0.22.0 分册 37，AC-37.1 ~ AC-37.4、AC-37.10 ~ AC-37.15、AC-37.19）。
 *
 * 夹具在内存里现造再写成 DWG 字节，走的是扩展里那条真实的读路径：
 * `DwgWriter.writeToBuffer` → `parseDwgDocument`。比对引擎是纯函数，直接喂构件清单。
 */

import { describe, expect, it } from 'vitest';
import {
  AttributeEntity,
  BlockRecord,
  CadDocument,
  Circle,
  Color,
  DwgWriter,
  Insert,
  Layer,
  Line,
  XYZ
} from '@node-projects/acad-ts';
import type { DwgComponent } from '@webskill/sdk/agent';
import { dwgComponentBlockName, parseDwgDocument } from '../src/shared/dwgSource';
import {
  DEFAULT_TOLERANCE_MM,
  compareComponents,
  componentsInBox,
  strayGeometry,
  toleranceInDrawingUnits,
  type DiffBox,
  type DiffSide
} from '../src/viewer/dwgComponentDiff';

function line(x1: number, y1: number, x2: number, y2: number): Line {
  const entity = new Line();
  entity.startPoint = new XYZ(x1, y1, 0);
  entity.endPoint = new XYZ(x2, y2, 0);
  return entity;
}

/** 一个门块：两条线加一段弧形的圆，足够画出来也足够认得出 */
function doorBlock(name: string): BlockRecord {
  const block = new BlockRecord(name);
  block.entities.add(line(0, 0, 900, 0));
  block.entities.add(line(0, 0, 0, 900));
  const swing = new Circle();
  swing.center = new XYZ(0, 0, 0);
  swing.radius = 900;
  block.entities.add(swing);
  return block;
}

/**
 * 句柄**显式指定**。acad-ts 自动分配时 `ATTRIB` 写不进 DWG，
 * 往返一趟就没了属性——实测过，不是猜的。
 */
function place(block: BlockRecord, handle: number, x: number, y: number, layer?: Layer): Insert {
  const insert = new Insert(block);
  insert.handle = handle;
  insert.insertPoint = new XYZ(x, y, 0);
  if (layer) insert.layer = layer;
  return insert;
}

function tagged(insert: Insert, handle: number, tag: string, value: string): Insert {
  const attribute = new AttributeEntity();
  attribute.handle = handle;
  attribute.tag = tag;
  attribute.value = value;
  attribute.height = 100;
  attribute.insertPoint = insert.insertPoint;
  // `SeqendCollection` 继承自 `Array`，往里放用 push
  insert.attributes.push(attribute);
  return insert;
}

function roundTrip(document: CadDocument): ReturnType<typeof parseDwgDocument> {
  return parseDwgDocument(DwgWriter.writeToBuffer(document));
}

describe('构件清单（FR-37.1 ~ FR-37.5）', () => {
  function buildFixture(): CadDocument {
    const document = new CadDocument();

    const doorLayer = new Layer('A-DOOR');
    doorLayer.color = new Color(1);
    document.layers!.add(doorLayer);

    const door = doorBlock('M0921');
    document.blockRecords!.add(door);

    // 匿名块：真实图纸里标注、填充边界都会生成这种（FR-37.2）
    const anonymous = new BlockRecord('*U7');
    anonymous.isAnonymous = true;
    anonymous.entities.add(line(0, 0, 10, 0));
    document.blockRecords!.add(anonymous);

    document.entities!.add(tagged(place(door, 0x901, 1000, 2000, doorLayer), 0x900, 'NUM', 'D-01'));
    document.entities!.add(place(door, 0x902, 5000, 2000, doorLayer));
    document.entities!.add(place(anonymous, 0x903, 9000, 9000));

    // 顶层直接画的线：不属于任何块，比不出来，只能进覆盖率
    document.entities!.add(line(-500, -500, -400, -500));

    return document;
  }

  it('块名、插入点、所在图层与属性都进了清单（AC-37.1）', () => {
    const parsed = roundTrip(buildFixture());
    const components = parsed.components ?? [];
    const first = components.find((item) => item.attributes?.['NUM'] === 'D-01');

    expect(first).toBeDefined();
    expect(first!.block).toBe('M0921');
    expect(first!.at.x).toBeCloseTo(1000, 6);
    expect(first!.at.y).toBeCloseTo(2000, 6);
    expect(first!.layer).toBe('A-DOOR');
  });

  it('`*` 开头的机器造块不出现在清单里（AC-37.2 / AC-41.2）', () => {
    const parsed = roundTrip(buildFixture());
    const names = (parsed.components ?? []).map((item) => item.block);
    expect(names).toEqual(['M0921', 'M0921']);
  });

  it('源块带着 isAnonymous 也照样算构件（AC-41.1）', () => {
    // 真实图纸（大堂立面图.dwg）里那个出口指示灯就长这样：
    // AutoCAD 给它造的源块名带 isAnonymous，却在两份图纸里一模一样
    const source = { name: 'A$C3F01247D', isAnonymous: true, source: null };
    const variant = { name: '*U942', isAnonymous: true, source };

    expect(dwgComponentBlockName(variant as never)).toBe('A$C3F01247D');
    expect(dwgComponentBlockName(source as never)).toBe('A$C3F01247D');
  });

  it('模型空间与标注生成的块也不算构件（AC-37.2 / AC-41.2）', () => {
    // 这三种是机器造的块，不是图纸作者声明的物件
    expect(dwgComponentBlockName({ name: '*Model_Space', isAnonymous: false, source: null } as never)).toBeUndefined();
    expect(dwgComponentBlockName({ name: '*D16', isAnonymous: false, source: null } as never)).toBeUndefined();
    expect(dwgComponentBlockName({ name: '*U12', isAnonymous: true, source: null } as never)).toBeUndefined();
    expect(dwgComponentBlockName({ name: 'M0921', isAnonymous: false, source: null } as never)).toBe('M0921');
  });

  it('动态块的两个变体归到同一个块名下（AC-37.3）', () => {
    // acad-ts 的 `source` 是只读 getter，往返写不出 `AcDbBlockRepBTag`，
    // 所以这里直接喂两份变体记录：它们各叫 `*U12`/`*U13`，源块都是 `M0921`
    const origin = { name: 'M0921', isAnonymous: false, source: null };
    const left = { name: '*U12', isAnonymous: true, source: origin };
    const right = { name: '*U13', isAnonymous: true, source: origin };

    expect(dwgComponentBlockName(left as never)).toBe('M0921');
    expect(dwgComponentBlockName(right as never)).toBe('M0921');
  });

  it('构件清单不改变渲染（AC-37.4）', () => {
    const parsed = roundTrip(buildFixture());
    // 块展开出来的几何一条不少、一条不多：两次插入 × 3 个实体 + 匿名块 1 条 + 顶层 1 条 + 一条属性文字
    expect(parsed.entities).toHaveLength(2 * 3 + 1 + 1 + 1);
    for (const entity of parsed.entities) {
      expect(entity.kind).not.toBe('INSERT');
      expect(entity.geometry).toBeDefined();
    }
  });

  it('视图各带各的构件清单，模型空间那份是文档级的别名', () => {
    const parsed = roundTrip(buildFixture());
    const model = (parsed.views ?? []).find((view) => view.kind === 'model');
    expect(model?.components).toEqual(parsed.components);
  });
});

describe('比对引擎（FR-37.12 ~ FR-37.18）', () => {
  const BOX: DiffBox = { minX: 0, minY: 0, maxX: 10_000, maxY: 10_000 };
  const TOLERANCE = toleranceInDrawingUnits(DEFAULT_TOLERANCE_MM, 'mm');

  function component(block: string, x: number, y: number, extra?: Partial<DwgComponent>): DwgComponent {
    return { block, at: { x, y }, rotation: 0, scaleX: 1, scaleY: 1, layer: 'A-DOOR', ...extra };
  }

  function side(components: readonly DwgComponent[], overrides?: Partial<DiffSide>): DiffSide {
    return { components, entities: [], hidden: new Set(), shift: { x: 0, y: 0 }, ...overrides };
  }

  const BASE = [component('M0921', 1000, 1000), component('M0921', 3000, 1000), component('WIN-1', 5000, 5000)];

  it('乙少一个门块，报一条缺失并写明块名（AC-37.10）', () => {
    const outcome = compareComponents(side(BASE), side([BASE[0]!, BASE[2]!]), BOX, TOLERANCE);
    const missing = outcome.rows.filter((row) => row.kind === 'missing');

    expect(missing).toHaveLength(1);
    expect(missing[0]!.block).toBe('M0921');
    // 少一个就指着那一个说；再加一条「甲 2 个乙 1 个」是同一件事说两遍
    expect(outcome.rows.some((row) => row.kind === 'count')).toBe(false);
  });

  it('落单的多到指不过来时，改用一条数量概述代替逐条（FR-37.14）', () => {
    const many = Array.from({ length: 6 }, (_, i) => component('M0921', 1000 + i * 800, 1000));
    const outcome = compareComponents(side(many), side([many[0]!]), BOX, TOLERANCE);

    expect(outcome.rows.filter((row) => row.kind === 'missing')).toHaveLength(0);
    const counts = outcome.rows.filter((row) => row.kind === 'count');
    expect(counts).toHaveLength(1);
    expect(counts[0]!.counts).toEqual({ a: 6, b: 1 });
  });

  it('同一个块挪了 1 m，位移读数与实际相差不超过 1%（AC-37.11）', () => {
    const moved = [component('M0921', 1000, 1000), component('M0921', 4000, 1000), BASE[2]!];
    const outcome = compareComponents(side(BASE), side(moved), BOX, TOLERANCE);
    const rows = outcome.rows.filter((row) => row.kind === 'moved');

    expect(rows).toHaveLength(1);
    expect(rows[0]!.distance).toBeCloseTo(1000, 0);
    expect(Math.abs(rows[0]!.distance! - 1000) / 1000).toBeLessThan(0.01);
    // 配上了对就不该再报一多一少
    expect(outcome.rows.some((row) => row.kind === 'added' || row.kind === 'missing')).toBe(false);
  });

  it('挪动小于容差不报，容差调小之后才报（AC-37.12）', () => {
    const nudged = [component('M0921', 1000, 1000), component('M0921', 3050, 1000), BASE[2]!];

    const quiet = compareComponents(side(BASE), side(nudged), BOX, TOLERANCE);
    expect(quiet.rows).toHaveLength(0);

    const strict = compareComponents(side(BASE), side(nudged), BOX, toleranceInDrawingUnits(10, 'mm'));
    const rows = strict.rows.filter((row) => row.kind === 'moved');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.distance).toBeCloseTo(50, 6);
  });

  it('配对成功但属性不同，报一条属性变更并带上新旧值（AC-37.13）', () => {
    const before = [component('FH', 2000, 2000, { attributes: { NUM: 'FH-03' } })];
    const after = [component('FH', 2000, 2000, { attributes: { NUM: 'FH-05' } })];
    const outcome = compareComponents(side(before), side(after), BOX, TOLERANCE);

    expect(outcome.rows).toHaveLength(1);
    expect(outcome.rows[0]!.kind).toBe('attribute');
    expect(outcome.rows[0]!.attribute).toEqual({ tag: 'NUM', from: 'FH-03', to: 'FH-05' });
  });

  it('块名体系完全不同就不出表（AC-37.14）', () => {
    const other = [component('门', 1000, 1000), component('门', 3000, 1000), component('窗', 5000, 5000)];
    const outcome = compareComponents(side(BASE), side(other), BOX, TOLERANCE);

    expect(outcome.refused).toBe(true);
    expect(outcome.rows).toHaveLength(0);
    expect(outcome.overlap).toBe(0);
    // 拒绝出表不是降级路径：数出来的两侧构件数照旧要说得出
    expect(outcome.counts).toEqual({ a: 3, b: 3 });
  });

  it('框边缘两侧略有差异，报位置差异而不是一多一少（AC-37.15）', () => {
    // 甲在框内 100，乙挪到框外 250：位移 350 超容差，而且不外扩就会配不上对
    const inside = [component('FH', 5000, 100)];
    const outside = [component('FH', 5000, -250)];
    const outcome = compareComponents(side(inside), side(outside), BOX, TOLERANCE);

    expect(outcome.rows.map((row) => row.kind)).toEqual(['moved']);
    expect(outcome.rows[0]!.distance).toBeCloseTo(350, 6);
  });

  it('框外的构件不参与比对，框内计数只算框内（FR-37.23）', () => {
    const far = [...BASE, component('M0921', 50_000, 50_000)];
    const outcome = compareComponents(side(far), side(BASE), BOX, TOLERANCE);

    expect(outcome.counts).toEqual({ a: 3, b: 3 });
    expect(outcome.rows).toHaveLength(0);
  });

  it('隐藏图层上的构件不进比对（FR-37.12）', () => {
    const hidden = side(BASE, { hidden: new Set(['A-DOOR']) });
    expect(componentsInBox(hidden, BOX)).toHaveLength(0);
  });

  it('对位偏移加在插入点上之后才比（FR-37.13）', () => {
    const shifted = side(BASE, { shift: { x: 2000, y: 0 } });
    const outcome = compareComponents(shifted, side(BASE), BOX, TOLERANCE);
    // 没有偏移时两边一模一样；加了 2 m 偏移之后就全对不上了
    expect(outcome.rows.length).toBeGreaterThan(0);
    expect(componentsInBox(shifted, BOX).map((item) => item.x)).toEqual([3000, 5000, 7000]);
  });

  it('如实报出框内不属于任何块的几何条数（AC-37.19）', () => {
    const stray = side(BASE, {
      entities: [
        {
          handle: '1A',
          kind: 'LINE',
          layer: 'A-WALL',
          geometry: {
            kind: 'polyline',
            points: [
              { x: 100, y: 100 },
              { x: 200, y: 100 }
            ],
            closed: false
          }
        },
        {
          // 块展开出来的实体带实例路径，它已经由构件那一侧比过了
          handle: '5A0/1B',
          kind: 'LINE',
          layer: 'A-DOOR',
          geometry: {
            kind: 'polyline',
            points: [
              { x: 300, y: 300 },
              { x: 400, y: 300 }
            ],
            closed: false
          }
        },
        {
          // 框外
          handle: '1C',
          kind: 'CIRCLE',
          layer: 'A-WALL',
          geometry: { kind: 'circle', center: { x: 90_000, y: 90_000 }, radius: 10 }
        }
      ]
    });

    expect(strayGeometry(stray, BOX)).toBe(1);
    expect(compareComponents(stray, side(BASE), BOX, TOLERANCE).stray).toEqual({ a: 1, b: 0 });
  });

  it('毫米容差按图纸量纲换算（FR-37.16）', () => {
    expect(toleranceInDrawingUnits(200, 'mm')).toBeCloseTo(200, 9);
    expect(toleranceInDrawingUnits(200, 'm')).toBeCloseTo(0.2, 9);
    expect(toleranceInDrawingUnits(200, 'cm')).toBeCloseTo(20, 9);
    // 图纸说不出量纲时按 1:1，不猜
    expect(toleranceInDrawingUnits(200, undefined)).toBeCloseTo(200, 9);
  });
});

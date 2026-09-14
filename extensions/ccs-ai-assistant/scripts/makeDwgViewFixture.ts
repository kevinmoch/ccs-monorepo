/**
 * 从一份真实 DWG 切出测试夹具（0.22.0 分册 23 FR-23.9）。
 *
 * 它取代了 `scripts/makeDwgRevisionPair.mjs`：那个脚本用 acad-ts 的写出器造「修订版」，
 * 而写出来的文件原厂渲染器读不了（分册 23 §2.3）。这里**一个字节的 DWG 都不写**——
 * 只把解析结果（纯数据）按 Layout1 的视口窗口切成几块，固化成 JSON。
 *
 * 两个立面是「相似但不同源」的一对：句柄天然对不上，正好用来验
 * 几何指纹 + 空间近邻匹配那条路（AC-23.11）。
 *
 * 用法（需要本机有源图纸，产物已提交，平时不必重跑）：
 *   node --experimental-strip-types scripts/makeDwgViewFixture.ts <图纸.dwg> <输出.json>
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { parseDwgDocument } from '../src/shared/dwgSource.ts';
import type { DwgBounds, DwgEntity, DwgPoint, DwgView, DwgViewport } from '@webskill/sdk/agent';

/** 坐标保留的精度。图纸尺度是万毫米级，1 mm 远小于任何有意义的差异，却能把 JSON 砍掉一大截 */
const PRECISION = 1;

/**
 * 每一块切片保留的图案填充线段上限。
 *
 * 真实图纸一共 27177 段，全存进仓库是 1.1 MB——而验「填充画成了面」与
 * 「展开不进指纹」不需要那么多样本。超出配额的填充**只丢 fill，实体保留**，
 * 因此实体数、包围盒与 diff 行为都不受影响。配额逐块重置，
 * 否则第一个立面会把额度吃光，第二个立面一个填充都不剩。
 */
const PATTERN_SEGMENT_BUDGET = 1000;

let patternBudget = PATTERN_SEGMENT_BUDGET;

const round = (v: number): number => Math.round(v * PRECISION) / PRECISION;
const point = (p: DwgPoint): DwgPoint => ({ x: round(p.x), y: round(p.y) });

function centreOf(entity: DwgEntity): DwgPoint | undefined {
  const g = entity.geometry;
  if (!g) return undefined;
  switch (g.kind) {
    case 'polyline': {
      if (g.points.length === 0) return undefined;
      let x = 0;
      let y = 0;
      for (const p of g.points) {
        x += p.x;
        y += p.y;
      }
      return { x: x / g.points.length, y: y / g.points.length };
    }
    case 'circle':
    case 'arc':
    case 'ellipse':
      return g.center;
    case 'point':
      return g.at;
    case 'text':
      return g.at;
  }
}

/** 视口在模型空间里看到的矩形 */
function windowOf(viewport: DwgViewport): DwgBounds {
  const halfH = viewport.viewHeight / 2;
  const halfW = (viewport.viewHeight * Math.abs(viewport.width)) / Math.abs(viewport.height) / 2;
  return {
    minX: viewport.viewCenter.x - halfW,
    minY: viewport.viewCenter.y - halfH,
    maxX: viewport.viewCenter.x + halfW,
    maxY: viewport.viewCenter.y + halfH
  };
}

function shrink(entity: DwgEntity): DwgEntity {
  const g = entity.geometry;
  const geometry = !g
    ? undefined
    : g.kind === 'polyline'
      ? { ...g, points: g.points.map(point) }
      : g.kind === 'circle'
        ? { ...g, center: point(g.center), radius: round(g.radius) }
        : g.kind === 'arc'
          ? { ...g, center: point(g.center), radius: round(g.radius) }
          : g.kind === 'ellipse'
            ? { ...g, center: point(g.center), majorAxis: point(g.majorAxis) }
            : g.kind === 'point'
              ? { ...g, at: point(g.at) }
              : { ...g, at: point(g.at), height: round(g.height) };
  // 必须先把原 fill 摘掉：`{ ...entity }` 会把超预算时本该丢弃的那份原样带回来
  const { fill: original, ...rest } = entity;
  const fill = !original
    ? undefined
    : original.kind === 'pattern'
      ? patternBudget >= original.segments.length / 4
        ? ((patternBudget -= original.segments.length / 4), { ...original, segments: original.segments.map(round) })
        : undefined
      : { ...original, loops: original.loops.map((loop) => loop.map(point)) };
  return { ...rest, ...(geometry ? { geometry } : {}), ...(fill ? { fill } : {}) };
}

function boundsOf(entities: readonly DwgEntity[]): DwgBounds {
  const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const entity of entities) {
    const c = centreOf(entity);
    if (!c) continue;
    box.minX = Math.min(box.minX, c.x);
    box.minY = Math.min(box.minY, c.y);
    box.maxX = Math.max(box.maxX, c.x);
    box.maxY = Math.max(box.maxY, c.y);
  }
  if (!Number.isFinite(box.minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return { minX: round(box.minX), minY: round(box.minY), maxX: round(box.maxX), maxY: round(box.maxY) };
}

function slice(entities: readonly DwgEntity[], window: DwgBounds): DwgEntity[] {
  patternBudget = PATTERN_SEGMENT_BUDGET;
  const out: DwgEntity[] = [];
  for (const entity of entities) {
    const c = centreOf(entity);
    if (!c) continue;
    if (c.x < window.minX || c.x > window.maxX || c.y < window.minY || c.y > window.maxY) continue;
    out.push(shrink(entity));
  }
  return out;
}

const [, , source, target] = process.argv;
if (!source || !target) {
  console.error('usage: makeDwgViewFixture.ts <drawing.dwg> <fixture.json>');
  process.exit(1);
}

const document = parseDwgDocument(readFileSync(source));
const model = document.views.find((view) => view.kind === 'model');
const sheet = document.views.find((view) => view.viewports.length > 0);
if (!model || !sheet) throw new Error('drawing has no model space or no sheet with viewports');

const [first, second] = sheet.viewports;
if (!first || !second) throw new Error('sheet needs at least two viewports to slice two elevations');

const elevationA = slice(model.entities, windowOf(first));
const elevationB = slice(model.entities, windowOf(second));

// 模型空间的**全部**文字。立面切片按视口窗口取，一块只盖得到一个立面，
// 而对齐的验收（AC-25.1 / AC-25.2）要的是整个模型空间 178 个 MTEXT 的分布。
// 文字不带填充也不带成千顶点，全收下来也不撑多少字节。
const modelTexts = model.entities.filter((entity) => entity.geometry?.kind === 'text').map(shrink);

const thinSheet: DwgView = {
  ...sheet,
  entities: ((): DwgEntity[] => {
    patternBudget = PATTERN_SEGMENT_BUDGET;
    return sheet.entities.map(shrink);
  })(),
  bounds: boundsOf(sheet.entities),
  viewports: sheet.viewports.map((viewport) => ({
    ...viewport,
    center: point(viewport.center),
    width: round(viewport.width),
    height: round(viewport.height),
    viewCenter: point(viewport.viewCenter),
    viewHeight: round(viewport.viewHeight)
  }))
};

const usedLayers = new Set([...elevationA, ...elevationB, ...thinSheet.entities].map((entity) => entity.layer));

const fixture = {
  note: 'Sliced from a real drawing by scripts/makeDwgViewFixture.ts. No DWG bytes are written anywhere. Coordinates are rounded to whole drawing units and hatch pattern segments are capped per slice, so this is a faithful sample rather than a byte-exact copy.',
  version: document.version,
  /** 整份图纸解析出的视图集合。切片只留了其中三块，视图结构本身靠这张摘要断言 */
  views: document.views.map((view) => ({
    id: view.id,
    kind: view.kind,
    entityCount: view.entities.length,
    viewportCount: view.viewports.length
  })),
  layers: document.layers.filter((layer) => usedLayers.has(layer.name)),
  omissions: document.omissions,
  elevationA: { entities: elevationA, bounds: boundsOf(elevationA) },
  elevationB: { entities: elevationB, bounds: boundsOf(elevationB) },
  modelTexts,
  sheet: thinSheet,
  emptySheet: document.views.find((view) => view.kind === 'layout' && view.entities.length === 0)
};

writeFileSync(target, `${JSON.stringify(fixture)}\n`);
console.log(
  'elevationA',
  elevationA.length,
  'elevationB',
  elevationB.length,
  'sheet',
  thinSheet.entities.length,
  'viewports',
  thinSheet.viewports.length,
  'layers',
  fixture.layers.length,
  'modelTexts',
  modelTexts.length
);

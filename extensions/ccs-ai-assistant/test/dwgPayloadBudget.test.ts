/**
 * 分册 38：投放载荷瘦身。
 *
 * 两份大平面图合并后约 1.77 亿单位，撞上投放面 1.28 亿的硬上限打不开。
 * 大头不是几何本身，而是每条实体额外背着的那串几何指纹——
 * 计量口径里数字不计费，所以一个顶点在 `points` 里只值 2 个单位（`x`、`y` 两个键名），
 * 在指纹里却要摊掉二十几个字符。详见需求文档 §2。
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import type { DwgEntity } from '@webskill/agent';

/**
 * 与 `packages/browser/src/viewer/documentSurface.ts` 的 `payloadUnits` 同口径：
 * 只数字符串长度与对象键名长度，数字与布尔一律不计费。
 * 这里复刻而不是导入，是因为那个函数没有公开导出；口径若变，AC-38.4 的斜率会立刻变号。
 */
function payloadUnits(value: unknown): number {
  let units = 0;
  const stack: unknown[] = [value];
  while (stack.length > 0) {
    const current = stack.pop();
    if (typeof current === 'string') {
      units += current.length;
      continue;
    }
    if (typeof current !== 'object' || current === null) continue;
    if (Array.isArray(current)) {
      stack.push(...current);
      continue;
    }
    for (const [key, item] of Object.entries(current)) {
      units += key.length;
      stack.push(item);
    }
  }
  return units;
}

/** 一条 n 个顶点的多段线，坐标取真实平面图那个量级（毫米、五位整数） */
function polyline(handle: string, n: number): DwgEntity {
  return {
    handle,
    kind: 'LWPOLYLINE',
    layer: 'AR-墙体-2',
    geometry: {
      kind: 'polyline',
      closed: false,
      points: Array.from({ length: n }, (_, i) => ({ x: 91_395.7153 + i * 3.25, y: i * 3250 }))
    }
  };
}

/** 反向对照：分册 38 之前的形态，同一条几何再拼一串指纹挂上去 */
function withFingerprint(handle: string, n: number): DwgEntity & { fingerprint: string } {
  const entity = polyline(handle, n);
  const points = (entity.geometry as { points: readonly { x: number; y: number }[] }).points;
  const coords = points.map((p) => `${Math.round(p.x * 1e4) / 1e4},${Math.round(p.y * 1e4) / 1e4}`).join(';');
  return { ...entity, fingerprint: `${entity.kind}|${entity.layer}|LO|${coords}` };
}

/** 每多一个顶点要多花几个单位 */
function unitsPerPoint(make: (handle: string, n: number) => unknown): number {
  const batch = (n: number): number =>
    payloadUnits(Array.from({ length: 50 }, (_, i) => make(`H${i.toString(16)}`, n)));
  return (batch(110) - batch(10)) / (50 * 100);
}

describe('T-38-A 顶点的载荷成本（AC-38.4）', () => {
  it('一个顶点只花两个键名，四个单位封顶', () => {
    expect(unitsPerPoint(polyline)).toBeLessThanOrEqual(4);
  });

  it('反向对照：带指纹时同一个顶点要花十几个单位', () => {
    // 这一条不是在测旧代码，是在证明上面那条护栏量的是真东西：
    // 若计量口径写错（比如把数字也算进去），两边都会变大，这条就会先塌。
    // 15 是实测值 19.8 留了余地后的下界（AC-38.4）
    expect(unitsPerPoint(withFingerprint)).toBeGreaterThan(15);
  });
});

describe('T-38-B 指纹的实现与契约都已删干净（AC-38.2 / AC-38.3）', () => {
  it('解析器里不留指纹的生成代码', () => {
    const source = readFileSync(resolve(import.meta.dirname, '..', 'src', 'shared', 'dwgSource.ts'), 'utf8');
    for (const dead of ['fingerprintOf', 'FINGERPRINT_SCALE', 'quantise']) {
      expect(source).not.toContain(dead);
    }
  });

  it('公开契约里不再有这个字段', () => {
    // 本工程编译的是**已发布**的 @webskill/sdk，这里没有 SDK 仓库的 api-snapshots，
    // 所以直接看依赖自带的 d.ts——它才是本工程真正吃到的契约。
    // 声明落在哪个 chunk 文件里随构建变，所以按内容找而不是按文件名
    const dist = resolve(createRequire(import.meta.url).resolve('@webskill/sdk/package.json'), '..', 'dist');
    const declaration = readdirSync(dist)
      .filter((name) => name.endsWith('.d.ts'))
      .map((name) => readFileSync(resolve(dist, name), 'utf8'))
      .find((text) => text.includes('interface DwgEntity'));
    expect(declaration).toBeDefined();
    const block = /interface DwgEntity \{[\s\S]*?\n\}/.exec(declaration ?? '')?.[0];
    expect(block).toBeDefined();
    expect(block).not.toContain('fingerprint');
  });
});

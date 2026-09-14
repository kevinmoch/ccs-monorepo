/**
 * 从真实 DWG 里切出量测地面真值（0.22.0 分册 31，AC-31.9 / AC-31.18）。
 *
 * 图纸自己的标注就是最好的标尺：AutoCAD 早就把长度和角度算好写在文件里了。
 * 这里**一个字节的 DWG 都不写**，只把标注的定义点和 `measurement` 固化成 JSON。
 * 对齐标注（DIMALIGNED）的 `measurement` 是两点直线距离，正是量测工具要算的东西；
 * 线性标注（DIMLINEAR）不收：它的 `measurement` 是沿 `rotation` 的**投影**长度，
 * 拿它当直线距离的标尺会得出「误差 13 倍」这种假结论。
 *
 * 用法（需要本机有源图纸，产物已提交，平时不必重跑）：
 *   node --experimental-strip-types scripts/makeDwgMeasureFixture.ts <图纸.dwg>... <输出.json>
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { DwgReader } from '@node-projects/acad-ts';

interface Pt { x: number; y: number }
interface Dim { handle?: unknown; firstPoint?: Pt; secondPoint?: Pt; angleVertex?: Pt; measurement?: number }

const AlignedSamples: { file: string; a: [number, number]; b: [number, number]; measurement: number }[] = [];
const AngularSamples: { file: string; a: [number, number]; vertex: [number, number]; b: [number, number]; measurement: number }[] = [];

const argv = process.argv.slice(2);
const out = argv.pop()!;
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

for (const file of argv) {
  const name = file.split('/').pop()!;
  const bytes = readFileSync(file);
  const doc = DwgReader.readFromStream(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  );
  const seen = new Set<unknown>();
  for (const raw of (doc as { entities?: Iterable<unknown> }).entities ?? []) {
    const kind = (raw as { constructor?: { name?: string } }).constructor?.name ?? '';
    const e = raw as Dim;
    if (e.handle !== undefined) {
      if (seen.has(e.handle)) continue;
      seen.add(e.handle);
    }
    const m = e.measurement;
    if (!finite(m) || m <= 0) continue;
    if (kind === 'DimensionAligned' && e.firstPoint && e.secondPoint) {
      AlignedSamples.push({
        file: name,
        a: [e.firstPoint.x, e.firstPoint.y],
        b: [e.secondPoint.x, e.secondPoint.y],
        measurement: m
      });
    } else if (kind === 'DimensionAngular3Pt' && e.firstPoint && e.secondPoint && e.angleVertex) {
      AngularSamples.push({
        file: name,
        a: [e.firstPoint.x, e.firstPoint.y],
        vertex: [e.angleVertex.x, e.angleVertex.y],
        b: [e.secondPoint.x, e.secondPoint.y],
        measurement: m
      });
    }
  }
}

// 样本按文件轮转抽稀，免得配额被第一份图纸吃光
const cap = <T extends { file: string }>(list: T[], limit: number): T[] => {
  if (list.length <= limit) return list;
  const step = list.length / limit;
  return Array.from({ length: limit }, (_, i) => list[Math.floor(i * step)]!);
};

const payload = { aligned: cap(AlignedSamples, 600), angular: cap(AngularSamples, 200) };
writeFileSync(out, `${JSON.stringify(payload)}\n`);
console.log('aligned', AlignedSamples.length, '->', payload.aligned.length);
console.log('angular', AngularSamples.length, '->', payload.angular.length);

/**
 * pptx 原件 → 逐页文本 / 备注 / 本页插图（0.21.0 分册 12 FR-12.4d / AC-12.17）。
 *
 * 这不是渲染器。OOXML 包里**没有**渲染好的页面图，浏览器里也没有 pptx 渲染器，
 * 所以这条路给得出「这一页写了什么、插了哪几张图」，给不出「这一页长什么样」。
 * 要版式只能退到截屏。
 *
 * 两条不许破的纪律：
 * 1. **不手写协议解析器**（AGENTS.md 第 6 条）。zip 交给 `fflate`，XML 交给 `DOMParser`。
 *    实测教训：用 `<a:t[^>]*>` 抓文本会把 `<a:tblPr/>`、`<a:tblGrid>` 一起吞掉，
 *    一页能算出 18 万字符的「正文」。
 * 2. **图只认这一页自己引的**。母版与版式上的图是模板底图——实测一份 8 页的文稿里
 *    8 张 jpeg/tiff 全挂在母版上，跟进去等于每页都附同一张背景。
 */

import { unzipSync, strFromU8 } from 'fflate';
import type {
  PresentationSourceDocument,
  PresentationSourceReader,
  PresentationSourceSlide
} from '@webskill/browser';

const MAIN_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';
/** 幻灯片自己的命名空间。`p:sldId` / `p:spTree` 在这里，不在 drawingml 里 */
const PRESENTATION_NS = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const DOC_REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

/** 单张图的上限。超过就当解不了：一张 20 MB 的底图进上下文只会挤掉正文 */
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

/** 浏览器认得的位图。tiff / emf / wmf 与视频不在其中，它们计进「读不出来」的分母 */
const IMAGE_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp'
};

type Zip = Record<string, Uint8Array>;

/** 包里必须真有这一条才算演示文稿。只看 zip 魔数等于把任何压缩包都当幻灯片（AC-12.17） */
export function isPresentationPackage(files: Zip): boolean {
  return files['ppt/presentation.xml'] !== undefined;
}

export function createPptxSourceReader(): PresentationSourceReader {
  return {
    async read(bytes: Uint8Array): Promise<PresentationSourceDocument> {
      const files = unzipSync(bytes);
      if (!isPresentationPackage(files)) return { slides: [] };
      const slides: PresentationSourceSlide[] = [];
      for (const path of slideOrder(files)) {
        const slide = readSlide(files, path);
        if (slide !== undefined) slides.push(slide);
      }
      return { slides };
    }
  };
}

/**
 * 放映顺序取自 `p:sldIdLst`，**不是**文件名里的数字。
 * `slide7.xml` 完全可以排在第二张——删过页的文稿里这是常态。
 */
function slideOrder(files: Zip): string[] {
  const presentation = parseXml(files, 'ppt/presentation.xml');
  const rels = relationshipsOf(files, 'ppt/presentation.xml');
  if (presentation === undefined) return [];
  const ordered: string[] = [];
  for (const node of Array.from(presentation.getElementsByTagNameNS(PRESENTATION_NS, 'sldId'))) {
    const id = node.getAttributeNS(DOC_REL_NS, 'id');
    const target = id === null ? undefined : rels.get(id);
    if (target !== undefined && files[target] !== undefined) ordered.push(target);
  }
  // 没有 sldIdLst 的包（生成器不规范）退回文件名排序，总比一页都不给强
  if (ordered.length > 0) return ordered;
  return Object.keys(files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => slideNumber(a) - slideNumber(b));
}

function slideNumber(path: string): number {
  return Number(/(\d+)\.xml$/.exec(path)?.[1] ?? 0);
}

function readSlide(files: Zip, path: string): PresentationSourceSlide | undefined {
  const doc = parseXml(files, path);
  if (doc === undefined) return undefined;
  const rels = relationshipsOf(files, path);

  const texts: string[] = [];
  for (const tree of Array.from(doc.getElementsByTagNameNS(PRESENTATION_NS, 'spTree'))) {
    // 按 spTree 的直接子元素分组，一个子元素一条：组合形状整体算一条、
    // 表格（p:graphicFrame）整体算一条，与 jssdk 路径「一个 Shape 一条」对齐
    for (const shape of Array.from(tree.children)) {
      const text = textOf(shape);
      if (text !== '') texts.push(text);
    }
  }

  const { images, skipped } = imagesOf(files, rels);
  return { texts, notes: notesOf(files, rels), images, skippedMedia: skipped };
}

/** 段落之间换行，段落内的多个 run 直接相接——run 的切分是格式造成的，不是语义 */
function textOf(node: Element): string {
  const lines: string[] = [];
  for (const paragraph of Array.from(node.getElementsByTagNameNS(MAIN_NS, 'p'))) {
    const runs = Array.from(paragraph.getElementsByTagNameNS(MAIN_NS, 't')).map((run) => run.textContent ?? '');
    const line = runs.join('').trim();
    if (line !== '') lines.push(line);
  }
  return lines.join('\n');
}

/**
 * 备注页的文本。多一道过滤：备注页上除备注框外还挂着页码之类的字段占位符，
 * 取值是一个孤零零的符号。**不含任何字母或数字的条目不是备注**——
 * 与 jssdk 路径同一条口径（设计分册 13 §3.3）。
 */
function notesOf(files: Zip, rels: Map<string, string>): string {
  const target = [...rels.values()].find((value) => value.includes('/notesSlides/'));
  const doc = target === undefined ? undefined : parseXml(files, target);
  if (doc === undefined) return '';
  const lines: string[] = [];
  for (const tree of Array.from(doc.getElementsByTagNameNS(PRESENTATION_NS, 'spTree'))) {
    for (const shape of Array.from(tree.children)) {
      const text = textOf(shape);
      if (text !== '' && /[\p{L}\p{N}]/u.test(text)) lines.push(text);
    }
  }
  return lines.join('\n');
}

function imagesOf(
  files: Zip,
  rels: Map<string, string>
): { images: PresentationSourceSlide['images']; skipped: number } {
  const images: { mimeType: string; data: string }[] = [];
  let skipped = 0;
  for (const target of rels.values()) {
    if (!target.startsWith('ppt/media/')) continue;
    const bytes = files[target];
    const mimeType = IMAGE_MIME[target.split('.').pop()?.toLowerCase() ?? ''];
    // 解不了的格式、拿不到的条目、太大的图：都算这一页有图但没读到
    if (bytes === undefined || mimeType === undefined || bytes.byteLength > MAX_IMAGE_BYTES) {
      skipped += 1;
      continue;
    }
    images.push({ mimeType, data: base64Of(bytes) });
  }
  return { images, skipped };
}

/**
 * 某个部件的关系表，键是 `rId`，值是**已经解算成包内绝对路径**的 target。
 * 外部链接（`TargetMode="External"`）不收：那是别处的 URL，不是包里的东西。
 */
function relationshipsOf(files: Zip, part: string): Map<string, string> {
  const slash = part.lastIndexOf('/');
  const dir = part.slice(0, slash);
  const doc = parseXml(files, `${dir}/_rels/${part.slice(slash + 1)}.rels`);
  const map = new Map<string, string>();
  if (doc === undefined) return map;
  for (const node of Array.from(doc.getElementsByTagNameNS(REL_NS, 'Relationship'))) {
    const id = node.getAttribute('Id');
    const target = node.getAttribute('Target');
    if (id === null || target === null || node.getAttribute('TargetMode') === 'External') continue;
    map.set(id, resolvePart(dir, target));
  }
  return map;
}

/** `../media/image1.png` 相对 `ppt/slides` → `ppt/media/image1.png` */
function resolvePart(dir: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = dir.split('/');
  for (const segment of target.split('/')) {
    if (segment === '..') parts.pop();
    else if (segment !== '.') parts.push(segment);
  }
  return parts.join('/');
}

function parseXml(files: Zip, path: string): Document | undefined {
  const bytes = files[path];
  if (bytes === undefined) return undefined;
  const doc = new DOMParser().parseFromString(strFromU8(bytes), 'application/xml');
  // 解析失败时 DOMParser 不抛错，回一份带 <parsererror> 的文档
  return doc.getElementsByTagName('parsererror').length > 0 ? undefined : doc;
}

/** 分块转：`String.fromCharCode(...bytes)` 在几百 KB 的图上就会爆调用栈 */
function base64Of(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

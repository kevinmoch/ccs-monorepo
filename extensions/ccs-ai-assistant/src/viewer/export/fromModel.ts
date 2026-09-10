/**
 * 结构化模型 → 导出中间表示（0.21.0 分册 19 FR-19.6）。
 *
 * 这条通路上没有任何「解析」：字段是什么就是什么。屏幕上那份 HTML 与这里读到的
 * 是同一个 JSON 的两次渲染，所以「另存下来跟看到的不一样」在结构层面不再可能发生——
 * 剩下的差异只可能出在 OOXML 表达不了的地方，那些一律记进未导出清单。
 */

import type {
  AuthoredBlock,
  AuthoredDeckModel,
  AuthoredDocumentModel,
  AuthoredModel,
  AuthoredSlide,
  AuthoredSlideItem
} from '../authored/model';
import { inlineRuns } from '../authored/model';
import type { ChartImage, ExportBlock, ExportDoc, ExportDocHeader, ExportPage, ExportRun } from './extract';
import { OmissionCounter } from './omissions';

export function fromAuthoredModel(model: AuthoredModel, chartImages: readonly ChartImage[]): ExportDoc {
  const counter = new OmissionCounter();
  const images = { list: chartImages, next: 0 };
  const doc = model.kind === 'document' ? documentDoc(model, counter, images) : deckDoc(model, counter, images);
  return { ...doc, omissions: counter.list() };
}

interface ImageCursor {
  list: readonly ChartImage[];
  next: number;
}

function documentDoc(model: AuthoredDocumentModel, counter: OmissionCounter, images: ImageCursor): ExportDoc {
  const header: ExportDocHeader = { docType: model.docType };
  if (model.subtitle !== undefined) header.subtitle = model.subtitle;
  if (model.meta !== undefined) header.meta = model.meta;
  if (model.official !== undefined) header.official = model.official;
  if (model.signature !== undefined) header.signature = model.signature;

  const blocks: ExportBlock[] = [];
  for (const block of model.blocks) blocks.push(...convertBlock(block, counter, images));
  return {
    kind: 'bulletin',
    title: model.title,
    pages: [{ blocks }],
    omissions: [],
    theme: model.palette,
    header
  };
}

function deckDoc(model: AuthoredDeckModel, counter: OmissionCounter, images: ImageCursor): ExportDoc {
  return {
    kind: 'slides',
    title: model.title,
    pages: model.slides.map((slide) => convertSlide(slide, counter, images)),
    omissions: [],
    theme: model.palette
  };
}

function convertSlide(slide: AuthoredSlide, counter: OmissionCounter, images: ImageCursor): ExportPage {
  const regions = slide.body.map((item) => convertItem(item, counter, images));
  const page: ExportPage = { layout: slide.layout, blocks: regions.flat(), regions };
  if (slide.title !== undefined) page.title = slide.title;
  if (slide.subtitle !== undefined) page.subtitle = slide.subtitle;
  if (slide.meta !== undefined) page.meta = slide.meta;
  if (slide.takeaway !== undefined) page.takeaway = slide.takeaway;
  return page;
}

function convertItem(item: AuthoredSlideItem, counter: OmissionCounter, images: ImageCursor): ExportBlock[] {
  switch (item.type) {
    case 'bullets': {
      const out: ExportBlock[] = [];
      if (item.title !== undefined) out.push({ kind: 'heading', level: 3, runs: runs(item.title) });
      if (item.items.length > 0) out.push({ kind: 'list', ordered: false, items: item.items.map(runs) });
      return out;
    }
    case 'paragraph': {
      const out: ExportBlock[] = [];
      if (item.title !== undefined) out.push({ kind: 'heading', level: 3, runs: runs(item.title) });
      out.push({ kind: 'paragraph', runs: runs(item.text) });
      return out;
    }
    default:
      return convertBlock(item as AuthoredBlock, counter, images);
  }
}

function convertBlock(block: AuthoredBlock, counter: OmissionCounter, images: ImageCursor): ExportBlock[] {
  switch (block.type) {
    case 'heading':
      return [{ kind: 'heading', level: block.level, runs: runs(block.text) }];
    case 'paragraph':
      return [{ kind: 'paragraph', runs: runs(block.text) }];
    case 'list':
      return [{ kind: 'list', ordered: block.ordered === true, items: block.items.map(runs) }];
    case 'table':
      return [
        {
          kind: 'table',
          props: {
            columns: block.columns,
            rows: block.rows,
            ...(block.title === undefined ? {} : { title: block.title }),
            ...(block.caption === undefined ? {} : { caption: block.caption }),
            ...(block.columnWidths === undefined ? {} : { columnWidths: block.columnWidths })
          }
        }
      ];
    case 'chart': {
      // 图表按文档顺序配一张屏幕上的画布快照；没配到就只剩数据，由编码器决定怎么降级
      const image = images.list[images.next];
      images.next += 1;
      return [
        {
          kind: 'chart',
          props: {
            type: block.chartType,
            labels: block.labels,
            series: block.series,
            ...(block.title === undefined ? {} : { title: block.title }),
            ...(block.caption === undefined ? {} : { caption: block.caption }),
            ...(image === undefined || image.url === '' ? {} : { image })
          }
        }
      ];
    }
    case 'metrics':
      return block.items.length > 0 ? [{ kind: 'metrics', items: block.items }] : [];
    case 'keyValue':
      return block.items.length > 0
        ? [{ kind: 'keyValue', items: block.items, ...(block.title === undefined ? {} : { title: block.title }) }]
        : [];
    case 'callout':
      return [
        {
          kind: 'callout',
          tone: block.tone ?? 'info',
          runs: runs(block.text),
          ...(block.title === undefined ? {} : { title: block.title })
        }
      ];
    case 'quote':
      return [
        { kind: 'quote', runs: runs(block.text), ...(block.source === undefined ? {} : { source: block.source }) }
      ];
    case 'divider':
      return [{ kind: 'divider' }];
    case 'pageBreak':
      return [{ kind: 'pageBreak' }];
    default:
      counter.add('unknown-component');
      return [];
  }
}

function runs(text: string): ExportRun[] {
  return inlineRuns(text).map((run) => (run.bold === true ? { text: run.text, bold: true } : { text: run.text }));
}

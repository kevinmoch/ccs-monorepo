import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import type { PdfTextExtractor } from '@webskill/runtime';
import type { PdfDocumentHandle, PdfDocumentReader, PdfPageImage, RenderedImage } from '@webskill/sdk/agent';
import { imageAreaRatios } from './pdfImageArea';

/**
 * PDF 文本抽取（分册 17 D-17-3）。
 *
 * pdfjs 只装在**扩展**里，不进 SDK：它带着自己的 worker、字体表和 CMap，
 * 打包进 `@webskill/browser` 会让每个只想读 DOM 的使用方都背上这几 MB。
 * SDK 侧留的是 `pdfExtractor` 注入口，宿主想要就自己接。
 */
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/**
 * 外置资源的地址（0.21.0 分册 22 FR-22.5）。
 *
 * 不给这几个地址，pdfjs 会回落到官网 CDN，而扩展的 CSP 直接拦掉——
 * 表现出来就是「中文 PDF 抽出来全是乱码」：CMap 拿不到，字形码映不回 Unicode。
 * `vite.config.ts` 的 `copyExtensionAssets()` 负责把这些目录拷进 `dist/pdfjs/`，
 * 两处必须同时改，改一处就是静默退回乱码。
 */
const assetUrl = (path: string): string => chrome.runtime.getURL(`pdfjs/${path}`);

const documentOptions = (bytes: Uint8Array): Parameters<typeof pdfjs.getDocument>[0] => ({
  // pdfjs 会**转移**（detach）传进去的 buffer；不拷贝的话调用方手里的 bytes 会变成长度 0，
  // 而失败时它可能还要重试或留痕
  data: new Uint8Array(bytes),
  cMapUrl: assetUrl('cmaps/'),
  cMapPacked: true,
  standardFontDataUrl: assetUrl('standard_fonts/'),
  wasmUrl: assetUrl('wasm/')
});

/**
 * 同一行的两个片段 y 坐标不会完全相等（基线微调、上下标）。
 * 容差取 2pt：小于它算同一行，大于它才换行。不做行重建的话，
 * 表格类 PDF 会退化成一列孤立的词，模型读不出行的对应关系。
 */
const LINE_BREAK_TOLERANCE = 2;

interface TextItem {
  str: string;
  transform: number[];
}

function pageText(items: readonly unknown[]): string {
  const lines: string[] = [];
  let lastY: number | undefined;
  let current = '';
  for (const raw of items) {
    const item = raw as TextItem;
    if (typeof item.str !== 'string') continue;
    const y = item.transform[5] ?? 0;
    if (lastY !== undefined && Math.abs(y - lastY) > LINE_BREAK_TOLERANCE) {
      lines.push(current);
      current = '';
    }
    current += item.str;
    lastY = y;
  }
  if (current !== '') lines.push(current);
  return lines.join('\n');
}

export const extractPdfText: PdfTextExtractor = async (bytes: Uint8Array): Promise<string> => {
  const loadingTask = pdfjs.getDocument(documentOptions(bytes));
  const doc = await loadingTask.promise;
  try {
    const pages: string[] = [];
    for (let index = 1; index <= doc.numPages; index += 1) {
      const page = await doc.getPage(index);
      const content = await page.getTextContent();
      pages.push(pageText(content.items));
    }
    return pages.join('\n\n');
  } finally {
    // 不销毁就把 worker 和整份页面缓存留在内存里；side panel 是长驻的
    await loadingTask.destroy();
  }
};

/**
 * 整页渲成图时的缩放。1.0 是 72dpi，扫描件上的小字会糊成一团；
 * 2.0 约合 144dpi，是「多模态模型认得出」与「别把一张 A4 渲成 8MB」之间的折中。
 */
const RENDER_SCALE = 2;

/** 渲染用 PNG：扫描件与图表都是大色块与细线条，JPEG 的振铃会把小字毁掉 */
const RENDER_MIME = 'image/png';

async function renderPage(page: pdfjs.PDFPageProxy): Promise<RenderedImage> {
  const viewport = page.getViewport({ scale: RENDER_SCALE });
  const canvas = new OffscreenCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const context = canvas.getContext('2d');
  if (context === null) throw new Error('This browser could not create a 2D canvas to render the page.');
  // pdfjs 的类型只写了 HTMLCanvasElement，运行时对 OffscreenCanvas 一视同仁；
  // side panel 里没有 DOM 画布可用，转型是这里唯一的选择
  const target = { canvas, canvasContext: context, viewport } as unknown as Parameters<pdfjs.PDFPageProxy['render']>[0];
  await page.render(target).promise;
  const blob = await canvas.convertToBlob({ type: RENDER_MIME });
  const buffer = await blob.arrayBuffer();
  return { mimeType: RENDER_MIME, data: base64Of(new Uint8Array(buffer)) };
}

function base64Of(bytes: Uint8Array): string {
  let binary = '';
  // 分片拼接：一次性 apply 几 MB 会撞 call stack 上限
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/**
 * 页面上的图像对象有多大——只量面积占比，**不抠图**。
 *
 * 抠出来要处理裁剪、蒙版、色彩空间、CMYK 分色，做错了就是给模型一张废图；
 * 而真正要回答的问题只有一个：这一页值不值得多烧一次多模态请求（FR-22.7）。
 * 面积的账在 `imageAreaRatios()` 里算，那边不碰 pdfjs 因而可以直接测。
 */
async function pageImages(page: pdfjs.PDFPageProxy): Promise<readonly PdfPageImage[]> {
  const viewport = page.getViewport({ scale: 1 });
  const operators = await page.getOperatorList();
  return imageAreaRatios(operators, pdfjs.OPS, viewport.width * viewport.height).map((areaRatio) => ({ areaRatio }));
}

/**
 * 逐页读 PDF（0.21.0 分册 22 FR-22.1）。
 *
 * 句柄式而不是一次性读完：38MB 的 PDF 一次全渲成图是几百兆内存，
 * 而模型通常读几页就够了。`close()` 由工具侧在 `finally` 里保证调用。
 */
export const pdfDocumentReader: PdfDocumentReader = {
  async open(bytes: Uint8Array): Promise<PdfDocumentHandle> {
    const loadingTask = pdfjs.getDocument(documentOptions(bytes));
    const doc = await loadingTask.promise;
    const page = (index: number) => doc.getPage(index + 1);
    return {
      pageCount: doc.numPages,
      text: async (index: number) => pageText((await (await page(index)).getTextContent()).items),
      images: async (index: number) => pageImages(await page(index)),
      render: async (index: number) => renderPage(await page(index)),
      close: async () => {
        await loadingTask.destroy();
      }
    };
  }
};

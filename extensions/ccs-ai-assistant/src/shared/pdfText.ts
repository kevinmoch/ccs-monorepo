import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import type { PdfTextExtractor } from '@webskill/runtime';

/**
 * PDF 文本抽取（分册 17 D-17-3）。
 *
 * pdfjs 只装在**扩展**里，不进 SDK：它带着自己的 worker、字体表和 CMap，
 * 打包进 `@webskill/browser` 会让每个只想读 DOM 的使用方都背上这几 MB。
 * SDK 侧留的是 `pdfExtractor` 注入口，宿主想要就自己接。
 */
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

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

export const extractPdfText: PdfTextExtractor = async (bytes: Uint8Array): Promise<string> => {
  // pdfjs 会**转移**（detach）传进去的 buffer；不拷贝的话调用方手里的 bytes 会变成长度 0，
  // 而失败时它可能还要重试或留痕
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(bytes) });
  const doc = await loadingTask.promise;
  try {
    const pages: string[] = [];
    for (let index = 1; index <= doc.numPages; index += 1) {
      const page = await doc.getPage(index);
      const content = await page.getTextContent();
      const lines: string[] = [];
      let lastY: number | undefined;
      let current = '';
      for (const raw of content.items) {
        const item = raw as unknown as TextItem;
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
      pages.push(lines.join('\n'));
    }
    return pages.join('\n\n');
  } finally {
    // 不销毁就把 worker 和整份页面缓存留在内存里；side panel 是长驻的
    await loadingTask.destroy();
  }
};

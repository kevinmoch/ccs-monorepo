/**
 * 导出按钮的装配（0.21.0 分册 15 FR-15.7 ~ FR-15.9 / 设计分册 16 §6）。
 *
 * 判定与编码都在别的文件里，这里只做三件事：决定按钮出不出现、把字节递给浏览器、
 * 把结果如实说给用户听。
 */

import { WebSkillError } from '@webskill/core';
import { VIEWER_COMPONENT_ATTR } from '@webskill/ui';
import type { ViewerNotice } from '../toast';
import { encodeDocx } from './docx';
import { extractExportDoc, type ChartImage } from './extract';
import { sanitizeExportFilename } from './filename';
import { classifyExportKind, exportRootOf, type ExportKind } from './kind';
import { describeOmissions } from './omissions';

export interface ExportUi {
  button: HTMLButtonElement;
  label: HTMLElement;
  /** 结果说给谁听。这里只管说什么，收不收起是提示条自己的事 */
  notice: ViewerNotice;
  /** 活 DOM 的根。导出读的是投放时那份 HTML，只有图表画布必须从活节点上取 */
  live?: ParentNode;
}

const TEXT = {
  idle: { pptx: { zh: '导出 PPTX', en: 'Export PPTX' }, docx: { zh: '导出 DOCX', en: 'Export DOCX' } },
  busy: { zh: '导出中…', en: 'Exporting…' }
} as const;

/** 每次投放新文档都重装一次；旧的监听随 controller 一起断掉 */
let active: AbortController | undefined;

export function setupViewerExport(pristineHtml: string, ui: ExportUi, zh: boolean): void {
  active?.abort();
  ui.notice.show('');
  ui.button.disabled = false;

  const kind = classifyExportKind(exportRootOf(new DOMParser().parseFromString(pristineHtml, 'text/html')));
  if (kind === 'none') {
    ui.button.hidden = true;
    return;
  }

  const idle = TEXT.idle[kind][zh ? 'zh' : 'en'];
  ui.button.hidden = false;
  ui.label.textContent = idle;
  ui.button.title = idle;
  ui.button.setAttribute('aria-label', idle);

  const controller = new AbortController();
  active = controller;
  ui.button.addEventListener('click', () => void run(pristineHtml, kind, ui, zh, idle), { signal: controller.signal });
}

async function run(
  html: string,
  kind: Exclude<ExportKind, 'none'>,
  ui: ExportUi,
  zh: boolean,
  idle: string
): Promise<void> {
  ui.button.disabled = true;
  ui.label.textContent = TEXT.busy[zh ? 'zh' : 'en'];
  ui.notice.show('');
  try {
    const doc = extractExportDoc(html, { chartImages: chartImagesOf(ui.live) });
    // 编码器按需加载：不点导出的人不该为 1.5 MB 的 OOXML 库付一次下载
    const encoded = kind === 'pptx' ? await (await import('./pptx')).encodePptx(doc) : await encodeDocx(doc);
    const filename = sanitizeExportFilename(doc.title, kind);
    downloadBlob(encoded.blob, filename);
    const lines = [
      zh ? `已生成 ${filename}。` : `Generated ${filename}.`,
      describeOmissions(encoded.omissions, zh)
    ].filter((line) => line !== '');
    ui.notice.show(lines.join(' '));
  } catch (error) {
    ui.notice.show(failureLine(error, zh));
  } finally {
    ui.button.disabled = false;
    ui.label.textContent = idle;
  }
}

/**
 * 三个刻意的决定：
 * 1. 不 `appendChild`——不入 DOM 也能触发，入了反而要在技能文档里塞一个临时节点；
 * 2. 延后 revoke——立刻 revoke 会在慢机器上撤掉还没读完的 blob；
 * 3. 这里**只知道自己发起了下载**。sandbox 页拿不到下载结果，
 *    所以调用方永远只能说「已生成」，不能说「已下载」（FR-15.9 第 4 条）。
 */
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * 屏幕上每张图表画布的快照，按文档顺序。
 *
 * 这是整条导出链路里**唯一**读活 DOM 的地方，因为图只存在于画布里，
 * 投放时那份 HTML 上只有一个空占位。取不到就返回空位，编码器自会降级成数据表。
 */
function chartImagesOf(live: ParentNode | undefined): ChartImage[] {
  if (!live) return [];
  const out: ChartImage[] = [];
  for (const node of Array.from(live.querySelectorAll(`[${VIEWER_COMPONENT_ATTR}="Chart"]`))) {
    const canvas = node.querySelector('canvas');
    if (!canvas || canvas.width === 0 || canvas.height === 0) {
      out.push({ url: '', width: 0, height: 0 });
      continue;
    }
    try {
      out.push({ url: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height });
    } catch {
      // 画布被污染就取不出像素；这不是错误，降级成数据表即可
      out.push({ url: '', width: 0, height: 0 });
    }
  }
  return out;
}

function failureLine(error: unknown, zh: boolean): string {
  const code = error instanceof WebSkillError ? error.code : 'EXPORT_FAILED';
  const message = error instanceof Error ? error.message : String(error);
  return zh ? `导出失败（${code}）：${message}` : `Export failed (${code}): ${message}`;
}

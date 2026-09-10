// @vitest-environment jsdom
/**
 * viewer 顶部悬浮提示的收起行为。
 *
 * 提示条本身没有业务逻辑，值得测的只有「会不会收起」：不收起就等于把一句长文案
 * 永久钉在文档顶上，而这一页是要投屏给人看的。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createViewerToast, VIEWER_TOAST_MS, type ViewerToastUi } from '../src/viewer/toast';

function mount(): ViewerToastUi {
  document.body.innerHTML = `
    <div id="viewer-toast" hidden>
      <p id="viewer-export-note"></p>
      <button id="viewer-toast-close" type="button">×</button>
    </div>`;
  return {
    root: document.getElementById('viewer-toast') as HTMLElement,
    body: document.getElementById('viewer-export-note') as HTMLElement,
    close: document.getElementById('viewer-toast-close') as HTMLButtonElement
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('viewer 顶部提示', () => {
  it('说了话就露出来，五秒后自己收起', () => {
    const ui = mount();
    const notice = createViewerToast(ui);

    notice.show('已生成 Sprint review.pptx。');
    expect(ui.root.hidden).toBe(false);
    expect(ui.body.textContent).toBe('已生成 Sprint review.pptx。');

    vi.advanceTimersByTime(VIEWER_TOAST_MS - 1);
    expect(ui.root.hidden).toBe(false);

    vi.advanceTimersByTime(1);
    expect(ui.root.hidden).toBe(true);
    // 文字一并清掉：留着的话读屏软件还能读到上一次的回执
    expect(ui.body.textContent).toBe('');
  });

  it('点 × 立刻收起，且不会再被残留的计时器动一次', () => {
    const ui = mount();
    const notice = createViewerToast(ui);

    notice.show('导出失败（EXPORT_FAILED）：没有可导出的内容。');
    ui.close.click();
    expect(ui.root.hidden).toBe(true);

    notice.show('已生成 Annual inspection notice.docx。');
    vi.advanceTimersByTime(VIEWER_TOAST_MS - 1);
    expect(ui.root.hidden).toBe(false);
  });

  it('第二条消息重新计时，不被第一条的旧计时器提前掐掉', () => {
    const ui = mount();
    const notice = createViewerToast(ui);

    notice.show('导出中…的第一条');
    vi.advanceTimersByTime(VIEWER_TOAST_MS - 500);
    notice.show('第二条');

    vi.advanceTimersByTime(500);
    expect(ui.root.hidden).toBe(false);
    expect(ui.body.textContent).toBe('第二条');

    vi.advanceTimersByTime(VIEWER_TOAST_MS);
    expect(ui.root.hidden).toBe(true);
  });

  it('空串等于收起——投放新文档时用它清掉上一份的回执', () => {
    const ui = mount();
    const notice = createViewerToast(ui);

    notice.show('上一份文档的回执');
    notice.show('');
    expect(ui.root.hidden).toBe(true);
    expect(ui.body.textContent).toBe('');
  });
});

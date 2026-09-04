import { startViewerShell, watchBlockedResources } from '@webskill/browser';
import { mountViewerComponents, type ViewerComponentsHandle } from '@webskill/ui';
import type { SlideDeckHandle, SlideView } from './viewerSlides';

/**
 * 扩展侧的文档 viewer 外壳（0.15.0 分册 13 FR-13.7）。
 *
 * 与站点那张页面**同构**——不同构就没有验证到「同一份技能在两个宿主里长得一样」，
 * 而那正是本册要证明的东西。
 *
 * 这一页在 `manifest.json` 的 `sandbox.pages` 里，因此跑在 opaque origin：
 * 拿不到 `chrome.*`，也读不到侧栏的存储。外壳只经 `postMessage` 收文档，
 * 那是分册 18 的既有握手，不需要任何扩展 API。
 */

const mustFind = (id: string): HTMLElement => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`viewer shell is missing #${id}`);
  return el;
};
const content = mustFind('viewer-content');
const style = mustFind('viewer-skill-style');
const blocked = mustFind('viewer-blocked');

// 必须在文档写入**之前**就挂上：CSP 违规事件不补发，晚一步就永远收不到
watchBlockedResources(window, blocked);

/**
 * 界面语言。这一页读不到扩展存储（opaque origin，没有 `chrome.*`），
 * 语言只能由投放方随地址带过来——`assembly.ts` 每次投放时现读现拼，
 * 用户在控制台里换了语言，下一份文档就跟着变。
 */
const zh = new URLSearchParams(location.search).get('lang') !== 'en';
document.documentElement.lang = zh ? 'zh-CN' : 'en';
mustFind('viewer-print-label').textContent = zh ? '打印' : 'Print';
for (const [id, label] of [
  ['viewer-chrome-hide', zh ? '隐藏工具条' : 'Hide the toolbar'],
  ['viewer-chrome-restore', zh ? '显示打印按钮' : 'Show the print button']
] as const) {
  const button = mustFind(id);
  button.setAttribute('aria-label', label);
  button.title = label;
}

let components: ViewerComponentsHandle | undefined;
let deck: SlideDeckHandle | undefined;
/** 投放时的原样 HTML：reveal 的打印版式会不可逆地改写 DOM，还原只能靠整篇重挂 */
let pristine = '';

startViewerShell(window, { content, style }, () => {
  pristine = content.innerHTML;
  void mount(null, false);
});

/**
 * 挂载一份文档。`restore` 为真时先把 DOM 写回投放时的原样——打印切换版式要用；
 * 刚投放的那一次不需要，白写一遍就是白解析一遍。
 */
async function mount(view: SlideView, restore: boolean): Promise<void> {
  // 每份文档重挂一次：旧实例不释放会连同 canvas 一起泄漏
  components?.dispose();
  deck?.dispose();
  deck = undefined;
  if (restore) content.innerHTML = pristine;
  applyDocumentChrome();
  // 图表画布文字（canvas，CSS 够不到）：产物声明 data-viewer-chart-font="lg" 时调大到投屏可读。
  // 偏好从**产物**读而不是 URL——入口统一成 SDK 内置的 `OpenDocument` 之后 viewer 地址只有一个，
  // 带不了「这一份怎么看」的信息；站点那一侧是同一份读法，同一份技能才会长得一样
  const fontSizes = docPref('viewerChartFont') === 'lg' ? { title: 16, axisLabel: 14, legend: 14 } : undefined;
  // 文档 HTML 里 data-webskill-component 占位 → 宿主预置组件（Chart/Table/Metric/Gauge/KeyValue 白名单）
  components = mountViewerComponents(content, fontSizes ? { fontSizes } : undefined);

  // reveal 只在幻灯片文档里加载：通报公文 / 监控大屏一个字节都不会拉
  if (docPref('viewerMode') !== 'slides') return;
  const slides = await import('./viewerSlides');
  const root = content.querySelector<HTMLElement>(slides.SLIDE_ROOT_SELECTOR);
  if (root) deck = await slides.mountSlideDeck(root, view);
}

function docPref(key: string): string | undefined {
  return (content.querySelector<HTMLElement>('[data-viewer-chrome], [data-viewer-chart-font], [data-viewer-mode]')
    ?.dataset ?? {})[key];
}

window.addEventListener('pagehide', () => {
  components?.dispose();
  deck?.dispose();
});

// 打印入口；manifest 的 sandbox CSP 带 allow-modals，window.print() 才不会被静默吞掉
mustFind('viewer-print').addEventListener('click', () => void printDocument());

/**
 * 幻灯片必须先切到 reveal 的分页版式，否则导出的 PDF 只有当前这一页。
 * 该版式是单向的（reveal 自己没有反向操作），所以打印完整篇重挂回普通视图。
 */
async function printDocument(): Promise<void> {
  if (!deck) {
    window.print();
    return;
  }
  const { settleCharts } = await import('./viewerSlides');
  await mount('print', true);
  await settleCharts();
  window.print();
  await mount(null, true);
}

// 投屏场景：右上角胶囊可整条隐藏，角落留小圆钮恢复；
// 产物声明 data-viewer-chrome="hidden"（监控大屏这类纯展示投放面）时初始即隐藏，只留恢复钮
const chromeBar = mustFind('viewer-chrome');
const chromeRestore = mustFind('viewer-chrome-restore');
// 用 hidden 属性而不是内联 style.display：内联声明压得过 view.html 里那条
// `@media print`，而胶囊是 fixed 的——压不住就会印在每一页的右上角
const hideChrome = (): void => {
  chromeBar.hidden = true;
  chromeRestore.hidden = false;
};
const showChrome = (): void => {
  chromeBar.hidden = false;
  chromeRestore.hidden = true;
};
mustFind('viewer-chrome-hide').addEventListener('click', hideChrome);
chromeRestore.addEventListener('click', showChrome);

// 同一个窗口会被复投第二份文档，不重置的话上一份的隐藏状态会粘住
function applyDocumentChrome(): void {
  if (docPref('viewerChrome') === 'hidden') hideChrome();
  else showChrome();
}

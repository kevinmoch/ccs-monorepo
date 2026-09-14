// @vitest-environment jsdom
/**
 * 幻灯片翻页箭头的取色。
 *
 * reveal 的核心 CSS 把 `.controls` 写死成 `color: #000`，而外壳只引核心 CSS、
 * 不引任何主题 CSS（版式归技能管）。深色版式上那两个箭头因此是一团看不见的黑，
 * 而它们是**唯一**的鼠标翻页入口——看不见等于这份投放只能用键盘翻。
 */
import { describe, expect, it } from 'vitest';
import { tintControls } from '../src/viewer/viewerSlides';

function deck(): HTMLElement {
  document.body.innerHTML = '<div class="reveal"><div class="controls"></div></div>';
  return document.querySelector('.reveal') as HTMLElement;
}

const arrowColor = (root: HTMLElement): string => root.querySelector<HTMLElement>('.controls')!.style.color;

describe('翻页箭头跟着舞台底色走', () => {
  it('深色版式 → 浅色箭头', () => {
    const root = deck();
    tintControls(root, 'rgb(26, 26, 46)');
    expect(arrowColor(root)).toBe('rgb(245, 245, 245)');
  });

  it('浅色版式 → 深色箭头', () => {
    const root = deck();
    tintControls(root, 'rgb(255, 255, 255)');
    expect(arrowColor(root)).toBe('rgb(25, 25, 25)');
  });

  it('带 alpha 的记法照样读得出来', () => {
    const root = deck();
    tintControls(root, 'rgba(17, 24, 39, 0.95)');
    expect(arrowColor(root)).toBe('rgb(245, 245, 245)');
  });

  /**
   * 绿色对人眼最亮：`rgb(0, 200, 0)` 的等权平均只有 0.26（会被判成深底，配浅箭头），
   * 而它实际亮得刺眼，必须配深箭头。这条守的就是「别用等权平均」。
   */
  it('饱和绿底按人眼亮度算，判为浅底', () => {
    const root = deck();
    tintControls(root, 'rgb(0, 200, 0)');
    expect(arrowColor(root)).toBe('rgb(25, 25, 25)');
  });

  it('取不到舞台底色就不动它：那种情况下舞台是浏览器白底，黑箭头本来就对', () => {
    const root = deck();
    tintControls(root, undefined);
    expect(arrowColor(root)).toBe('');
  });
});

// @vitest-environment jsdom
/**
 * 投放面左上角那一行文件名（0.22.0 分册 34，AC-34.8 / AC-34.9）。
 *
 * 走的是真的 `createExtensionDwgHost().project(...)`，只把投放面换成一个记账用的假体，
 * 拿到真实吐出的 HTML 再用 DOM 解析——比对着源码字符串找关键字扎实得多：
 * 关键字挪个位置、跑到注释里、被 `hidden` 罩住，字符串匹配全都发现不了。
 */

import { describe, expect, it } from 'vitest';
import { createExtensionDwgHost } from '../src/shared/dwgHost';

interface Opened {
  skillName: string;
  document: { html: string; css: string; data: unknown };
}

const DOC = {
  version: 'AC1018',
  layers: [{ name: 'WALL', color: 'currentColor', visible: true }],
  entities: [],
  bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 },
  omissions: [],
  views: []
} as never;

/** 投放一次，把吐出来的 HTML 解析成文档 */
async function render(
  input: { title: string; fileName?: string },
  locale: 'zh' | 'en' = 'zh'
): Promise<{ dom: Document; css: string; opened: Opened }> {
  let opened: Opened | undefined;
  const host = createExtensionDwgHost({
    locale: () => locale,
    surface: () =>
      ({
        open: (request: Opened) => {
          opened = request;
          return Promise.resolve();
        }
      }) as never
  });
  await host.project({ drawings: [{ ...input, document: DOC }] });
  if (opened === undefined) throw new Error('surface was never opened');
  const dom = new DOMParser().parseFromString(opened.document.html, 'text/html');
  return { dom, css: opened.document.css, opened };
}

describe('面板顶部的文件名行（AC-34.8）', () => {
  it('文件名排在标签栏之上，而不是挤进某一页里', async () => {
    const { dom } = await render({ title: 'doc-a1b2c3', fileName: '大堂平面图.dwg' });
    const file = dom.querySelector('#dwg-file');
    const tabs = dom.querySelector('#dwg-tabs');
    expect(file?.textContent).toBe('大堂平面图.dwg');
    expect(file?.parentElement?.id).toBe('dwg-panel');
    // 位掩码 4 = DOCUMENT_POSITION_FOLLOWING：标签栏在文件名之后
    expect(file!.compareDocumentPosition(tabs!) & 4).toBe(4);
  });

  it('完整文件名进 title，截断后悬停仍看得全', async () => {
    const long = `${'走廊立面'.repeat(12)}.dwg`;
    const { dom } = await render({ title: 'doc-a1b2c3', fileName: long });
    expect(dom.querySelector('#dwg-file')?.getAttribute('title')).toBe(long);
  });

  it('取不到文件名时说「图纸」，不拿取件号冒充', async () => {
    const zh = await render({ title: 'doc-a1b2c3' });
    expect(zh.dom.querySelector('#dwg-file')?.textContent).toBe('图纸');
    expect(zh.dom.querySelector('#dwg-panel')?.textContent).not.toContain('doc-a1b2c3');

    const en = await render({ title: 'doc-a1b2c3' }, 'en');
    expect(en.dom.querySelector('#dwg-file')?.textContent).toBe('Drawing');
  });

  it('样式上单行不折，靠省略号收尾', async () => {
    const { css } = await render({ title: 'doc-a1b2c3', fileName: 'a.dwg' });
    const rule = /\.dwg-file\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(rule).toContain('white-space: nowrap');
    expect(rule).toContain('text-overflow: ellipsis');
    expect(rule).toContain('overflow: hidden');
  });

  it('文件名同样要转义，不能让图纸名把面板注入掉', async () => {
    const { dom, opened } = await render({
      title: 'doc-a1b2c3',
      fileName: '<img src=x onerror=alert(1)>.dwg'
    });
    expect(opened.document.html).not.toContain('<img src=x');
    expect(dom.querySelectorAll('#dwg-panel img')).toHaveLength(0);
    expect(dom.querySelector('#dwg-file')?.textContent).toBe('<img src=x onerror=alert(1)>.dwg');
  });
});

describe('属性页收敛（AC-34.9）', () => {
  it('标题与文件名都搬走了，只剩二维视图说明与适应窗口', async () => {
    const { dom } = await render({ title: 'doc-a1b2c3', fileName: '大堂平面图.dwg' });
    const props = dom.querySelector('#dwg-page-props')!;
    expect(props.querySelector('h2')).toBeNull();
    expect(props.textContent).not.toContain('大堂平面图.dwg');
    expect(props.textContent).toContain('二维视图');
    expect(props.querySelector('#dwg-fit')).not.toBeNull();
  });

  it('告警仍旧落在属性页里，没跟着标题一起被删掉', async () => {
    let opened: Opened | undefined;
    const host = createExtensionDwgHost({
      locale: () => 'zh',
      surface: () =>
        ({
          open: (request: Opened) => {
            opened = request;
            return Promise.resolve();
          }
        }) as never
    });
    await host.project({
      drawings: [
        {
          title: 'doc-a1b2c3',
          document: {
            ...(DOC as unknown as Record<string, unknown>),
            omissions: [{ reason: 'acis-not-tessellated', severity: 'dropped', count: 3 }]
          } as never
        }
      ]
    });
    const dom = new DOMParser().parseFromString(opened!.document.html, 'text/html');
    expect(dom.querySelector('#dwg-page-props')?.textContent).toContain('3');
    expect(dom.querySelector('#dwg-page-props')?.textContent).toContain('ACIS');
  });
});

describe('分页只剩三站（AC-34.7）', () => {
  it('对比标签与对比页在 HTML 里彻底不存在', async () => {
    const { dom } = await render({ title: 'doc-a1b2c3', fileName: 'a.dwg' });
    const ids = [...dom.querySelectorAll('#dwg-tabs button')].map((el) => el.id);
    expect(ids).toEqual(['dwg-tab-views', 'dwg-tab-layers', 'dwg-tab-props']);
    expect(dom.querySelector('#dwg-page-diff')).toBeNull();
    expect(dom.querySelector('#dwg-legend')).toBeNull();
    expect(dom.querySelector('#dwg-rational')).toBeNull();
    expect(dom.querySelector('#dwg-annotations')).toBeNull();
    expect(dom.querySelector('#dwg-gl')).toBeNull();
  });
});

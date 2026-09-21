// @vitest-environment jsdom
/**
 * 站点白名单被拦下之后的「说清楚」这一半。
 *
 * 拦住是 tabBinding 的事（见 tabBinding.test.ts），这里验的是两条话术：
 * 给模型的英文说明必须点名域名与允许清单，否则模型只会反复重试；
 * 给用户的界面提示必须双语、且被拦时才存在。
 */
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { describeSiteBlock, siteBlockNotice } from '../src/shared/siteBlock';
import { SiteBlockNotice } from '../src/sidepanel/SiteBlockNotice';
import type { TabBindingPort } from '../src/shared/tabBinding';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const BLOCKED = { lost: false, bindable: false, blockedUrl: 'https://evil.example.org/x' } as const;
const OK = { lost: false, bindable: true, url: 'https://a.example.com/' } as const;

function port(snapshot: TabBindingPort extends { snapshot: () => infer S } ? S : never): TabBindingPort {
  return {
    snapshot: () => snapshot,
    tabId: () => undefined,
    origin: () => undefined,
    bindActiveTab: async () => undefined,
    subscribe: () => () => undefined
  } as TabBindingPort;
}

let root: Root | undefined;
let container: HTMLElement | undefined;

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  window.localStorage.clear();
});

function render(node: ReturnType<typeof createElement>): HTMLElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(node));
  return container;
}

describe('describeSiteBlock（给模型的说明）', () => {
  it('没被拦时返回 undefined，让调用方沿用它原本的措辞', () => {
    expect(describeSiteBlock(OK, ['a.example.com'])).toBeUndefined();
  });

  it('被拦时点名域名与允许清单，并说明「不读也不操作」——只说失败会让模型一直重试', () => {
    const message = describeSiteBlock(BLOCKED, ['a.example.com', '*.kdocs.cn'])!;
    expect(message).toContain('evil.example.org');
    expect(message).toContain('allowlist');
    expect(message).toContain('a.example.com, *.kdocs.cn');
    expect(message.toLowerCase()).toContain('will not read or act');
    // 不能退化成「切个标签页试试」：切到哪一页都没用，原因不在标签页
    expect(message).not.toContain('Switch to the tab');
  });
});

describe('siteBlockNotice（给用户的提示）', () => {
  it('没被拦时不存在', () => {
    expect(siteBlockNotice(OK, 'zh')).toBeUndefined();
    expect(siteBlockNotice(OK, 'en')).toBeUndefined();
  });

  it('中英两份都点名域名，且互不相同', () => {
    const zh = siteBlockNotice(BLOCKED, 'zh')!;
    const en = siteBlockNotice(BLOCKED, 'en')!;
    expect(zh).toContain('evil.example.org');
    expect(en).toContain('evil.example.org');
    expect(zh).not.toBe(en);
    // 中文那份不能夹带英文句子，反之亦然
    expect(en).not.toMatch(/[\u4e00-\u9fa5]/);
    expect(zh).toMatch(/[\u4e00-\u9fa5]/);
  });
});

describe('SiteBlockNotice 组件', () => {
  it('没被拦时整个不渲染，而不是留一条隐藏的空条', () => {
    const el = render(createElement(SiteBlockNotice, { port: port(OK), locale: 'zh' }));
    expect(el.querySelector('[data-testid="site-block-notice"]')).toBeNull();
  });

  it('被拦时渲染提示条，文案随语言走', () => {
    const el = render(createElement(SiteBlockNotice, { port: port(BLOCKED), locale: 'en' }));
    const notice = el.querySelector('[data-testid="site-block-notice"]')!;
    expect(notice.textContent).toBe(siteBlockNotice(BLOCKED, 'en'));
  });

  it('只用语义色 token：写死颜色在暗色主题下就是一块白斑', () => {
    const el = render(createElement(SiteBlockNotice, { port: port(BLOCKED), locale: 'zh' }));
    const cls = el.querySelector('[data-testid="site-block-notice"]')!.className;
    expect(cls).not.toMatch(/\b(bg|text|border)-(white|black|gray|red|slate|zinc)-?\d*\b/);
    expect(cls).toContain('border-border');
  });
});

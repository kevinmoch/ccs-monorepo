// @vitest-environment jsdom
/**
 * 判型（0.21.0 分册 15 FR-15.7 / 设计分册 16 §6.1）。
 *
 * 第二条用例是「完备性」：内置技能目录里多一个技能，这里就必须多一行判型，
 * 否则新技能会顺着缺省悄悄走进 DOCX，或者悄悄失去按钮。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BUILTIN_EXPORT_KIND, classifyExportKind, exportRootOf } from '../src/viewer/export/kind';

const BUILTIN_DIR = resolve(import.meta.dirname, '../skills/builtin');

const rootOf = (html: string): Element | null => exportRootOf(new DOMParser().parseFromString(html, 'text/html'));

describe('classifyExportKind', () => {
  it('幻灯片根节点 → pptx', () => {
    expect(classifyExportKind(rootOf('<div data-viewer-mode="slides"><div class="slides"></div></div>'))).toBe('pptx');
  });

  it('没有任何根节点标记 → docx（公文类技能就长这样）', () => {
    expect(classifyExportKind(rootOf('<div class="bulletin"><h1>通告</h1></div>'))).toBe('docx');
  });

  it('监控大屏（data-viewer-chrome）→ none', () => {
    expect(classifyExportKind(rootOf('<div data-viewer-chrome="hidden"></div>'))).toBe('none');
  });

  it('未知的新版式不许顺着缺省走进 DOCX', () => {
    expect(classifyExportKind(rootOf('<div data-viewer-mode="poster"></div>'))).toBe('none');
  });

  it('结构化投放的根节点标记优先于旧的版式标记', () => {
    expect(classifyExportKind(rootOf('<div data-webskill-doc="document"></div>'))).toBe('docx');
    expect(classifyExportKind(rootOf('<div data-webskill-doc="deck" data-viewer-mode="slides"></div>'))).toBe('pptx');
    expect(classifyExportKind(rootOf('<div data-webskill-doc="poster"></div>'))).toBe('none');
  });

  it('空文档 → none', () => {
    expect(classifyExportKind(rootOf(''))).toBe('none');
  });
});

describe('内置技能的判型', () => {
  const skills = readdirSync(BUILTIN_DIR).filter((name) => statSync(resolve(BUILTIN_DIR, name)).isDirectory());

  it('每个内置技能都在判型表里有一行', () => {
    expect([...skills].sort()).toEqual(Object.keys(BUILTIN_EXPORT_KIND).sort());
  });

  it.each(skills)('%s 的判型与它 publish.js 落到根节点上的标记一致', (name) => {
    // 判据取自**发布时真的写出去 / 真的强制校验**的那几条正则，不是 references 里的散文描述
    const publish = readFileSync(resolve(BUILTIN_DIR, name, 'scripts/publish.js'), 'utf8');
    const root = document.createElement('div');
    const authored = /data-webskill-doc="(document|deck)"/.exec(publish);
    if (authored) root.setAttribute('data-webskill-doc', authored[1] as string);
    if (/data-viewer-mode[^\n]*slides/.test(publish)) root.setAttribute('data-viewer-mode', 'slides');
    if (/data-viewer-chrome[^\n]*hidden/.test(publish)) root.setAttribute('data-viewer-chrome', 'hidden');
    expect(classifyExportKind(root)).toBe(BUILTIN_EXPORT_KIND[name as keyof typeof BUILTIN_EXPORT_KIND]);
  });
});

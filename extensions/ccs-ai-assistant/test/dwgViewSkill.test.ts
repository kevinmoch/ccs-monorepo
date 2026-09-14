/**
 * 编排型内置技能的文本守卫（0.22.0 分册 19 FR-19.13，分册 34 FR-34.7）。
 *
 * 技能是「写给模型看的一份文档」，它的行为约束落不到类型系统上，
 * 只能在这里钉住：目录形态、三条输入通路、以及那条最容易被违反的「不编造图上内容」。
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SKILL_DIR = resolve(import.meta.dirname, '../skills/builtin/dwg-view');
const TEXT = readFileSync(resolve(SKILL_DIR, 'SKILL.md'), 'utf8');

describe('dwg-view 技能的形态', () => {
  it('目录里只有 SKILL.md，没有 scripts/', () => {
    // 不是漏了：脚本沙箱没有调用其他工具的出口，图纸几何也刻意不进模型上下文，
    // 所以这个技能能做的只有编排。多出一个 scripts/ 就说明有人试图绕开这两条约束
    expect(readdirSync(SKILL_DIR)).toEqual(['SKILL.md']);
    expect(existsSync(resolve(SKILL_DIR, 'scripts'))).toBe(false);
  });

  it('frontmatter 的 name 与目录名一致，否则技能库里认不出它', () => {
    expect(/^---\nname: dwg-view\n/.test(TEXT)).toBe(true);
  });

  it('description 带得动路由：用户不会说「DWG」，只会说「打开这张图」', () => {
    const description = /\ndescription: (.+)\n/.exec(TEXT)?.[1] ?? '';
    expect(description).toContain('DWG');
    expect(description).toMatch(/图纸/);
    expect(description).toMatch(/看图|打开/);
  });
});

describe('dwg-view 技能的口径', () => {
  it('三条输入通路一条不少——否则模型会以为只有附件能用', () => {
    expect(TEXT).toMatch(/下载/);
    expect(TEXT).toMatch(/附件/);
    expect(TEXT).toContain('read_linked_document');
  });

  it('明确不许编造图上的内容：工具只回摘要，模型手上根本没有几何', () => {
    expect(TEXT).toContain('不要编造图上的内容');
  });

  it('把「画得不准」与「压根没画」分开说（AC-23.6 的模型侧对应物）', () => {
    expect(TEXT).toContain('approximated');
    expect(TEXT).toContain('notDrawn');
    expect(TEXT).toContain('ACIS');
  });

  it('交代查看器的入口：视图 / 图层 / 量测，用户才知道下一步点哪儿', () => {
    expect(TEXT).toMatch(/视图/);
    expect(TEXT).toMatch(/图层/);
    expect(TEXT).toMatch(/量测/);
  });

  it('说清工具缺席时该怎么办：直说读不了，而不是改用别的工具硬凑', () => {
    expect(TEXT).toMatch(/没有 `view_dwg`/);
    expect(TEXT).toContain('read_document');
  });

  it('已经没有对比、三维、明细表的任何残留口径', () => {
    for (const gone of ['compare_dwg', 'export_dwg_diff', '明细表', '三维分层', '只看差异']) {
      expect(TEXT).not.toContain(gone);
    }
  });
});

describe('dwg-view 技能的口径（分册 36）', () => {
  it('写明两个 id 可以来自不同通道（AC-36.12）', () => {
    // 三条通道分点列着，读起来很像「一次只能走一条」。
    // 模型据此拒绝把「下载的这版」和「网页上挂的那版」放一起，是文档的锅不是模型的锅
    expect(TEXT).toContain('两个 id 不必来自同一条通道');
    expect(TEXT).toMatch(/下载列表.*页面链接|页面链接.*下载列表/);
  });

  it('写明对位与量测互相让位，不会同时开着（AC-36.3 的模型侧对应物）', () => {
    expect(TEXT).toMatch(/对位开着时.*量测会自动收起/);
    expect(TEXT).toMatch(/点任一个量测工具就退出对位/);
  });
});

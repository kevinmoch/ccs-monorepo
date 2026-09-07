import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseWebSkillConfig } from '@webskill/chatbot/config';
import * as uiKit from '@webskill/ui-kit';
import { parseManifestOverrides } from '../scripts/extensionConfig.mjs';

/**
 * 通用配置面的用例已经随实现迁到 `packages/chatbot/test/config.test.ts`。
 * 留在这里的只有两件扩展自己的事：MV3 的 `manifest` 覆写，以及本仓这份示例文件。
 */
describe('parseManifestOverrides', () => {
  it('accepts only Chrome-compatible manifest versions', () => {
    expect(parseManifestOverrides({ manifest: { version: '1.2.3.4' } }).version).toBe('1.2.3.4');
    expect(() => parseManifestOverrides({ manifest: { version: '1.2.3.4.5' } })).toThrow(/1 and 4 dot-separated/);
    expect(() => parseManifestOverrides({ manifest: { version: '1.01' } })).toThrow(/leading zeros/);
    expect(() => parseManifestOverrides({ manifest: { version: '1.70000' } })).toThrow(/0 and 65535/);
  });

  it('ignores the sections the SDK parser owns', () => {
    expect(parseManifestOverrides({ models: [], appearance: { theme: 'light' } })).toEqual({});
  });
});

describe('config.json', () => {
  const example = JSON.parse(readFileSync(resolve(import.meta.dirname, '../config.json'), 'utf8')) as Record<
    string,
    unknown
  >;

  // 出厂设置随仓库入库，所以这份文件本身就是宿主对着 Console 界面逐项核对的清单：
  // 漏一个字段就等于那一项「不可配」。模型定义与 apiKey 在 models.json 里，不入库，故不在此列
  it('is accepted by both the SDK parser and the manifest overrides', () => {
    expect(() => parseWebSkillConfig(example, { hostSections: ['manifest'] })).not.toThrow();
    expect(() => parseManifestOverrides(example)).not.toThrow();
  });
});

/**
 * 0.20.0 之前这个构建脚本抄了 12 组 SDK 枚举，靠一条守护测试逐个比对。
 * 现在整块校验搬进了 SDK，宿主只剩 manifest；这条断言防的是有人再抄回来。
 */
describe('the build script no longer mirrors SDK enums', () => {
  const source = readFileSync(resolve(import.meta.dirname, '../scripts/extensionConfig.mjs'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

  // 断言 uiKit 的导出里哪些是字符串枚举表，所以入口类型必须是 unknown：
  // 发布档下 `@webskill/ui-kit` 解析到本地垫片，导出类型收窄成具体元组的联合，
  // 类型谓词的目标类型就不再可赋值给它
  const enumTables = Object.entries(uiKit as Record<string, unknown>).filter(
    (entry): entry is [string, readonly string[]] =>
      entry[0].startsWith('RUNTIME_') &&
      Array.isArray(entry[1]) &&
      (entry[1] as unknown[]).every((value) => typeof value === 'string')
  );

  it('declares no array literal equal to an SDK enum', () => {
    // 不用数量阈值：`@webskill/ui-kit` 在仓内解析到工作区源码（十几组枚举），
    // 仓外落地形态解析到本地垫片（只有这一组）。这里要防的是采样为空导致守卫空转，
    // 点名一个两边都在的枚举才能同时满足「非空」与「不绑死环境」
    expect(enumTables.map(([name]) => name)).toContain('RUNTIME_RENDERER_IDS');
    const offences: string[] = [];
    for (const match of source.matchAll(/\[\s*((?:'[^']*'\s*,\s*)*'[^']*')\s*,?\s*\]/g)) {
      const literal = (match[1] as string).split(',').map((item) => item.trim().slice(1, -1));
      const asSet = [...literal].sort().join('|');
      for (const [name, values] of enumTables) {
        if (asSet === [...values].sort().join('|')) offences.push(`[${literal.join(', ')}] duplicates ${name}`);
      }
    }
    expect(offences).toEqual([]);
  });

  it('does not parse any RuntimeConfig section itself', () => {
    for (const section of ['models', 'agentRuntime', 'sandbox', 'appearance', 'privacy', 'quickPrompts']) {
      expect(source, `${section} must be parsed by @webskill/chatbot/config`).not.toContain(`'${section}'`);
    }
  });
});

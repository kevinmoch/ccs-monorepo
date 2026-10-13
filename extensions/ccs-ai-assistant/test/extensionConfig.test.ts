import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseWebSkillConfig } from '@webskill/chatbot/config';
import * as uiKit from '@webskill/ui-kit';
import { parseHostComponents, parseManifestOverrides } from '../scripts/extensionConfig.mjs';

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

  // 0.26.0 分册 16 · AC-16.1
  it('update_url：合法的 http(s) 地址原样通过，不写就没有这个键', () => {
    expect(parseManifestOverrides({ manifest: { update_url: 'https://u.test/webskill/updates.xml' } })).toEqual({
      update_url: 'https://u.test/webskill/updates.xml'
    });
    expect(parseManifestOverrides({ manifest: { update_url: 'http://localhost:8080/updates.xml' } })).toEqual({
      update_url: 'http://localhost:8080/updates.xml'
    });
    expect(parseManifestOverrides({ manifest: { name: 'X' } })).not.toHaveProperty('update_url');
  });

  it.each([
    ['不是字符串', 42, /manifest\.update_url must be a string/],
    ['空串', '  ', /manifest\.update_url must not be empty/],
    ['相对地址', '/updates.xml', /manifest\.update_url must be an absolute http\(s\) URL/],
    ['缺协议', 'u.test/updates.xml', /manifest\.update_url must be an absolute http\(s\) URL/],
    ['非 http(s) 协议', 'ftp://u.test/updates.xml', /manifest\.update_url must be an absolute http\(s\) URL/]
  ])('update_url %s：构建失败并指出字段路径', (_title, value, message) => {
    expect(() => parseManifestOverrides({ manifest: { update_url: value } })).toThrow(message);
  });

  it('表外的键仍被拒，提示里列出 update_url', () => {
    expect(() => parseManifestOverrides({ manifest: { key: 'x' } })).toThrow(
      /manifest\.key is not a recognized option \(allowed: name, version, description, update_url\)/
    );
  });
});

/**
 * 0.26.0 分册 14 · FR-14.26～14.29 / AC-14.21：`hostComponents` 分节的构建期解析。
 * 错误消息里的字段路径是契约——构建失败时人要靠它找到配置里写错的那一行。
 */
describe('parseHostComponents', () => {
  const wechat = {
    name: 'wechat',
    label: { zh: '微信', en: 'WeChat' },
    endpoint: 'http://localhost:3333/',
    tips: { zh: '请向小鲁班发送“获取发送token”', en: 'Ask XiaoLuban for the send token.' }
  };
  const parse = (...entries: unknown[]) => parseHostComponents({ hostComponents: entries });

  it('分节缺席或为空数组：没有组件', () => {
    expect(parseHostComponents({})).toEqual([]);
    expect(parseHostComponents({ hostComponents: [] })).toEqual([]);
    expect(parseHostComponents({ models: [], appearance: { theme: 'light' } })).toEqual([]);
  });

  it('一项完整配置：规范化后键与值原样，缺省键不出现', () => {
    const full = { ...wechat, description: 'Send a message to a WeChat receiver.', timeoutMs: 5000 };
    expect(parse(full)).toEqual([full]);
    const [minimal] = parse({ name: 'wechat', label: wechat.label, endpoint: wechat.endpoint });
    expect(Object.keys(minimal as object).sort()).toEqual(['endpoint', 'label', 'name']);
  });

  it('多个组件按配置顺序给出', () => {
    expect(parse(wechat, { ...wechat, name: 'dingtalk' }).map((entry: { name: string }) => entry.name)).toEqual([
      'wechat',
      'dingtalk'
    ]);
  });

  it.each([
    ['分节不是数组', { hostComponents: {} }, /hostComponents must be an array/],
    ['条目不是对象', { hostComponents: ['wechat'] }, /hostComponents\[0\] must be an object/],
    [
      '出现表外的键',
      { hostComponents: [{ ...wechat, fetch: 'x' }] },
      /hostComponents\[0\]\.fetch is not a recognized option/
    ],
    ['缺 name', { hostComponents: [{ ...wechat, name: undefined }] }, /hostComponents\[0\]\.name is required/],
    ['缺 label', { hostComponents: [{ ...wechat, label: undefined }] }, /hostComponents\[0\]\.label is required/],
    [
      '缺 endpoint',
      { hostComponents: [{ ...wechat, endpoint: undefined }] },
      /hostComponents\[0\]\.endpoint is required/
    ],
    [
      'label 写成单个字符串',
      { hostComponents: [{ ...wechat, label: 'WeChat' }] },
      /hostComponents\[0\]\.label must be an object/
    ],
    [
      'label 缺 zh',
      { hostComponents: [{ ...wechat, label: { en: 'WeChat' } }] },
      /hostComponents\[0\]\.label\.zh is required/
    ],
    [
      'tips 的 en 是空串',
      { hostComponents: [{ ...wechat, tips: { zh: '提示', en: '  ' } }] },
      /hostComponents\[0\]\.tips\.en must not be empty/
    ],
    [
      'tips 里多一种语言',
      { hostComponents: [{ ...wechat, tips: { ...wechat.tips, fr: 'x' } }] },
      /hostComponents\[0\]\.tips\.fr is not a recognized option/
    ],
    [
      'endpoint 协议不是 http(s)',
      { hostComponents: [{ ...wechat, endpoint: 'ftp://example.com/' }] },
      /hostComponents\[0\]\.endpoint must be an absolute http\(s\) URL/
    ],
    [
      'endpoint 不是绝对地址',
      { hostComponents: [{ ...wechat, endpoint: '/send' }] },
      /hostComponents\[0\]\.endpoint must be an absolute http\(s\) URL/
    ],
    [
      'endpoint 缺协议',
      { hostComponents: [{ ...wechat, endpoint: 'localhost:3333' }] },
      /hostComponents\[0\]\.endpoint must be an absolute http\(s\) URL/
    ],
    [
      'timeoutMs 太小',
      { hostComponents: [{ ...wechat, timeoutMs: 999 }] },
      /hostComponents\[0\]\.timeoutMs must be an integer/
    ],
    [
      'timeoutMs 不是整数',
      { hostComponents: [{ ...wechat, timeoutMs: 1500.5 }] },
      /hostComponents\[0\]\.timeoutMs must be an integer/
    ],
    [
      'timeoutMs 是字符串',
      { hostComponents: [{ ...wechat, timeoutMs: '3000' }] },
      /hostComponents\[0\]\.timeoutMs must be an integer/
    ],
    [
      'description 是空串',
      { hostComponents: [{ ...wechat, description: '' }] },
      /hostComponents\[0\]\.description must not be empty/
    ],
    [
      '第二项出错时路径指向第二项',
      { hostComponents: [wechat, { ...wechat, name: 'dingtalk', endpoint: 'nope' }] },
      /hostComponents\[1\]\.endpoint/
    ]
  ])('%s：构建失败并指出字段路径', (_title, raw, message) => {
    expect(() => parseHostComponents(raw)).toThrow(message);
  });

  it('名字不合规：大写、含 __、以数字开头、超长、含连字符', () => {
    for (const name of ['WeChat', 'we__chat', '1wechat', 'x'.repeat(41), 'we-chat']) {
      expect(() => parse({ ...wechat, name }), name).toThrow(/hostComponents\[0\]\.name must match/);
    }
  });

  it('重名与更新凭据的工具名相撞都指向后一项', () => {
    expect(() => parse(wechat, wechat)).toThrow(/hostComponents\[1\].*"wechat".*hostComponents\[0\]/);
    expect(() => parse({ ...wechat, name: 'a' }, { ...wechat, name: 'a_update_credentials' })).toThrow(
      /hostComponents\[1\].*"a_update_credentials".*hostComponents\[0\]/
    );
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
    expect(() => parseWebSkillConfig(example, { hostSections: ['manifest', 'hostComponents'] })).not.toThrow();
    expect(() => parseManifestOverrides(example)).not.toThrow();
    expect(() => parseHostComponents(example)).not.toThrow();
  });

  // 入库的示例配置带自托管的 update_url（`pnpm chat` 在 /release 下托管）；
  // 0.26.0 AC-16.7「不配则 manifest 里没有这个键」由上面 parseManifestOverrides 的 update_url 用例覆盖
  it('入库的示例配置带自托管的 update_url，指向 updates.xml', () => {
    expect(parseManifestOverrides(example)).toHaveProperty(
      'update_url',
      expect.stringMatching(/\/release\/updates\.xml$/)
    );
  });

  // CCS 出厂配置不接宿主组件：上游示例里的 wechat 指向本机联调服务，不随 CCS 发布
  it('出厂配置不带 hostComponents：适配器上没有组件', () => {
    expect(parseHostComponents(example)).toEqual([]);
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

// @vitest-environment jsdom
// 本工程测的是已发布的 dist：@webskill/chatbot 的产物按浏览器条件打包（模块顶层即调 document），Node 环境 import 不进来
import { MemoryFS } from '@webskill/sdk';
import { MockLlmClient } from '@webskill/sdk/testing';
import { createHttpMessageComponent, ChatEngine } from '@webskill/chatbot';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseHostComponents } from '../scripts/extensionConfig.mjs';
import { createHostComponents } from '../src/shared/hostComponents';
import type { HostComponentEntry } from '../src/shared/hostComponents';

/**
 * 0.26.0 分册 14 · AC-14.22 / AC-14.23：config.json 的一项 → 一个宿主组件。
 */

const wechat: HostComponentEntry = {
  name: 'wechat',
  label: { zh: '微信', en: 'WeChat' },
  endpoint: 'http://localhost:3333/',
  tips: { zh: '请向小鲁班发送“获取发送token”', en: 'Ask XiaoLuban for the send token.' }
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AC-14.22 · 配置 → 组件', () => {
  it('名字、显示名、确认卡的目标主机、凭据字段的提示都来自配置', () => {
    const [component] = createHostComponents([{ ...wechat, endpoint: 'https://chat.example.com/send' }]);
    expect(component!.name).toBe('wechat');
    expect(component!.label).toEqual(wechat.label);
    expect(component!.confirm!({ receiver: 'alice', content: 'hi' })).toMatchObject({
      target: 'alice',
      endpoint: 'https://chat.example.com/send'
    });
    // 提示挂在凭据字段上：只有首次收集时才显示，由引擎决定
    expect(component!.credentials![0]!.tips).toEqual(wechat.tips);
  });

  it('没配的键不凭空出现：无 tips 就没有提示，无 description 用工厂的通用说明', () => {
    const [component] = createHostComponents([{ name: 'wechat', label: wechat.label, endpoint: wechat.endpoint }]);
    expect(component!.credentials![0]).not.toHaveProperty('tips');
    expect(component!.description).toContain('WeChat');
    const [custom] = createHostComponents([{ ...wechat, description: 'Send the summary to WeChat.' }]);
    expect(custom!.description).toBe('Send the summary to WeChat.');
  });

  it('timeoutMs 来自配置：超时后失败并写明秒数', async () => {
    // 永不返回、只响应取消的假 fetch：超时只能是配置里的 1 s，而不是缺省的 30 s
    vi.stubGlobal(
      'fetch',
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
        })
    );
    const [component] = createHostComponents([{ ...wechat, timeoutMs: 1000 }]);
    const outcome = await component!.invoke({ receiver: 'alice', content: 'hi' }, { credentials: { auth: 'token' } });
    expect(outcome).toMatchObject({ ok: false, detail: 'Timed out after 1 s' });
  });

  it('空列表：没有组件', () => {
    expect(createHostComponents([])).toEqual([]);
  });

  it('多个条目按配置顺序各出一个组件', () => {
    const names = createHostComponents([wechat, { ...wechat, name: 'dingtalk' }]).map((component) => component.name);
    expect(names).toEqual(['wechat', 'dingtalk']);
  });
});

describe('AC-14.23 · 构建期的名字判定与引擎一致', () => {
  const entryOf = (name: string) => ({ name, label: wechat.label, endpoint: wechat.endpoint });

  const parserAccepts = (names: string[]): boolean => {
    try {
      parseHostComponents({ hostComponents: names.map(entryOf) });
      return true;
    } catch {
      return false;
    }
  };

  const engineAccepts = (names: string[]): boolean => {
    try {
      new ChatEngine(
        {
          storage: new MemoryFS(),
          skillRoots: ['/skills'],
          navigation: { openConsole: () => undefined },
          components: names.map((name) => createHttpMessageComponent(entryOf(name)))
        },
        { llm: new MockLlmClient([], { streaming: false }) }
      );
      return true;
    } catch {
      return false;
    }
  };

  // 前五组合规、后面都不合规；最后三组每个名字单独都合规，坏在「组合」上
  const cases: string[][] = [
    ['wechat'],
    ['a'],
    ['send_to_wechat'],
    ['x'.repeat(40)],
    ['wechat_'],
    ['WeChat'],
    ['we__chat'],
    ['1wechat'],
    ['x'.repeat(41)],
    ['we-chat'],
    ['_wechat'],
    ['a', 'a'],
    ['a', 'a_update_credentials'],
    ['a_update_credentials', 'a']
  ];

  it.each(cases)('%j：解析器与 ChatEngine 的结论相同', (...names) => {
    expect(parserAccepts(names)).toBe(engineAccepts(names));
  });

  it('对照组不是空转：两边都既接受过、也拒绝过', () => {
    const verdicts = cases.map((names) => parserAccepts(names));
    expect(verdicts).toContain(true);
    expect(verdicts).toContain(false);
  });
});

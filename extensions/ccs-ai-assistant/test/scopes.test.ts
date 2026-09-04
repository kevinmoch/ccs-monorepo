// @vitest-environment jsdom
/**
 * 兜底剪除名单的边界：剪掉的必须是凭据，没剪的必须真的能被模型看见。
 *
 * 用真实的 page agent 跑一遍而不是断言选择器字面量：这份名单的价值全在
 * 「它作用在页面上之后剩下什么」，只比对数组内容的守护测不出误剪。
 */
import { createPageAgentHandler } from '@webskill/browser';
import type { PerceivedNode } from '@webskill/agent';
import { beforeEach, describe, expect, it } from 'vitest';
import { ACTION_SCOPE, PERCEPTION_SCOPE } from '../src/shared/scopes';

function flatten(nodes: readonly PerceivedNode[]): PerceivedNode[] {
  return nodes.flatMap((node) => [node, ...flatten(node.children ?? [])]);
}

async function perceive(): Promise<PerceivedNode[]> {
  const handler = createPageAgentHandler({ actionScope: ACTION_SCOPE, promoteRoles: true });
  const reply = await handler.handle({ type: 'perceive', scope: PERCEPTION_SCOPE });
  if (reply.type !== 'perceive-result') throw new Error(`perceive failed: ${reply.type}`);
  return flatten(reply.result.nodes);
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('SENSITIVE_EXCLUDE', () => {
  it('剪掉真正的密码框', async () => {
    document.body.innerHTML = `<input type="password" value="hunter2">`;
    expect(await perceive()).toEqual([]);
  });

  it('剪掉一次性验证码框（明文 type，只有 autocomplete 认得出）', async () => {
    document.body.innerHTML = `<input type="text" autocomplete="one-time-code" value="123456">`;
    expect(await perceive()).toEqual([]);
  });

  it('剪掉支付卡控件', async () => {
    document.body.innerHTML = `<input type="text" autocomplete="cc-number" value="4111"><input type="text" name="CVC" value="123">`;
    expect(await perceive()).toEqual([]);
  });

  it('不剪拿 new-password 关自动填充的普通文本框', async () => {
    // 金蝶苍穹的真实形状：Chrome 忽略 autocomplete=off，组件库改用 new-password 关自动填充
    document.body.innerHTML = `<input type="text" autocomplete="new-password" title="基小建" value="基小建">`;
    const textbox = (await perceive()).find((node) => node.role === 'textbox');
    expect(textbox).toMatchObject({ name: '基小建', value: '基小建' });
  });

  it('不剪拿 current-password 关自动填充的普通文本框', async () => {
    document.body.innerHTML = `<input type="text" autocomplete="current-password" title="示例项目" value="示例项目">`;
    const textbox = (await perceive()).find((node) => node.role === 'textbox');
    expect(textbox).toMatchObject({ value: '示例项目' });
  });

  it('被剪的框也不发句柄，模型指称不到', async () => {
    document.body.innerHTML = `<input type="password" value="hunter2"><input type="text" autocomplete="new-password" value="基小建">`;
    const refs = (await perceive()).filter((node) => node.ref !== undefined);
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({ value: '基小建' });
  });
});

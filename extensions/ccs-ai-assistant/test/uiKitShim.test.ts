// @vitest-environment jsdom
/**
 * `src/shared/uiKit.tsx` 是 `@webskill/ui-kit` 运行时配置层的本地复制实现
 * （ui-kit 没有发布形态，扩展装不到它）。
 *
 * 漏字段有 typecheck 兜着——垫片的 `defaultRuntimeConfig()` 标的是真 `RuntimeConfig`。
 * 但**收敛逻辑**漂移不会有任何编译期信号：`sub('usageCost', d.usageCost)` 忘了接
 * `mergeUsageCost` 照样过编译，脏值就此直接落进运行时。这里用差分把两边钉在一起。
 */
import { describe, expect, it } from 'vitest';
import {
  defaultRuntimeConfig as upstreamDefaults,
  mergeRuntimeConfigDefaults as upstreamMerge
} from '@webskill/ui-kit';
import { defaultRuntimeConfig as shimDefaults, mergeRuntimeConfigDefaults as shimMerge } from '../src/shared/uiKit';

// 两边都要收敛成同一个结果的脏输入。键名与形状按 config.json 能写出来的样子取。
const CASES: Record<string, unknown> = {
  空对象: {},
  usageCost整段缺席: { appearance: { locale: 'zh' } },
  usageCost只给一半: { usageCost: { enabled: false } },
  usageCost单价为零: { usageCost: { cnyPerMillionTokens: 0 } },
  usageCost单价为负: { usageCost: { cnyPerMillionTokens: -1 } },
  usageCost单价非数: { usageCost: { cnyPerMillionTokens: '9' } },
  usageCost单价非有限: { usageCost: { cnyPerMillionTokens: Number.POSITIVE_INFINITY } },
  usageCost汇率为零: { usageCost: { cnyPerUsd: 0 } },
  usageCost汇率为负: { usageCost: { cnyPerUsd: -6.8 } },
  usageCost开关非布尔: { usageCost: { enabled: 'yes' } },
  usageCost整段非对象: { usageCost: 'on' },
  allowedHosts正常: { siteAccess: { allowedHosts: ['*.example.com', 'kdocs.cn'] } },
  allowedHosts非数组: { siteAccess: { allowedHosts: 'example.com' } },
  allowedHosts混杂: { siteAccess: { allowedHosts: ['a.com', 42, null] } },
  allowedHosts整段非对象: { siteAccess: 7 },
  hiddenPages正常: { consoleNav: { hiddenPages: ['connections.models'] } },
  hiddenPages非数组: { consoleNav: { hiddenPages: 3 } },
  hiddenPages混杂: { consoleNav: { hiddenPages: [true, 'settings.runtime'] } },
  hiddenPages整段非对象: { consoleNav: null }
};

describe('uiKit 垫片与 @webskill/ui-kit 的运行时配置层同步', () => {
  it('出厂默认值逐字一致：垫片一旦落后，宿主与扩展就会对同一份配置给出两种解释', () => {
    expect(shimDefaults()).toEqual(upstreamDefaults());
  });

  it.each(Object.keys(CASES))('脏值收敛结果一致：%s', (name) => {
    const input = CASES[name];
    expect(shimMerge(input)).toEqual(upstreamMerge(input));
  });

  it('差分本身有效：换成一份确实不同的输入时两边结果应当不同（前置成立，上面的等值断言才有意义）', () => {
    expect(shimMerge({ usageCost: { cnyPerMillionTokens: 20 } })).not.toEqual(
      upstreamMerge({ usageCost: { cnyPerMillionTokens: 21 } })
    );
  });
});

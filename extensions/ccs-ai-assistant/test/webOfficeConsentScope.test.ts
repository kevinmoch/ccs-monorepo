import { describe, expect, it } from 'vitest';
import { createExtensionWebOfficeConsentStore } from '../src/shared/consentStore';
import type { WebOfficeAction, WebOfficeAuthorizationKey } from '@webskill/sdk/browser';

const ACTIONS: readonly WebOfficeAction[] = ['list', 'read', 'capture'];
// 站点地址原样进文案，所以这里不能取带产品名的域名，否则断言验的是域名不是措辞
const KEY: WebOfficeAuthorizationKey = { origin: 'https://docs.example.com', tabId: 7, handle: 'doc-1' };

/**
 * 这句话出现在授权卡的「不再询问」勾选项上。它两次写死了 WPS：
 * 第一次连英文一起，第二次只剩中文那一份——所以这里两种语言都验。
 */
describe('WebOffice 授权范围文案不写产品名', () => {
  it('中文标签不提 WPS，也不提任何别的产品', () => {
    const store = createExtensionWebOfficeConsentStore(() => 'zh');
    for (const action of ACTIONS) {
      const scope = store.describeScope!(action, KEY);
      expect(scope).not.toMatch(/WPS|KooTable|WebOffice|Luckysheet/i);
      expect(scope).toContain('办公文档');
      expect(scope).toContain(KEY.origin);
    }
  });

  it('英文标签同样不提', () => {
    const store = createExtensionWebOfficeConsentStore(() => 'en');
    for (const action of ACTIONS) {
      const scope = store.describeScope!(action, KEY);
      expect(scope).not.toMatch(/WPS|KooTable|WebOffice|Luckysheet/i);
      expect(scope).toContain('office documents');
      expect(scope).toContain(KEY.origin);
    }
  });

  it('三个动作各说各的，不会混成一句', () => {
    const store = createExtensionWebOfficeConsentStore(() => 'zh');
    const scopes = ACTIONS.map((action) => store.describeScope!(action, KEY));
    expect(new Set(scopes).size).toBe(ACTIONS.length);
  });
});

import type { CardDefinition } from '@ccs/card';
import { getIframeUrl } from '../../utils/url-config';

/**
 * 页面卡片布局配置
 * URL 由 main.ts 启动时从 /url-config.json 加载，此处同步获取。
 */
export default {
  cards: [
    {
      id: 'iframe',
      rowSpan: 12,
      colSpan: { base: 12, md: 12 },
      props: {
        url: getIframeUrl('settings')
      }
    }
  ] satisfies CardDefinition[]
};

import type { CardDefinition } from '@ccs/card';
import { getIframeUrl } from '../../utils/url-config';

export default {
  cards: [
    {
      id: 'iframe',
      rowSpan: 12,
      colSpan: { base: 12, md: 12 },
      props: {
        url: getIframeUrl('ccs-module-common/my-todos')
      }
    }
  ] satisfies CardDefinition[]
};

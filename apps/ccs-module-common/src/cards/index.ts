import { createCardRegistry } from '@ccs/card';
import IframeCard from './IframeCard.vue';
import TestCard from './TestCard.vue';
import PortalInvestmentCard from './PortalInvestmentCard.vue';
// ccs-cli:card-import
export const cardRegistry = createCardRegistry({
  iframe: IframeCard,
  test: TestCard,
  'portal-investment': PortalInvestmentCard
  // ccs-cli:card-register
});

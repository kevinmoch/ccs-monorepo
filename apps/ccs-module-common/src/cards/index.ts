import { createCardRegistry } from '@ccs/card';
import IframeCard from './IframeCard.vue';
import TestCard from './TestCard.vue';
import PortalInvestmentCard from './PortalInvestmentCard.vue';
import PortalArchitectureCard from './PortalArchitectureCard.vue';
import PortalCivilEngineeringCard from './PortalCivilEngineeringCard.vue';
// ccs-cli:card-import
export const cardRegistry = createCardRegistry({
  iframe: IframeCard,
  test: TestCard,
  'portal-investment': PortalInvestmentCard,
  'portal-architecture': PortalArchitectureCard,
  'portal-civil-engineering': PortalCivilEngineeringCard
  // ccs-cli:card-register
});

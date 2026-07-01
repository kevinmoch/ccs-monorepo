import { createCardRegistry } from '@ccs/card';
import IframeCard from './IframeCard.vue';
import PortalInvestmentCard from './PortalInvestmentCard.vue';
import PortalMenuCard from './PortalMenuCard.vue';
import PortalProcurementCard from './PortalProcurementCard.vue';
// ccs-cli:card-import
export const cardRegistry = createCardRegistry({
  iframe: IframeCard,
  'portal-investment': PortalInvestmentCard,
  'portal-architecture': PortalMenuCard,
  'portal-civil-engineering': PortalMenuCard,
  'portal-curtain-wall': PortalMenuCard,
  'portal-hvac': PortalMenuCard,
  'portal-power-electrical': PortalMenuCard,
  'portal-weak-current': PortalMenuCard,
  'portal-interior-fit-out': PortalMenuCard,
  'portal-soft-furnishing': PortalMenuCard,
  'portal-landscape': PortalMenuCard,
  'portal-process-mechanical': PortalMenuCard,
  'portal-engineering': PortalMenuCard,
  'portal-procurement': PortalProcurementCard,
  'portal-acceptance': PortalMenuCard,
  'portal-ehs': PortalMenuCard,
  'portal-cost': PortalMenuCard
  // ccs-cli:card-register
});

import { createCardRegistry } from '@ccs/card';
import IframeCard from './IframeCard.vue';
import TestCard from './TestCard.vue';
import PortalInvestmentCard from './PortalInvestmentCard.vue';
import PortalArchitectureCard from './PortalArchitectureCard.vue';
import PortalCivilEngineeringCard from './PortalCivilEngineeringCard.vue';
import PortalCurtainWallCard from './PortalCurtainWallCard.vue';
import PortalHvacCard from './PortalHvacCard.vue';
import PortalPowerElectricalCard from './PortalPowerElectricalCard.vue';
import PortalWeakCurrentCard from './PortalWeakCurrentCard.vue';
import PortalInteriorFitOutCard from './PortalInteriorFitOutCard.vue';
import PortalSoftFurnishingCard from './PortalSoftFurnishingCard.vue';
import PortalLandscapeCard from './PortalLandscapeCard.vue';
import PortalProcessMechanicalCard from './PortalProcessMechanicalCard.vue';
import PortalMenuCard from './PortalMenuCard.vue';
// ccs-cli:card-import
export const cardRegistry = createCardRegistry({
  iframe: IframeCard,
  test: TestCard,
  'portal-investment': PortalInvestmentCard,
  'portal-architecture': PortalArchitectureCard,
  'portal-civil-engineering': PortalCivilEngineeringCard,
  'portal-curtain-wall': PortalCurtainWallCard,
  'portal-hvac': PortalHvacCard,
  'portal-power-electrical': PortalPowerElectricalCard,
  'portal-weak-current': PortalWeakCurrentCard,
  'portal-interior-fit-out': PortalInteriorFitOutCard,
  'portal-soft-furnishing': PortalSoftFurnishingCard,
  'portal-landscape': PortalLandscapeCard,
  'portal-process-mechanical': PortalProcessMechanicalCard,
  'portal-engineering': PortalMenuCard,
  'portal-procurement': PortalMenuCard,
  'portal-acceptance': PortalMenuCard,
  'portal-ehs': PortalMenuCard,
  'portal-cost': PortalMenuCard
  // ccs-cli:card-register
});

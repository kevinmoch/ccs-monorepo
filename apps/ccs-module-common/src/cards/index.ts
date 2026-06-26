import { createCardRegistry } from '@ccs/card';
import IframeCard from './IframeCard.vue';
import TestCard from './TestCard.vue';
// ccs-cli:card-import
export const cardRegistry = createCardRegistry({
  'iframe': IframeCard,
  'test': TestCard,
	// ccs-cli:card-register
});

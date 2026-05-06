import { createCardRegistry } from '@ccs/ui-vue';
import SampleCard from './SampleCard.vue';
// ccs-cli:card-import
export const cardRegistry = createCardRegistry({ 'sample-card': SampleCard, // ccs-cli:card-register
});

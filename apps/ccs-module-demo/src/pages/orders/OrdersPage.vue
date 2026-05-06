<template><CardGrid :cards="pageConfig.cards" :registry="cardRegistry" /></template>
<script setup lang="ts">
import { CardGrid } from '@ccs/ui-vue';
import { cardRegistry } from '../../cards';
import pageConfig from './config';
</script>

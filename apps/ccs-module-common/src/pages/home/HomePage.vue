<template>
  <CardGrid :cards="pageConfig.cards" :registry="cardRegistry" />
</template>

<script setup lang="ts">
import { CardGrid } from '@ccs/card';
import { cardRegistry } from '../../cards';
import pageConfig from './config';
</script>

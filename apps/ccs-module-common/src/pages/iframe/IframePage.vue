<template>
  <CardGrid :cards="computedCards" :registry="cardRegistry" />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { CardGrid } from '@ccs/card';
import { cardRegistry } from '../../cards';

const route = useRoute();

const computedCards = computed(() => {
  const queryUrl = (route.query.url as string) || '';
  const hideTop = parseInt((route.query.top as string) || '0', 10);
  // CCS_BASE_URL may be overridden at runtime with a tenant-qualified prefix
  // (e.g. `/CCS_Tenant_Gray`) once ccs-framework resolves it after login,
  // since it's shared via same-origin localStorage — no rebuild needed.
  const baseUrl = localStorage.getItem('ccs-base-url-override') || import.meta.env.CCS_BASE_URL || '';
  const url = /^https?:\/\//i.test(queryUrl) ? queryUrl : `${baseUrl}${queryUrl}`;

  return [
    {
      id: 'iframe',
      rowSpan: 12,
      colSpan: { base: 12, md: 12 },
      props: { url, hideTop }
    }
  ];
});
</script>

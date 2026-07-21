<template>
  <CardShell>
    <div class="header-card">
      <nav class="header-card__breadcrumb">
        <template v-for="(item, index) in breadcrumb" :key="item">
          <span>{{ item }}</span>
          <span v-if="index < breadcrumb.length - 1" class="header-card__breadcrumb-sep">›</span>
        </template>
      </nav>
      <h1 class="header-card__title" @click="testProxy">{{ title }}</h1>
      <p class="header-card__desc">{{ description }}</p>
    </div>
  </CardShell>
</template>

<script setup lang="ts">
import { CardShell } from '@ccs/card';

const props = withDefaults(
  defineProps<{
    title?: string;
    description?: string;
    breadcrumb?: string[];
  }>(),
  {
    breadcrumb: () => []
  }
);

const testProxy = async () => {
  const baseUrl = sessionStorage.getItem('ccs-base-url-override') || import.meta.env.CCS_BASE_URL || '';
  const res = await window.top?.fetchProxy?.(baseUrl + '/ierp/kapi/app/MaterialTemplate/call', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    credentials: 'include',
    body: JSON.stringify({
      className: 'kd.ecc.index.webapi.ECCIndexIerpApi',
      methodName: 'getCarousel',
      ismobile: '1'
    })
  });
  if (res) {
    const data = await res.json();
    alert(`baseUrl: ${baseUrl} \ndata: ${data.errorCode}`);
  }
};
</script>

<style scoped>
.header-card {
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.header-card__breadcrumb {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: color-mix(in srgb, var(--ccs-text, #0f172a) 42%, transparent);
  margin-bottom: 8px;
}

.header-card__breadcrumb-sep {
  opacity: 0.5;
  font-size: 12px;
}

.header-card__title {
  margin: 0;
  font-size: 24px;
  font-weight: 900;
  line-height: 1.25;
  color: var(--ccs-text, #0f172a);
}

.header-card__desc {
  margin: 8px 0 0;
  font-size: 14px;
  font-weight: 500;
  line-height: 1.5;
  color: color-mix(in srgb, var(--ccs-text, #0f172a) 58%, transparent);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>

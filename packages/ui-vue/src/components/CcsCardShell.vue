<template>
  <section class="ccs-card-shell">
    <header class="ccs-card-shell__header">
      <h3>{{ title }}</h3>
      <slot name="extra" />
    </header>
    <div class="ccs-card-shell__body"><slot /></div>
  </section>
</template>
<script setup lang="ts">
defineProps<{ title: string }>();
</script>
<style scoped>
.ccs-card-shell {
  min-height: 180px;
  padding: 18px;
  border: 1px solid color-mix(in srgb, var(--ccs-text, #0f172a) 10%, transparent);
  border-radius: 18px;
  background: color-mix(in srgb, var(--ccs-bg, #fff) 92%, white);
  color: var(--ccs-text, #0f172a);
  box-shadow: 0 12px 32px rgb(15 23 42 / 8%);
}
.ccs-card-shell__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}
.ccs-card-shell__header h3 {
  margin: 0;
  font-size: 16px;
}
.ccs-card-shell__body {
  min-width: 0;
}
</style>

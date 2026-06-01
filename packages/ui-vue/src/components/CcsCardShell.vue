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
  height: 100%;
  min-height: 180px;
  padding: 18px;
  border: var(--ccs-card-border-width, 1px) solid var(--ccs-card-border-color, color-mix(in srgb, var(--ccs-text, #0f172a) 10%, transparent));
  border-radius: var(--ccs-card-radius, 16px);
  background: var(--ccs-card-background, color-mix(in srgb, var(--ccs-bg, #fff) 92%, white));
  color: var(--ccs-text, #0f172a);
  box-shadow: var(--ccs-card-shadow, 0 12px 32px rgb(15 23 42 / 8%));
  box-sizing: border-box;
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

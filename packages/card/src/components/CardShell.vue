<template>
  <section class="card-shell">
    <div class="card-shell__body"><slot /></div>
  </section>
</template>
<style scoped>
.card-shell {
  height: 100%;
  padding: 18px;
  border: var(--ccs-card-border-width, 1px) solid var(--ccs-card-border-color, color-mix(in srgb, var(--ccs-text, #0f172a) 10%, transparent));
  border-radius: var(--ccs-card-radius, 16px);
  background: var(--ccs-card-background, color-mix(in srgb, var(--ccs-bg, #fff) 92%, white));
  color: var(--ccs-text, #0f172a);
  box-shadow: var(--ccs-card-shadow, 0 12px 32px rgb(15 23 42 / 8%));
  box-sizing: border-box;
}

.card-shell__body {
  min-width: 0;
  height: 100%;
}
</style>

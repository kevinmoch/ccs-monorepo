<template>
  <div class="iframe-fullscreen-wrapper">
    <iframe :src="url" class="iframe-fullscreen" frameborder="0" />
  </div>
</template>

<script setup lang="ts">
defineProps<{
  url: string;
}>();
</script>

<style scoped>
/* 用负 margin 抵消 CardShell 的 18px padding，让 iframe 撑满整个卡片 */
.iframe-fullscreen-wrapper {
  margin: -18px;
  width: calc(100% + 36px);
  min-height: calc(100dvh - 2rem); /* 2rem = module-shell 上下 padding */
  height: calc(100% + 36px);
}

.iframe-fullscreen {
  display: block;
  width: 100%;
  height: 100%;
  border: none;
}
</style>

<template>
  <div class="iframe-fullscreen-wrapper" :class="{ 'iframe-fullscreen-wrapper--clip': hideTop > 0 }">
    <iframe :src="url" class="iframe-fullscreen" frameborder="0" :style="hideTop > 0 ? { position: 'relative', top: `-${hideTop}px`, height: `calc(100% + ${hideTop}px)` } : {}" />
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    url: string;
    /** 隐藏 iframe 内容顶部的像素高度 */
    hideTop?: number;
  }>(),
  {
    hideTop: 0
  }
);
</script>

<style scoped>
/* 用负 margin 抵消 CardShell 的 18px padding，让 iframe 撑满整个卡片 */
.iframe-fullscreen-wrapper {
  margin: -18px;
  width: calc(100% + 36px);
  min-height: calc(100dvh);
  height: calc(100% + 36px);
}

.iframe-fullscreen-wrapper--clip {
  overflow: hidden;
}

.iframe-fullscreen {
  display: block;
  width: 100%;
  height: 100%;
  border: none;
}
</style>

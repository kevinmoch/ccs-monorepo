<template>
  <div class="iframe-fullscreen-wrapper" :class="{ 'iframe-fullscreen-wrapper--clip': hideTop > 0 }">
    <iframe :src="url" class="iframe-fullscreen" frameborder="0" :style="hideTop > 0 ? { position: 'relative', top: `-${hideTop}px`, height: `calc(100% + ${hideTop}px)` } : {}" @load="handleLoad" />
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount } from 'vue';

const props = withDefaults(
  defineProps<{
    url: string;
    /** 隐藏 iframe 内容顶部的像素高度 */
    hideTop?: number;
  }>(),
  {
    hideTop: 0
  }
);

let observer: MutationObserver | undefined;

function isSameOrigin(url: string): boolean {
  try {
    return new URL(url, window.location.href).origin === window.location.origin;
  } catch {
    return false;
  }
}

function rewriteAnchor(link: HTMLAnchorElement) {
  if (link.target && link.target !== '_self') {
    link.target = '_self';
  }
}

function rewriteAnchorsIn(root: ParentNode) {
  root.querySelectorAll('a[target]').forEach((el) => rewriteAnchor(el as HTMLAnchorElement));
}

/**
 * 同域场景下，强制页面内所有链接在当前 iframe 内跳转，而不是弹出新窗口/新标签页：
 * 1) 重写已存在链接的 target 为 `_self`；
 * 2) 用 MutationObserver 监听后续动态新增的链接，同样重写；
 * 3) 覆盖 iframe 内部的 window.open，使其改为当前页面跳转。
 * 仅在同域时可行（跨域 iframe 无法访问 contentDocument/contentWindow）。
 */
function attachInPageNavigation(doc: Document, win: Window) {
  rewriteAnchorsIn(doc);

  observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof Element)) return;
        if (node.matches('a[target]')) rewriteAnchor(node as HTMLAnchorElement);
        rewriteAnchorsIn(node);
      });
    }
  });
  observer.observe(doc.documentElement ?? doc.body, { childList: true, subtree: true });

  const originalOpen = win.open;
  win.open = ((url?: string | URL) => {
    if (url) {
      win.location.href = typeof url === 'string' ? url : url.toString();
      return win;
    }
    return originalOpen ? originalOpen.call(win) : null;
  }) as typeof window.open;
}

function handleLoad(event: Event) {
  observer?.disconnect();
  observer = undefined;

  if (!isSameOrigin(props.url)) return;

  const iframe = event.currentTarget as HTMLIFrameElement;
  try {
    const doc = iframe.contentDocument;
    const win = iframe.contentWindow;
    if (doc && win) attachInPageNavigation(doc, win);
  } catch {
    /* 跨域访问异常：防御性忽略 */
  }
}

onBeforeUnmount(() => {
  observer?.disconnect();
});
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

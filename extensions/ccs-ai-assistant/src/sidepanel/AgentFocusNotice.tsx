import { useCallback, useSyncExternalStore } from 'react';
import type { JSX } from 'react';
import type { AgentFocusPort } from '../shared/assembly';

/**
 * 「模型正在另一页工作」的提示条（0.16.0 分册 11 / FR-11.7）。
 *
 * 本版**不再**在用户切标签页时清掉模型手上的句柄，代价是画面与模型的视角会分开：
 * 用户回头看到的是自己那一页，模型仍停在详情页上。不说出来的话，
 * 用户下一句「把这个填进去」指的是他看到的页面，而模型会把它做到另一页上。
 *
 * DV-3：一致时这个组件返回 `null`——**不存在**，而不是渲染一条隐藏的空条。
 * 常驻一条「已同步」的绿条只会训练用户忽略这一行，等到真不一致时也照样看不见。
 *
 * 「跟随」是**用户**发起的动作，因此不受 SC-3 约束；它改的也只是模型的焦点，
 * 不会去动用户的浏览器画面。
 *
 * 这里不出现 `chrome.`：焦点、地址、跟随全从端口进来（AC-14.18）。
 */
export function AgentFocusNotice({ port, locale }: { port: AgentFocusPort; locale: 'en' | 'zh' }): JSX.Element | null {
  const subscribe = useCallback((listener: () => void) => port.subscribe(listener), [port]);
  const matched = useSyncExternalStore(subscribe, () => port.matched());
  const page = useSyncExternalStore(
    subscribe,
    // getSnapshot 必须是稳定值：直接返回对象会让 React 每次比对都判定「变了」并无限重渲染
    () => port.page()?.title ?? port.page()?.url
  );

  if (matched) return null;

  const t = locale === 'zh' ? ZH : EN;
  return (
    <div
      data-testid="agent-focus-notice"
      role="status"
      className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-accent px-2 py-1 text-xs text-foreground"
    >
      <span className="min-w-0 truncate">
        {t.working}
        {page === undefined ? '' : ` — ${page}`}
      </span>
      <button
        type="button"
        data-testid="agent-focus-follow"
        className="shrink-0 rounded-md px-2 py-0.5 text-xs text-primary hover:bg-accent hover:text-accent-foreground"
        onClick={() => port.follow()}
      >
        {t.follow}
      </button>
    </div>
  );
}

const ZH = { working: '助手正在另一个标签页上工作', follow: '切到我这一页' };
const EN = { working: 'The assistant is working on another tab', follow: 'Use my current tab' };

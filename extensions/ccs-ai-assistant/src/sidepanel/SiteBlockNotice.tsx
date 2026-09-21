import { useCallback, useSyncExternalStore } from 'react';
import type { JSX } from 'react';
import type { TabBindingPort } from '../shared/tabBinding';
import { siteBlockNotice } from '../shared/siteBlock';

/**
 * 「这一站不在允许列表内」的提示条。
 *
 * 不说出来的话，用户看到的是助手对着眼前的页面装瞎：问什么都答「读不到」，
 * 而原因是宿主配的白名单——那是用户自己改得了的一行配置，藏起来毫无道理。
 *
 * 与 `AgentFocusNotice` 同规矩：没被拦时返回 `null` 而不是一条隐藏的空条。
 * 语调用 destructive 而非 accent：这是一条「不会发生」的告知，不是进度。
 *
 * 这里不出现 `chrome.`：拦截状态从端口进来（AC-14.18）。
 */
export function SiteBlockNotice({ port, locale }: { port: TabBindingPort; locale: 'en' | 'zh' }): JSX.Element | null {
  const subscribe = useCallback((listener: () => void) => port.subscribe(listener), [port]);
  // getSnapshot 必须返回稳定值：`snapshot()` 每次是新对象，直接返回会无限重渲染
  const notice = useSyncExternalStore(subscribe, () => siteBlockNotice(port.snapshot(), locale));

  if (notice === undefined) return null;

  return (
    <div
      data-testid="site-block-notice"
      role="status"
      className="shrink-0 border-b border-border bg-destructive/10 px-2 py-1 text-xs text-destructive"
    >
      <span className="block truncate">{notice}</span>
    </div>
  );
}

/**
 * 扩展侧的下载观察端口（0.15.0 分册 15 · §8）。
 *
 * 只在**一次页面操作的窗口期内**订阅 `chrome.downloads.onChanged`，
 * 结算时立刻退订。之所以不用一个常驻监听 + 时间戳过滤：常驻监听意味着
 * 这个扩展任何时候都在看用户的下载记录，哪怕当前根本没有 Agent 在跑（AC-15.13）。
 *
 * 读的东西也刻意抠到最少：只认 `state.current === 'complete'` 这一个转换，
 * 计数一次；文件名、大小、类型一概不碰（D-15-3）。要看内容仍得走
 * `list_downloaded_files` / `read_downloaded_file` 的逐次确认卡。
 */
import type { ActionDownloadWatcher, ActionDownloadWindow } from '@webskill/sdk/agent';

/** 只取用得到的那一小块，免得把整个 chrome.downloads 的类型拖进来 */
interface DownloadDelta {
  id: number;
  state?: { current?: string };
}

export function createExtensionDownloadWatcher(): ActionDownloadWatcher {
  return {
    open: (): ActionDownloadWindow => {
      const completed = new Set<number>();
      // 第一次完成的通知：用来提前结束等待，不必每次都耗满预算
      let firstHit: (() => void) | undefined;
      const listener = (delta: DownloadDelta): void => {
        if (delta.state?.current !== 'complete') return;
        completed.add(delta.id);
        firstHit?.();
      };
      chrome.downloads.onChanged.addListener(listener);

      let closed = false;
      const close = (): number => {
        if (!closed) {
          closed = true;
          chrome.downloads.onChanged.removeListener(listener);
        }
        return completed.size;
      };

      return {
        settle: async ({ timeoutMs }) => {
          // 预算 0 = 出错路径要求立刻关窗并丢弃计数
          if (timeoutMs <= 0) {
            close();
            return 0;
          }
          if (completed.size === 0) {
            await new Promise<void>((resolve) => {
              const timer = setTimeout(resolve, timeoutMs);
              firstHit = () => {
                clearTimeout(timer);
                resolve();
              };
            });
            firstHit = undefined;
          }
          return close();
        }
      };
    }
  };
}

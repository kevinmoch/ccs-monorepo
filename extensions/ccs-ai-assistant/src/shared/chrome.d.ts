/**
 * 本示例真正用到的 `chrome.*` 子集。
 *
 * 手写而不装 `@types/chrome`：这张表同时就是「示例向浏览器要了哪些能力」的清单，
 * 与 manifest 的 `permissions` 一一对得上；装了全量类型反而看不出来。
 * 新增一条之前先问：manifest 里申请了吗？README 里说明了吗？
 */
declare namespace chrome {
  namespace runtime {
    const id: string;
    const lastError: { message?: string } | undefined;
    function getURL(path: string): string;
    function openOptionsPage(): Promise<void>;
    function sendMessage(message: unknown): Promise<unknown>;
    const onMessage: {
      addListener(
        listener: (
          message: unknown,
          sender: { tab?: { id?: number } },
          sendResponse: (response: unknown) => void
        ) => boolean | void
      ): void;
    };
  }

  namespace tabs {
    interface Tab {
      id?: number;
      title?: string;
      url?: string;
      active?: boolean;
      windowId?: number;
      /** 最近一次被看到的时刻（Chrome 121+）；老版本没有，取值端必须容忍 undefined */
      lastAccessed?: number;
    }
    function query(info: { active?: boolean; currentWindow?: boolean; windowId?: number }): Promise<Tab[]>;
    function get(tabId: number): Promise<Tab>;
    function create(info: { url: string }): Promise<Tab>;
    function sendMessage(tabId: number, message: unknown, options?: { frameId?: number }): Promise<unknown>;
    function remove(tabId: number): Promise<void>;
    const onRemoved: { addListener(listener: (tabId: number) => void): void };
    /**
     * 新标签页被创建。**只在一次页面操作的窗口期内订阅**（0.16.0 FR-13.2）：
     * 常驻监听等于这个扩展任何时候都在看用户开了什么页。
     * 因此这里必须有 `removeListener`。
     */
    const onCreated: {
      addListener(listener: (tab: Tab) => void): void;
      removeListener(listener: (tab: Tab) => void): void;
    };
    const onUpdated: {
      addListener(listener: (tabId: number, change: { url?: string; title?: string }, tab: Tab) => void): void;
    };
    const onActivated: { addListener(listener: (info: { tabId: number; windowId: number }) => void): void };
  }

  namespace windows {
    /** 焦点离开浏览器时 `onFocusChanged` 报的窗口 id */
    const WINDOW_ID_NONE: number;
    const onFocusChanged: { addListener(listener: (windowId: number) => void): void };
  }

  namespace storage {
    interface StorageArea {
      get(keys?: string | string[] | null): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
      remove(keys: string | string[]): Promise<void>;
    }
    const local: StorageArea;
  }

  namespace scripting {
    function executeScript(injection: {
      target: { tabId: number; allFrames?: boolean };
      files: string[];
    }): Promise<unknown[]>;
  }

  namespace webNavigation {
    interface FrameDetail {
      frameId: number;
      parentFrameId: number;
      url: string;
    }
    /** MV3 里这一项叫 `GetAllFrameResultDetails`，保留同名别名以便照抄官方示例 */
    type GetAllFrameResultDetails = FrameDetail;
    /** 已关闭的 tab 返回 null，不抛异常 */
    function getAllFrames(details: { tabId: number }): Promise<FrameDetail[] | null>;
  }

  namespace sidePanel {
    function setPanelBehavior(behavior: { openPanelOnActionClick: boolean }): Promise<void>;
  }

  namespace extension {
    /** `chrome://extensions` 上的「允许访问文件网址」开关（0.14.0 分册 20） */
    function isAllowedFileSchemeAccess(): Promise<boolean>;
  }

  namespace downloads {
    interface DownloadItem {
      id: number;
      filename: string;
      mime: string;
      fileSize: number;
      /** 字节数；下载完成后与 `fileSize` 一致 */
      bytesReceived: number;
      endTime?: string;
      startTime: string;
      state: 'in_progress' | 'interrupted' | 'complete';
      exists: boolean;
    }
    function search(query: {
      state?: DownloadItem['state'];
      orderBy?: string[];
      limit?: number;
      exists?: boolean;
    }): Promise<DownloadItem[]>;
    interface DownloadDelta {
      id: number;
      state?: { previous?: DownloadItem['state']; current?: DownloadItem['state'] };
    }
    const onChanged: {
      addListener(listener: (delta: DownloadDelta) => void): void;
      removeListener(listener: (delta: DownloadDelta) => void): void;
    };
  }
}

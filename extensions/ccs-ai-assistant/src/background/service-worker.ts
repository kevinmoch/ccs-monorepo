/**
 * service worker。职责只有一条：点扩展图标打开 side panel。
 *
 * 消息路由**不经过这里**：side panel 直接 `chrome.tabs.sendMessage` 到内容脚本。
 * 多一跳中转就多一处能把 `PageAgentRequest` 改写掉的地方，
 * 而 MV3 的 service worker 随时会被回收，转发中的请求会静默丢失。
 */
/**
 * 首选路径：让 Chrome 自己在图标被点时开侧栏。这条同时覆盖工具栏上的图标和
 * 地址栏右边那个拼图菜单里的扩展行——用户不必再点三个点去找「打开侧边栏」。
 *
 * 这个开关随扩展安装持久化，但**不保证**：service worker 是按需唤醒的，
 * 如果这次调用还没落地（或者被浏览器丢了）就被点了图标，Chrome 会退回默认行为。
 */
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((e: unknown) => {
  console.error('[webskill] failed to configure the side panel behavior', e);
});

/**
 * 兜底路径。上面那个开关生效时这个事件根本不派发，所以两条不会打架；
 * 它只在开关没生效的那种情况下跑，正是「点了图标什么也没发生」的那一刻。
 *
 * `sidePanel.open()` 要求用户手势，图标点击本身就是——但必须在同一个任务里调用，
 * 中间不能 await 别的东西，所以这里不去查 tab、也不做任何前置判断。
 */
chrome.action.onClicked.addListener((tab) => {
  // 开的是窗口级侧栏（跟 manifest 的 side_panel.default_path 一致），不是 tab 级：
  // 按 tab 开会让用户在同一个窗口里换个标签页，侧栏就没了。
  chrome.sidePanel.open({ windowId: tab.windowId }).catch((e: unknown) => {
    console.error('[webskill] failed to open the side panel', e);
  });
});

// 全都是副作用，没有 import/export 就不是模块，用例里 `await import(...)` 会报 TS2306。
export {};

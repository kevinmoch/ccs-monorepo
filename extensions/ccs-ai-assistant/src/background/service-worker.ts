/**
 * service worker。职责只有一条：点扩展图标打开 side panel。
 *
 * 消息路由**不经过这里**：side panel 直接 `chrome.tabs.sendMessage` 到内容脚本。
 * 多一跳中转就多一处能把 `PageAgentRequest` 改写掉的地方，
 * 而 MV3 的 service worker 随时会被回收，转发中的请求会静默丢失。
 */
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((e: unknown) => {
  console.error('[webskill] failed to configure the side panel behavior', e);
});

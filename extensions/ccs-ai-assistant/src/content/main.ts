import { createPageAgentHandler } from '@webskill/browser';
import { isDocumentFetchRequest, isPageAgentEnvelope, isPageMcpRequest, pageAgentResponse } from '../shared/messages';
import { PAGE_DATA_SOURCES, PAGE_MCP_CHANGED, isPageDataSourcesPull } from '../shared/pageMcpClient';
import {
  isPageMcpBridgeChanged,
  isPageMcpBridgeDataSources,
  pageMcpBridgeDataSourcesPull
} from '../shared/pageMcpBridge';
import { relayPageMcp } from './pageMcpRelay';
import { fetchDocumentInPage } from '../shared/documentFetch';
import { keepProbeArmed, probeInteractiveHint } from '../shared/probe';
import { ACTION_SCOPE } from '../shared/scopes';

/**
 * 页面侧 agent（分册 13 FR-13.7）。
 *
 * handler 建**一次**并跨消息存活：DOM reader 是有状态的——`execute` 要 resolve 的
 * 那个句柄正是上一条 `perceive` 发出去的。每条消息新建一个，执行期永远查无此 ref。
 *
 * `actionScope` 由**页面侧**声明，不从请求里读：从请求读等于让 agent
 * 自己宣称自己能操作什么，那是权限提升，不是配置。
 *
 * `promoteRoles` 在扩展宿主里默认开（分册 15 D-15-1）：这里面对的是任意第三方站点，
 * 宿主既不控制它的 DOM 也无法为每个站点枚举选择器，不提升就是「读得到、点不动」。
 *
 * `discoverNestedFrames` 同理（分册 16 D-16-2）：本脚本已注入**每一帧**，但每帧只看得见自己；
 * 不把发现到的嵌套帧交出去，side panel 无从知道还要向哪几帧发请求。
 */
const handler = createPageAgentHandler({
  actionScope: ACTION_SCOPE,
  promoteRoles: true,
  interactiveHint: probeInteractiveHint,
  discoverNestedFrames: true
});

/** 本帧最后一次自荐的数据源（分册 21）；面板往往比页面晚开，那次推送没人接 */
let declaredSources: readonly unknown[] = [];

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  // 页面宿主握手（分册 18）：转给 MAIN world 的锚点，等它应答
  if (isPageMcpRequest(message)) {
    void relayPageMcp(message).then(sendResponse);
    return true;
  }
  // 带页面登录态取一个链接文档（分册 17）。同注册域闸门已在 side panel 侧过过一遍；
  // 这里**不再复判**不是省事，是因为内容脚本跑在页面的 renderer 里——
  // 被 XSS 的页面能改它的行为，把闸门放在这一侧等于没放
  if (isDocumentFetchRequest(message)) {
    void fetchDocumentInPage(message.url).then(sendResponse);
    return true;
  }
  // 面板问「你这页声明过哪些数据源」（分册 21）。答的是**本帧缓存**的那一份，
  // 不重新问页面：重问等于让页面在被审查时换一套说辞
  if (isPageDataSourcesPull(message)) {
    sendResponse({ channel: PAGE_DATA_SOURCES, sources: declaredSources });
    return false;
  }
  // 不是给我们的消息就交还给别的监听器（返回 false / undefined）
  if (!isPageAgentEnvelope(message)) return false;
  // 本帧确实在被使用，给探针续期；不续期它会自行还原页面原型
  keepProbeArmed();
  // 地址在**应答那一刻**取：一次感知期间发生导航时，路由层靠它发现内容已不是所请求的那一个
  void handler.handle(message.request).then((reply) => {
    sendResponse(pageAgentResponse(reply, location.href));
  });
  // 返回 true 才能保住通道等异步应答；漏了它 sendResponse 会被当作已失效
  return true;
});

// 页面端点变了就捅一下扩展（分册 18 FR-18.7 第 3 条）：通知**不带内容**，
// 收到的一侧只会重新拉一次清单，所以页面乱发它最多让我们多拉几次。
window.addEventListener('message', (event: MessageEvent) => {
  if (event.source !== window || !isPageMcpBridgeChanged(event.data)) return;
  // 没有接收方时（面板没开着）会 reject，属正常情况
  void chrome.runtime.sendMessage({ channel: PAGE_MCP_CHANGED }).catch(() => undefined);
});

// 页面自荐的数据源（0.14.0 分册 21）。这条**带内容**，所以它不适用上面那句
// 「乱发最多多拉几次」的安慰：内容到了 side panel 那侧必须逐条校验后才能进候选表，
// 而“是不是当前绑定 tab 发的”只有那侧知道。
window.addEventListener('message', (event: MessageEvent) => {
  if (event.source !== window || !isPageMcpBridgeDataSources(event.data)) return;
  declaredSources = event.data.sources;
  void chrome.runtime.sendMessage({ channel: PAGE_DATA_SOURCES, sources: event.data.sources }).catch(() => undefined);
});

// 本脚本是 `document_idle` 注入的，站点多半在解析时就喊完了——上面那个监听器
// 根本不在场。锦点跑在 `document_start`，向它要一次重播就能把那一次补回来。
window.postMessage(pageMcpBridgeDataSourcesPull(), '*');

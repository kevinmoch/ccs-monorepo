/**
 * ERP 子帧引导脚本。由 CcsFrameBridge 通过 addDocumentStartJavaScript 注入，
 * 在页面自身任何脚本之前运行（P-1 实测：readyState=loading、document.body 尚不存在）。
 *
 * 职责只有两件：把原生注入的桥对象藏进闭包，然后向原生注册这一帧。
 * 取数执行器与 DOM 探针（main-world.js / dom-agent.js）由 Java 拼接到下面的占位处。
 *
 * 占位符由 Java 侧替换：__CCS_AUTH_TOKEN__ / __CCS_BRIDGE_NAME__ / CCS_PAYLOAD
 */
(function () {
  'use strict';

  var BRIDGE_NAME = '__CCS_BRIDGE_NAME__';
  var AUTH_TOKEN = '__CCS_AUTH_TOKEN__';

  var bridge = window[BRIDGE_NAME];
  if (!bridge) return;

  // 基线 WebView 没有 isolated world，桥对象就挂在页面主世界的 window 上。
  // document-start 保证我们抢在页面脚本之前，删掉之后它只活在本闭包里。
  try {
    delete window[BRIDGE_NAME];
  } catch (_) {
    try {
      window[BRIDGE_NAME] = undefined;
    } catch (__) {
      /* 被冻结则放弃，token 仍是一道闸门 */
    }
  }

  var frameKey = null;
  var frameToken = null;
  var payloadCostMs = -1;

  // ── 帧内私有通道：本脚本顶替扩展 isolated.js 的子帧那一半 ────────────────
  // Android 基线 WebView 没有 isolated world，本脚本与 main-world.js 同 realm。
  // document-start 先跑一步是唯一的优势：页面脚本还没机会装监听器，也就学不到 token。
  var PROTO = 'ccs-fetch-proxy';
  var nativeAddEventListener = EventTarget.prototype.addEventListener;
  var nativePostMessage = window.postMessage;

  function nonce() {
    var bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    var out = '';
    for (var i = 0; i < bytes.length; i++) out += (bytes[i] + 0x100).toString(16).slice(1);
    return out;
  }

  /** 与 main-world.js 约定的一次性 token。它只在本闭包和被截停的入站报文里出现。 */
  var bridgeToken = nonce();

  function postTo(to, msg) {
    msg.__ccsExt = true;
    msg.proto = PROTO;
    msg.to = to;
    msg.authToken = bridgeToken;
    try {
      nativePostMessage.call(window, msg, location.origin);
    } catch (_) {
      /* 帧正在导航离开 */
    }
  }

  /** execId -> 原生的 reqId。回执按一次性 execId 归位，换回原 reqId 回原生。 */
  var pendingExec = Object.create(null);

  function post(msg) {
    if (!frameKey && msg.type !== 'frame-register') return;
    msg.authToken = AUTH_TOKEN;
    if (frameKey) {
      msg.frameKey = frameKey;
      msg.frameToken = frameToken;
    }
    try {
      bridge.postMessage(JSON.stringify(msg));
    } catch (_) {
      /* 帧正在销毁 */
    }
  }

  function currentTitle() {
    try {
      return document.title || '';
    } catch (_) {
      return null;
    }
  }

  // 只比 pathname：query/hash 在 ERP 里常被帧内改写，全串比会把活帧误判成不匹配。
  function hrefMatches(expected) {
    if (!expected) return true;
    try {
      return new URL(expected).pathname === new URL(location.href).pathname;
    } catch (_) {
      return true;
    }
  }

  function hasHeaderWrap() {
    try {
      return document.querySelector('.cssHeaderWrap') !== null;
    } catch (_) {
      return false;
    }
  }

  // 祖先链供原生核验“本帧确在壳下”（与扩展 page-opened 的 shellOriginFor 同构）
  function ancestorOrigins() {
    try {
      return Array.prototype.slice.call(location.ancestorOrigins || []);
    } catch (_) {
      return [];
    }
  }

  bridge.onmessage = function (event) {
    var msg;
    try {
      msg = JSON.parse(typeof event.data === 'string' ? event.data : '');
    } catch (_) {
      return;
    }
    if (!msg || msg.authToken !== AUTH_TOKEN) return;

    if (msg.type === 'frame-key') {
      frameKey = msg.frameKey;
      frameToken = msg.frameToken;
      replyFrameKey();
      // 锁定只对“外壳之下的跨域帧”上，由原生判定；水印隐藏随它一起生效。
      if (msg.lockdown === true) postTo('main', { kind: 'CCS_EXT_LOCKDOWN' });
      // 注册时 <title> 往往还没解析出来，拿到句柄后补一次
      if (currentTitle()) post({ type: 'frame-update', title: currentTitle() });
      return;
    }
    if (msg.type === 'ping') {
      post({ type: 'pong' });
      return;
    }
    if (msg.type === 'fetch-exec') {
      var execId = nonce();
      pendingExec[execId] = msg.reqId;
      postTo('main', { kind: 'CCS_EXT_EXECUTE', reqId: execId, url: msg.url, init: msg.init });
      return;
    }
    if (msg.type === 'dom-exec') {
      // 自验：原生只能按自报的 href 猜哪一帧，帧内导航后那个猜测会过期。
      // 带句柄寻址时原生不传 expectHref，这里自然放行。
      if (!hrefMatches(msg.expectHref)) {
        post({
          type: 'exec-result',
          reqId: msg.reqId,
          ok: false,
          error: 'frame-url-mismatch',
          href: location.href
        });
        return;
      }
      var domId = nonce();
      pendingExec[domId] = msg.reqId;
      postTo('dom', { kind: 'CCS_EXT_DOM_EXECUTE', reqId: domId, op: msg.op, payload: msg.payload });
      return;
    }
    if (msg.type === 'open-result') {
      postTo('main', { kind: 'CCS_EXT_OPEN_RESULT', reqId: msg.reqId, ok: msg.ok === true });
      return;
    }
  };

  // 帧内 main-world.js / dom-agent.js 的出站报文。它们不带 token（页面读得到也无妨），
  // 靠随指令下发的一次性 execId 认证：execId 只存在于被 main-world 截停的入站报文里。
  nativeAddEventListener.call(window, 'message', function (event) {
    if (event.source !== window) return;
    if (event.origin !== location.origin) return;
    var data = event.data;
    if (!data || data.__ccsExt !== true || data.proto !== PROTO) return;
    if (data.to !== 'iso') return;

    if (data.kind === 'CCS_EXT_EXECUTE_RESULT' && typeof data.reqId === 'string') {
      var reqId = pendingExec[data.reqId];
      if (reqId === undefined) return;
      delete pendingExec[data.reqId];
      post({
        type: 'exec-result',
        reqId: reqId,
        ok: data.ok === true,
        response: data.response,
        error: data.error
      });
    }

    if (data.kind === 'CCS_EXT_DOM_EXECUTE_RESULT' && typeof data.reqId === 'string') {
      var domReqId = pendingExec[data.reqId];
      if (domReqId === undefined) return;
      delete pendingExec[data.reqId];
      // result 是 {reply, documentUrl}，本层不拆：外壳靠 documentUrl 判帧内漂移。
      post({
        type: 'exec-result',
        reqId: domReqId,
        ok: data.ok === true,
        result: data.result,
        error: data.error
      });
    }

    // 帧内 lockdown 把一次开新窗口改道过来：只把地址转达给外壳。
    if (data.kind === 'CCS_EXT_OPEN_REQUEST' && typeof data.reqId === 'string') {
      post({ type: 'open-request', reqId: data.reqId, url: data.url });
    }
  });

  // 外壳向本帧索要句柄（EmbeddedFrame 的 FRAME_KEY_REQUEST）。句柄可能还没发下来，
  // 记住问询者，等原生回执到了再答。
  var asker = null;

  function replyFrameKey() {
    if (!frameKey || !asker) return;
    try {
      asker.source.postMessage(
        { __ccsExt: true, proto: PROTO, kind: 'CCS_EXT_FRAME_KEY', key: frameKey },
        asker.origin
      );
    } catch (_) {
      /* 问询者已消失 */
    }
  }

  nativeAddEventListener.call(window, 'message', function (event) {
    var data = event.data;
    if (!data || typeof data !== 'object' || data.__ccsShell !== 'ccs-frame-key-request') return;
    if (event.source !== window.parent) return;
    asker = { source: event.source, origin: event.origin };
    replyFrameKey();
  });

  // 取数执行器与 DOM 探针内联在这里（Java 侧把下面那行整句替换成 main-world.js +
  // dom-agent.js 的源码）。放在注册之前跑，是为了让开销能随首条消息一起报上去；
  // 它们抛错也不能拖垮注册，否则原生会永远看不到这一帧。
  var payloadStart = performance.now();
  var payloadError = null;
  try {
    var __ccsPayload = '__CCS_PAYLOAD__';
  } catch (e) {
    payloadError = String((e && e.message) || e);
  }
  payloadCostMs = Math.round((performance.now() - payloadStart) * 100) / 100;

  // 握手必须在 payload 之后：main-world.js 的监听器是它自己装的，早发就没人接。
  // 它只认第一条 HANDSHAKE，此时页面脚本尚未运行，抢不到这个位置。
  postTo('main', { kind: 'CCS_EXT_HANDSHAKE' });
  postTo('dom', { kind: 'CCS_EXT_HANDSHAKE' });

  post({
    type: 'frame-register',
    href: location.href,
    title: currentTitle(),
    headerWrap: hasHeaderWrap(),
    ancestors: ancestorOrigins(),
    payloadCostMs: payloadCostMs,
    payloadError: payloadError
  });

  // ── 自报变化：没有帧树 API，原生看不到 SPA 导航 ──────────────────────────

  var lastHref = location.href;
  var lastTitle = currentTitle();
  var timer = null;

  function sync() {
    timer = null;
    var href = location.href;
    var title = currentTitle();
    if (href === lastHref && title === lastTitle) return;
    lastHref = href;
    lastTitle = title;
    post({ type: 'frame-update', href: href, title: title });
  }

  function scheduleSync() {
    if (timer !== null) return;
    timer = setTimeout(sync, 200);
  }

  window.addEventListener('hashchange', scheduleSync);
  window.addEventListener('popstate', scheduleSync);
  window.addEventListener('load', scheduleSync);

  document.addEventListener('DOMContentLoaded', function () {
    scheduleSync();
    var head = document.head;
    if (!head) return;
    try {
      new MutationObserver(scheduleSync).observe(head, {
        subtree: true,
        childList: true,
        characterData: true
      });
    } catch (_) {
      /* 观察不了就只靠事件 */
    }
  });

  // 帧被移除时原生没有任何回调，主动注销是注册表的第一道自愈
  window.addEventListener('pagehide', function () {
    post({ type: 'frame-unregister' });
  });

  // 子系统自带的页头（.cssHeaderWrap）常常晚于注册才渲染出来，补报一次；
  // 看到就收工，15s 不出现就当这页没有，不能长期挂着观察器。
  document.addEventListener('DOMContentLoaded', function () {
    if (!document.body || hasHeaderWrap()) return;
    var observer;
    try {
      observer = new MutationObserver(function () {
        if (!hasHeaderWrap()) return;
        observer.disconnect();
        post({ type: 'frame-update', headerWrap: true });
      });
      observer.observe(document.body, { childList: true, subtree: true });
    } catch (_) {
      return;
    }
    setTimeout(function () {
      observer.disconnect();
    }, 15000);
  });
})();

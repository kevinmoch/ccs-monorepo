// CCS Fetch Proxy — ISOLATED world content script (runs in every frame).
//
// Responsibilities:
//  - All frames: register { origin, href, isTop } with the service worker at document_start,
//    re-sending on every navigation (this is what keeps the SW's frame registry fresh and what
//    the whitelist check relies on — no "tabs" permission is needed anywhere).
//  - Top frame (the ccs-framework shell): ask the SW for shell-check, then tell the MAIN world
//    script to install `window.ccsExtFetch` / `window.ccsExtDom`; afterwards bridge MAIN <-> SW
//    fetch and DOM traffic.
//  - Sub frames: ask the SW for lockdown-check (cross-origin frames under a whitelisted shell
//    get CCS_EXT_LOCKDOWN) and forward SW fetch-exec / dom-exec commands to the MAIN world.
//
// MAIN 侧的脚本与页面脚本同 realm，所以两个世界之间的报文都走一条带一次性 token 的
// 私有通道（见下方 bridgeToken）：页面既伪造不了指令，也抢答不了结果。
(() => {
  'use strict';

  const PROTO = 'ccs-fetch-proxy';
  const IS_TOP = window === window.top;

  // ─── 与同帧 MAIN 世界的私有通道 ────────────────────────────────────────
  // MAIN 世界与页面脚本共享 realm，光靠 event.source/origin 拦不住同源页面脚本：它能伪造
  // 指令，也能抢答结果。两个方向分开加固：
  //  · 入站（本层 → MAIN）：document_start 生成一次性随机 token 一并递过去，MAIN 侧的监听器
  //    早于页面任何脚本注册，收到发给自己的报文立刻 stopImmediatePropagation，页面学不到
  //    token，也就伪造不出 dom-exec / ENABLE / LOCKDOWN 这类指令。`to` 指明归谁消费与截停，
  //    两段 MAIN 脚本各管各的，谁也不会把对方的报文吃掉。
  //  · 出站（MAIN → 本层）：不截停（跨 world 的 stopImmediatePropagation 行为各版本不一，
  //    截停有掐死本层接收的风险），因此出站报文不带 token，改由随指令下发的一次性 execId
  //    认证——execId 只存在于被截停的入站报文里，页面猜不到；用过即删，重放也无效。
  // crypto.randomUUID 要求安全上下文，http 的子站点上是 undefined；getRandomValues 没这道限制
  const nonce = () =>
    Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
  const bridgeToken = nonce();
  const post = (to, msg) =>
    window.postMessage({ __ccsExt: true, proto: PROTO, to, token: bridgeToken, ...msg }, location.origin);
  const postToMain = (msg) => post('main', msg);
  const postToDom = (msg) => post('dom', msg);

  post('main', { kind: 'CCS_EXT_HANDSHAKE' });
  if (!IS_TOP) post('dom', { kind: 'CCS_EXT_HANDSHAKE' });

  // Runtime 消息的两种失败要分开说：
  //  - 扩展上下文失效（扩展刚在 chrome://extensions 更新而页面没刷新）：chrome.runtime.id
  //    不存在，sendMessage 直接抛——此时页面里的桥已死，只有刷新页面能恢复，必须说清；
  //  - SW 未应答（冷启动竞态等）：回调里带 lastError，把原始信息透传给调用方。
  const CONTEXT_DEAD = { ok: false, error: 'ccsExt: 扩展上下文已失效（扩展刚更新过），请刷新本页面后重试' };
  const send = (msg) =>
    new Promise((resolve) => {
      try {
        if (!chrome.runtime || !chrome.runtime.id) {
          resolve(CONTEXT_DEAD);
          return;
        }
        chrome.runtime.sendMessage(msg, (res) => {
          const err = chrome.runtime.lastError;
          if (res !== undefined && res !== null) {
            resolve(res);
          } else {
            resolve({ ok: false, error: `ccsExt: ${(err && err.message) || 'service worker unavailable'}` });
          }
        });
      } catch {
        resolve(CONTEXT_DEAD);
      }
    });

  // execId -> sendResponse callback, for fetch-exec / dom-exec commands forwarded to the MAIN world.
  // 键用一次性 execId 而不是 SW 的 reqId：它同时是结果报文的凭据（见上方通道说明）。
  const pendingExec = new Map();

  // Register on every navigation. document_start guarantees this fires before any page script
  // could confuse the registry.
  send({ __ccsExt: true, type: 'frame-register', origin: location.origin, href: location.href, isTop: IS_TOP });

  // Bounded retries: the SW may cold-start or still be processing this frame's registration
  // when the first check arrives, so a failed check is retried briefly before giving up.
  const CHECK_RETRY_DELAY_MS = 750;
  const CHECK_MAX_ATTEMPTS = 3;

  if (IS_TOP) {
    const requestEnable = async (attempt) => {
      const res = await send({ __ccsExt: true, type: 'shell-check', origin: location.origin });
      if (res && res.allowed) {
        postToMain({ kind: 'CCS_EXT_ENABLE' });
      } else if (attempt + 1 < CHECK_MAX_ATTEMPTS) {
        setTimeout(() => requestEnable(attempt + 1), CHECK_RETRY_DELAY_MS);
      }
    };
    requestEnable(0);
  } else {
    const requestLockdown = async (attempt) => {
      const res = await send({ __ccsExt: true, type: 'lockdown-check', origin: location.origin });
      // shell=true 表示「本帧确实在白名单外壳之下」，同源子帧也算；lockdown 只对跨域帧为真
      if (res && res.shell) {
        if (res.lockdown) postToMain({ kind: 'CCS_EXT_LOCKDOWN' });
        return;
      }
      if (attempt + 1 < CHECK_MAX_ATTEMPTS) {
        setTimeout(() => requestLockdown(attempt + 1), CHECK_RETRY_DELAY_MS);
        return;
      }
      // 重试用尽仍不是白名单外壳下的帧：让 dom-agent 撤掉它在 document_start 装上的监听器探针。
      // 那个探针改了 EventTarget.prototype 并吞掉 unload 注册，本不该留在无关站点的帧里。
      // 只在拿到明确答复时撤：压根收不到答复多半是扩展上下文失效/SW 冷启动慢，那种情况下
      // 误撤会让真外壳帧的角色提升掉一档，宁可保守留着。
      if (res) postToDom({ kind: 'CCS_EXT_DOM_DISARM' });
    };
    requestLockdown(0);
  }

  // MAIN world -> SW bridge (same frame, same origin)
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.origin !== location.origin) return;
    const data = event.data;
    if (!data || data.__ccsExt !== true || data.proto !== PROTO) return;
    // 只收发给自己的报文。出站报文不带 token（见上方通道说明）：结果类靠 pendingExec 里的
    // 一次性 execId 认证，顶层的请求类本就由外壳页面发起、由 SW 再校验白名单。
    if (data.to !== 'iso') return;

    if (IS_TOP && data.kind === 'CCS_EXT_FETCH_REQUEST') {
      send({
        __ccsExt: true,
        type: 'fetch-proxy-request',
        reqId: data.reqId,
        url: data.url,
        init: data.init,
        origin: location.origin
      }).then((res) => {
        // The SW replies with the target frame's { ok, response?, error? } envelope, or null when
        // the runtime message itself failed (SW asleep, extension reloading, ...).
        if (res && res.ok === true && res.response) {
          postToMain({ kind: 'CCS_EXT_FETCH_RESPONSE', reqId: data.reqId, ok: true, response: res.response });
        } else {
          postToMain({
            kind: 'CCS_EXT_FETCH_RESPONSE',
            reqId: data.reqId,
            ok: false,
            error: (res && res.error) || 'ccsExtFetch: extension service worker unavailable'
          });
        }
      });
      return;
    }

    if (!IS_TOP && data.kind === 'CCS_EXT_EXECUTE_RESULT') {
      const callback = pendingExec.get(data.reqId);
      if (callback) {
        pendingExec.delete(data.reqId);
        callback({ ok: data.ok === true, response: data.response, error: data.error });
      }
      return;
    }

    // 页面感知 / 页面操作：与 fetch 同一条链路，只是载荷是 DOM 指令而不是请求
    if (IS_TOP && data.kind === 'CCS_EXT_DOM_REQUEST') {
      send({
        __ccsExt: true,
        type: 'dom-proxy-request',
        reqId: data.reqId,
        targetUrl: data.targetUrl,
        op: data.op,
        payload: data.payload,
        origin: location.origin
      }).then((res) => {
        if (res && res.ok === true) {
          postToMain({ kind: 'CCS_EXT_DOM_RESPONSE', reqId: data.reqId, ok: true, result: res.result });
        } else {
          postToMain({
            kind: 'CCS_EXT_DOM_RESPONSE',
            reqId: data.reqId,
            ok: false,
            error: (res && res.error) || 'ccsExtDom: extension service worker unavailable'
          });
        }
      });
      return;
    }

    if (!IS_TOP && data.kind === 'CCS_EXT_DOM_EXECUTE_RESULT') {
      const callback = pendingExec.get(data.reqId);
      if (callback) {
        pendingExec.delete(data.reqId);
        callback({ ok: data.ok === true, result: data.result, error: data.error });
      }
    }
  });

  // 自报家门：同源帧可能有多个（弹窗转帧内跳转后 href 与 src 分叉），注册表只能猜。
  // 按 pathname 比较（容忍 SPA/hash/查询串变化），拒投让 service worker 换下一候选帧，
  // 避免把请求打进已失效/报错的那一帧。目标帧若拒投，会顺带自报实际地址供 SW 纠偏。
  const hrefMatches = (expected) => {
    if (!expected) return true;
    try {
      return new URL(expected).pathname === new URL(location.href).pathname;
    } catch {
      return true;
    }
  };

  // SW -> MAIN world command forwarding
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || msg.__ccsExt !== true) return false;

    // Broadcast discovery: the SW's in-memory frame registry is wiped whenever it is
    // idle-terminated, and static (already-loaded) frames never navigate again to re-register.
    // Re-announce this frame on demand so routing keeps working across SW restarts.
    if (msg.type === 'frame-ping') {
      send({ __ccsExt: true, type: 'frame-register', origin: location.origin, href: location.href, isTop: IS_TOP });
      sendResponse({ ok: true });
      return false;
    }

    if (!IS_TOP && msg.type === 'fetch-exec') {
      if (!hrefMatches(msg.expectHref)) {
        sendResponse({ ok: false, error: 'frame-url-mismatch', href: location.href });
        return false;
      }
      const execId = nonce();
      pendingExec.set(execId, sendResponse);
      postToMain({ kind: 'CCS_EXT_EXECUTE', reqId: execId, url: msg.url, init: msg.init });
      return true; // keep the sendResponse channel open for the async result
    }

    if (!IS_TOP && msg.type === 'dom-exec') {
      if (!hrefMatches(msg.expectHref)) {
        sendResponse({ ok: false, error: 'frame-url-mismatch', href: location.href });
        return false;
      }
      const execId = nonce();
      pendingExec.set(execId, sendResponse);
      postToDom({ kind: 'CCS_EXT_DOM_EXECUTE', reqId: execId, op: msg.op, payload: msg.payload });
      return true;
    }
    return false;
  });
})();

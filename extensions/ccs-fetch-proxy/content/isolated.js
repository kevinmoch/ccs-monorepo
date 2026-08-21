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
(() => {
  'use strict';

  const PROTO = 'ccs-fetch-proxy';
  const IS_TOP = window === window.top;

  const postToMain = (msg) => window.postMessage({ __ccsExt: true, proto: PROTO, ...msg }, location.origin);

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

  // reqId -> sendResponse callback, for fetch-exec / dom-exec commands forwarded to the MAIN world
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
      if (res && res.lockdown) {
        postToMain({ kind: 'CCS_EXT_LOCKDOWN' });
      } else if (attempt + 1 < CHECK_MAX_ATTEMPTS) {
        setTimeout(() => requestLockdown(attempt + 1), CHECK_RETRY_DELAY_MS);
      }
    };
    requestLockdown(0);
  }

  // MAIN world -> SW bridge (same frame, same origin only)
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.origin !== location.origin) return;
    const data = event.data;
    if (!data || data.__ccsExt !== true || data.proto !== PROTO) return;

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
      pendingExec.set(msg.reqId, sendResponse);
      postToMain({ kind: 'CCS_EXT_EXECUTE', reqId: msg.reqId, url: msg.url, init: msg.init });
      return true; // keep the sendResponse channel open for the async result
    }

    if (!IS_TOP && msg.type === 'dom-exec') {
      if (!hrefMatches(msg.expectHref)) {
        sendResponse({ ok: false, error: 'frame-url-mismatch', href: location.href });
        return false;
      }
      pendingExec.set(msg.reqId, sendResponse);
      postToMain({ kind: 'CCS_EXT_DOM_EXECUTE', reqId: msg.reqId, op: msg.op, payload: msg.payload });
      return true;
    }
    return false;
  });
})();

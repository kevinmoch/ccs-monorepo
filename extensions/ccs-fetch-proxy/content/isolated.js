// CCS Fetch Proxy — ISOLATED world content script (runs in every frame).
//
// Responsibilities:
//  - All frames: register { origin, href, isTop } with the service worker at document_start,
//    re-sending on every navigation (this is what keeps the SW's frame registry fresh and what
//    the whitelist check relies on — no "tabs" permission is needed anywhere).
//  - Top frame (the ccs-framework shell): ask the SW for shell-check, then tell the MAIN world
//    script to install `window.ccsExtFetch`; afterwards bridge MAIN <-> SW fetch traffic.
//  - Sub frames: ask the SW for lockdown-check (cross-origin frames under a whitelisted shell
//    get CCS_EXT_LOCKDOWN) and forward SW fetch-exec commands to the MAIN world executor.
(() => {
  'use strict';

  const PROTO = 'ccs-fetch-proxy';
  const IS_TOP = window === window.top;

  const postToMain = (msg) => window.postMessage({ __ccsExt: true, proto: PROTO, ...msg }, location.origin);

  // fire-and-forget runtime message with lastError swallowed (e.g. SW asleep or missing)
  const send = (msg) =>
    new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(msg, (res) => {
          void chrome.runtime.lastError;
          resolve(res ?? null);
        });
      } catch {
        resolve(null);
      }
    });

  // reqId -> sendResponse callback, for fetch-exec commands forwarded to the MAIN world
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
    }
  });

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
      pendingExec.set(msg.reqId, sendResponse);
      postToMain({ kind: 'CCS_EXT_EXECUTE', reqId: msg.reqId, url: msg.url, init: msg.init });
      return true; // keep the sendResponse channel open for the async result
    }
    return false;
  });
})();

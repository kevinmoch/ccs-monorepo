// CCS Fetch Proxy — MAIN world content script (runs in every frame, both worlds bridged
// by the same-frame ISOLATED script in content/isolated.js).
//
// Roles by frame:
//  - Top frame (the ccs-framework shell): installs `window.ccsExtFetch(input, init)` after the
//    ISOLATED layer confirms the shell whitelist. The API behaves like a standard fetch but the
//    request is executed inside a target sub-site iframe (same origin + that page's cookies).
//  - Sub frames: fetch executor (real `window.fetch` with credentials) and — for cross-origin
//    frames only, decided by the service worker — new-window lockdown.
//
// All postMessage traffic uses the envelope { __ccsExt: true, proto: 'ccs-fetch-proxy', kind }
// and only messages where event.source === window && event.origin === location.origin are
// accepted (same-frame, same-origin only).
(() => {
  'use strict';

  const PROTO = 'ccs-fetch-proxy';
  const IS_TOP = window === window.top;
  const REQUEST_TIMEOUT_MS = 30000;

  const postToIsolated = (msg) => window.postMessage({ __ccsExt: true, proto: PROTO, ...msg }, location.origin);

  // ─── base64 helpers (binary-safe body transport) ───────────────────────────
  function bytesToBase64(bytes) {
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  function base64ToBytes(b64) {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  // Keep only the structurally-cloneable parts of RequestInit. `credentials` is intentionally
  // not honored here — the executor always forces 'include'.
  function serializeInit(init) {
    const out = {};
    if (!init || typeof init !== 'object') return out;
    if (typeof init.method === 'string') out.method = init.method;
    if (init.headers != null) {
      const headers = [];
      if (typeof Headers !== 'undefined' && init.headers instanceof Headers) {
        init.headers.forEach((value, key) => headers.push([key, value]));
      } else if (Array.isArray(init.headers)) {
        for (const pair of init.headers) headers.push([String(pair[0]), String(pair[1])]);
      } else if (typeof init.headers === 'object') {
        for (const [key, value] of Object.entries(init.headers))
          headers.push([key, value == null ? '' : String(value)]);
      }
      out.headers = headers;
    }
    if (init.body != null) out.body = typeof init.body === 'string' ? init.body : String(init.body);
    return out;
  }

  function parseHeadersList(headers) {
    const init = [];
    if (Array.isArray(headers)) {
      for (const pair of headers) init.push([String(pair[0]), String(pair[1])]);
    }
    return init;
  }

  // ─── Top frame: window.ccsExtFetch ─────────────────────────────────────────
  const pendingTopRequests = new Map(); // reqId -> { resolve, reject, timer }

  function installCcsExtFetch() {
    if (typeof window.ccsExtFetch === 'function') return;

    window.ccsExtFetch = (input, init) =>
      new Promise((resolve, reject) => {
        let url;
        try {
          if (typeof input === 'string') url = new URL(input, location.href).href;
          else if (input instanceof URL) url = input.href;
          else if (input && typeof input.url === 'string') url = new URL(input.url, location.href).href;
          else throw new Error('unsupported RequestInfo');
        } catch (err) {
          reject(new TypeError(`ccsExtFetch: invalid request input (${err && err.message})`));
          return;
        }

        const reqId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        const timer = setTimeout(() => {
          if (pendingTopRequests.delete(reqId)) {
            reject(new Error(`ccsExtFetch: request timeout after ${REQUEST_TIMEOUT_MS}ms`));
          }
        }, REQUEST_TIMEOUT_MS);

        pendingTopRequests.set(reqId, { resolve, reject, timer });
        postToIsolated({ kind: 'CCS_EXT_FETCH_REQUEST', reqId, url, init: serializeInit(init) });
      });

    window.dispatchEvent(new CustomEvent('ccs-ext-fetch-ready'));
  }

  // 页面感知 / 页面操作桥（content/dom-agent.js 在目标帧里执行）。
  // 范围白名单一律由外壳传入，本层不带任何缺省。
  const pendingDomRequests = new Map(); // reqId -> { resolve, reject, timer }

  function installCcsExtDom() {
    if (window.ccsExtDom) return;

    const send = (targetUrl, op, payload) =>
      new Promise((resolve, reject) => {
        let url;
        try {
          url = new URL(targetUrl, location.href).href;
        } catch (err) {
          reject(new TypeError(`ccsExtDom: invalid target url (${err && err.message})`));
          return;
        }
        const reqId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        const timer = setTimeout(() => {
          if (pendingDomRequests.delete(reqId)) {
            reject(new Error(`ccsExtDom: ${op} timeout after ${REQUEST_TIMEOUT_MS}ms`));
          }
        }, REQUEST_TIMEOUT_MS);
        pendingDomRequests.set(reqId, { resolve, reject, timer });
        postToIsolated({ kind: 'CCS_EXT_DOM_REQUEST', reqId, targetUrl: url, op, payload });
      });

    window.ccsExtDom = {
      perceive: (targetUrl, scope) => send(targetUrl, 'perceive', scope),
      act: (targetUrl, request) => send(targetUrl, 'act', request)
    };

    window.dispatchEvent(new CustomEvent('ccs-ext-dom-ready'));
  }

  function settleDomRequest(data) {
    const entry = pendingDomRequests.get(data.reqId);
    if (!entry) return;
    pendingDomRequests.delete(data.reqId);
    clearTimeout(entry.timer);
    if (data.ok) entry.resolve(data.result);
    else entry.reject(new Error(data.error || 'ccsExtDom: request failed'));
  }

  function settleTopRequest(data) {
    const entry = pendingTopRequests.get(data.reqId);
    if (!entry) return;
    pendingTopRequests.delete(data.reqId);
    clearTimeout(entry.timer);

    if (data.ok && data.response) {
      const { status, statusText, headers, bodyBase64 } = data.response;
      // Match native fetch semantics: HTTP error statuses still resolve; only transport
      // failures reject.
      entry.resolve(
        new Response(bodyBase64 ? base64ToBytes(bodyBase64) : '', {
          status,
          statusText,
          headers: parseHeadersList(headers)
        })
      );
    } else {
      entry.reject(new Error(data.error || 'ccsExtFetch: request failed'));
    }
  }

  // ─── Sub frame: fetch executor ─────────────────────────────────────────────
  async function executeFetch(reqId, url, init) {
    try {
      const target = new URL(url, location.origin);
      // Anti-SSRF: the executor only talks to its own origin (same policy as the reference
      // proxy.html served by the ERP domain).
      if (target.origin !== location.origin) {
        throw new Error('Forbidden: cross-origin requests are not allowed');
      }

      const requestInit = {
        method: (init && init.method) || 'GET',
        credentials: 'include'
      };
      if (init && Array.isArray(init.headers) && init.headers.length)
        requestInit.headers = parseHeadersList(init.headers);
      if (init && init.body != null) requestInit.body = init.body;

      const res = await fetch(target.href, requestInit);
      const headers = [];
      res.headers.forEach((value, key) => headers.push([key, value]));
      const bodyBase64 = bytesToBase64(new Uint8Array(await res.arrayBuffer()));

      postToIsolated({
        kind: 'CCS_EXT_EXECUTE_RESULT',
        reqId,
        ok: true,
        response: { status: res.status, statusText: res.statusText, headers, bodyBase64 }
      });
    } catch (err) {
      postToIsolated({ kind: 'CCS_EXT_EXECUTE_RESULT', reqId, ok: false, error: (err && err.message) || String(err) });
    }
  }

  // ─── Sub frame: new-window lockdown (cross-origin frames only) ─────────────
  // Mirrors the same-origin handling already implemented by ccs-module-common's IframeCard.vue,
  // but works for cross-origin pages because the MAIN world script runs inside them.
  let lockdownActive = false;

  function activateLockdown() {
    if (lockdownActive) return;
    lockdownActive = true;

    const rewriteTarget = (el) => {
      if (el.target && el.target !== '_self') el.target = '_self';
    };
    const rewriteIn = (root) => {
      if (!root || !root.querySelectorAll) return;
      root.querySelectorAll('a[target]').forEach(rewriteTarget);
      root.querySelectorAll('form[target]').forEach(rewriteTarget);
    };

    const start = () => {
      const root = document.documentElement || document.body;
      if (!root) {
        document.addEventListener('DOMContentLoaded', start, { once: true });
        return;
      }
      rewriteIn(document);

      new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
            if (!(node instanceof Element)) continue;
            if (node.matches('a[target], form[target]')) rewriteTarget(node);
            rewriteIn(node);
          }
        }
      }).observe(root, { childList: true, subtree: true });
    };
    start();

    // Capture-phase fallback for links created/rewritten after mousedown but before click,
    // or handlers that restore target programmatically.
    document.addEventListener(
      'click',
      (event) => {
        const target = event.target;
        const anchor = target && target.closest ? target.closest('a[target]') : null;
        if (anchor) rewriteTarget(anchor);
      },
      true
    );

    // window.open(url) → navigate this frame instead of popping a new window out of the shell.
    // about:blank / javascript: 不拦：前者被页面用来开空白页写字（打印预览等），改成帧内跳转
    // 会把本帧导航成空页；后者在 location 赋值里语义不同，退回原生行为。
    const originalOpen = window.open;
    window.open = function (url) {
      const href = url == null ? '' : String(url);
      if (href !== '' && !/^about:blank/i.test(href) && !/^javascript:/i.test(href)) {
        location.href = href;
        return window;
      }
      return originalOpen ? originalOpen.apply(this, arguments) : null;
    };
  }

  // ─── Message dispatch ──────────────────────────────────────────────────────
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.origin !== location.origin) return;
    const data = event.data;
    if (!data || data.__ccsExt !== true || data.proto !== PROTO) return;

    if (IS_TOP) {
      if (data.kind === 'CCS_EXT_ENABLE') {
        installCcsExtFetch();
        installCcsExtDom();
      } else if (data.kind === 'CCS_EXT_FETCH_RESPONSE') settleTopRequest(data);
      else if (data.kind === 'CCS_EXT_DOM_RESPONSE') settleDomRequest(data);
    } else {
      if (data.kind === 'CCS_EXT_EXECUTE') executeFetch(data.reqId, data.url, data.init);
      else if (data.kind === 'CCS_EXT_LOCKDOWN') activateLockdown();
    }
  });
})();

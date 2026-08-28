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
// ISOLATED ↔ MAIN 的报文走一条私有通道：页面脚本与本脚本同 realm，光按 event.source /
// event.origin 过滤挡不住它伪造指令或抢答结果。入站指令验一次性 token（document_start 由
// ISOLATED 递来），并在页面任何监听器之前截停；出站报文不带 token，改用一次性 execId 认证。
(() => {
  'use strict';

  const PROTO = 'ccs-fetch-proxy';
  const IS_TOP = window === window.top;
  const REQUEST_TIMEOUT_MS = 30000;

  // 原生引用在 document_start 取好，页面之后改原型也劫持不到这条链路
  const nativeAddEventListener = EventTarget.prototype.addEventListener;
  const nativeStopImmediate = Event.prototype.stopImmediatePropagation;
  const nativePostMessage = window.postMessage;
  let bridgeToken;

  // 出站报文不带 token：它不截停，页面读得到。结果类报文靠 ISOLATED 发下的一次性
  // execId 认证（见 isolated.js）；顶层的请求类报文本就由外壳页面自己发起，SW 会再校验白名单。
  const postToIsolated = (msg) =>
    nativePostMessage.call(window, { __ccsExt: true, proto: PROTO, to: 'iso', ...msg }, location.origin);

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
  // 报文体就是 SDK 的 `PageAgentRequest`，本层不认识它的内容，只按 `type` 选一个 op 供
  // service worker 校验，别的一律原样转发——协议归 SDK 管，改协议不该改这一层。
  const pendingDomRequests = new Map(); // reqId -> { resolve, reject, timer }

  function installCcsExtDom() {
    if (window.ccsExtDom) return;

    const send = (targetUrl, request) =>
      new Promise((resolve, reject) => {
        let url;
        try {
          url = new URL(targetUrl, location.href).href;
        } catch (err) {
          reject(new TypeError(`ccsExtDom: invalid target url (${err && err.message})`));
          return;
        }
        const op = request && request.type === 'execute' ? 'act' : 'perceive';
        const reqId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        const timer = setTimeout(() => {
          if (pendingDomRequests.delete(reqId)) {
            reject(new Error(`ccsExtDom: ${op} timeout after ${REQUEST_TIMEOUT_MS}ms`));
          }
        }, REQUEST_TIMEOUT_MS);
        pendingDomRequests.set(reqId, { resolve, reject, timer });
        postToIsolated({ kind: 'CCS_EXT_DOM_REQUEST', reqId, targetUrl: url, op, payload: request });
      });

    // 解析值为 { reply: PageAgentReply, documentUrl }：外壳按 URL 寻址目标帧，
    // 帧在请求途中导航过就要能看出来，所以应答必须带回它实际所处的地址。
    window.ccsExtDom = { send };

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

  // 下载观察窗桥（SDK 0.15.0 分册 15）。外壳一次页面操作前 open、操作后 settle，
  // 拿回的只有一个计数——文件名/大小/类型都不经过这条通路。
  const pendingDownloadRequests = new Map(); // reqId -> { resolve, reject, timer }

  function installCcsExtDownloads() {
    if (window.ccsExtDownloads) return;

    const ask = (op, payload) =>
      new Promise((resolve, reject) => {
        const reqId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        const timer = setTimeout(() => {
          if (pendingDownloadRequests.delete(reqId)) {
            reject(new Error(`ccsExtDownloads: ${op} timeout after ${REQUEST_TIMEOUT_MS}ms`));
          }
        }, REQUEST_TIMEOUT_MS);
        pendingDownloadRequests.set(reqId, { resolve, reject, timer });
        postToIsolated({ kind: 'CCS_EXT_DOWNLOAD_REQUEST', reqId, op, ...payload });
      });

    window.ccsExtDownloads = {
      open: () => ask('open', {}).then((data) => data.token),
      settle: (token, timeoutMs) => ask('settle', { token, timeoutMs }).then((data) => data.count || 0)
    };

    window.dispatchEvent(new CustomEvent('ccs-ext-downloads-ready'));
  }

  function settleDownloadRequest(data) {
    const entry = pendingDownloadRequests.get(data.reqId);
    if (!entry) return;
    pendingDownloadRequests.delete(data.reqId);
    clearTimeout(entry.timer);
    if (data.ok) entry.resolve(data);
    else entry.reject(new Error(data.error || 'ccsExtDownloads: request failed'));
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

    const SAFE = '_self';
    // `_top` / `_parent` 也算逃逸：它们不开新窗口，但会把整个外壳导航走，比开新窗口更糟
    const escaping = (value) => typeof value === 'string' && value !== '' && value.toLowerCase() !== SAFE;

    const rewriteTarget = (el) => {
      if (escaping(el.target)) el.target = SAFE;
    };
    // <button formtarget> / <input formtarget> 覆盖表单自己的 target，只改 form 拦不住
    const rewriteFormTarget = (el) => {
      if (escaping(el.formTarget)) el.formTarget = SAFE;
    };
    const rewriteIn = (root) => {
      if (!root || !root.querySelectorAll) return;
      // <base target> 让**不带 target 属性**的链接也开新窗口，只扫 a[target] 会整片漏掉
      root.querySelectorAll('a[target], area[target], form[target], base[target]').forEach(rewriteTarget);
      root.querySelectorAll('button[formtarget], input[formtarget]').forEach(rewriteFormTarget);
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
          if (mutation.type === 'attributes') {
            const el = mutation.target;
            if (mutation.attributeName === 'formtarget') rewriteFormTarget(el);
            else if (el.matches && el.matches('a, area, form, base')) rewriteTarget(el);
            continue;
          }
          for (const node of mutation.addedNodes) {
            if (!(node instanceof Element)) continue;
            if (node.matches('a[target], area[target], form[target], base[target]')) rewriteTarget(node);
            if (node.matches('button[formtarget], input[formtarget]')) rewriteFormTarget(node);
            rewriteIn(node);
          }
        }
        // 改回 _self 会再触发一轮 attributes 记录，但那一轮 escaping() 为假，不会自激
      }).observe(root, {
        childList: true,
        subtree: true,
        // 属性也要看：SPA 常在**已存在**的元素上改 target，那不是 childList 变更
        attributes: true,
        attributeFilter: ['target', 'formtarget']
      });
    };
    start();

    /**
     * 属性/特性写入处的兜底。扫描 + 冒泡都够不着「造出来就点、从不入 DOM」的锚：
     *   const a = document.createElement('a'); a.target = '_blank'; a.click();
     * 它不在文档树里，click 事件不会传到 document，只能在赋值那一刻就把值掰回来。
     */
    const coerceTargetProp = (ctor, prop) => {
      if (!ctor || !ctor.prototype) return;
      const desc = Object.getOwnPropertyDescriptor(ctor.prototype, prop);
      if (!desc || typeof desc.get !== 'function' || typeof desc.set !== 'function') return;
      Object.defineProperty(ctor.prototype, prop, {
        configurable: true,
        enumerable: desc.enumerable,
        get() {
          return desc.get.call(this);
        },
        set(value) {
          desc.set.call(this, escaping(String(value)) ? SAFE : value);
        }
      });
    };
    coerceTargetProp(window.HTMLAnchorElement, 'target');
    coerceTargetProp(window.HTMLAreaElement, 'target');
    coerceTargetProp(window.HTMLFormElement, 'target');
    coerceTargetProp(window.HTMLBaseElement, 'target');
    coerceTargetProp(window.HTMLButtonElement, 'formTarget');
    coerceTargetProp(window.HTMLInputElement, 'formTarget');

    // 反射属性走 setAttribute 时不会经过上面的 setter（React 等框架就是这么写 target 的）
    const TARGET_TAGS = { A: 1, AREA: 1, FORM: 1, BASE: 1 };
    const FORM_TARGET_TAGS = { BUTTON: 1, INPUT: 1 };
    const nativeSetAttribute = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function (name, value) {
      if (typeof name === 'string' && escaping(String(value))) {
        const lower = name.toLowerCase();
        if (
          (lower === 'target' && TARGET_TAGS[this.tagName]) ||
          (lower === 'formtarget' && FORM_TARGET_TAGS[this.tagName])
        ) {
          return nativeSetAttribute.call(this, name, SAFE);
        }
      }
      return nativeSetAttribute.call(this, name, value);
    };

    // Capture-phase fallback for links created/rewritten after mousedown but before click,
    // or handlers that restore target programmatically.
    document.addEventListener(
      'click',
      (event) => {
        // composedPath 而不是 target.closest：影子树里的锚会被重定向成宿主元素，closest 找不到它
        const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
        for (const node of path) {
          if (!node || node.nodeType !== 1) continue;
          const tag = node.tagName;
          if (tag === 'BUTTON' || tag === 'INPUT') rewriteFormTarget(node);
          else if (tag === 'A' || tag === 'AREA' || tag === 'FORM') {
            rewriteTarget(node);
            break;
          }
        }
      },
      true
    );

    // window.open(url) → navigate this frame instead of popping a new window out of the shell.
    // javascript: 不拦：它在 location 赋值里语义不同，退回原生行为。
    const originalOpen = window.open;
    const nativeOpen = (args) => (originalOpen ? originalOpen.apply(window, args) : null);

    /**
     * `window.open('', '_blank')` 之后再给 `location.href` 赋值——绕弹窗拦截器的经典写法，
     * 也是本次实测里漏得最狠的一条。直接放行原生 open 等于白锁；但直接不开又会打断
     * 「开空白页往里 write」的打印预览。所以先给一个替身：
     *   - 赋 `location` → 本帧跳转（想开的那一页仍然到得了，只是留在外壳里）；
     *   - 碰 `document` 之类真需要窗口的东西 → 那一刻才开真窗口并转发。
     */
    const blankWindowStub = () => {
      let real;
      const ensureReal = () => {
        if (real === undefined) real = nativeOpen(['', '_blank']);
        return real;
      };
      const navigateSelf = (href) => {
        const text = href == null ? '' : String(href);
        if (text !== '' && !/^about:blank/i.test(text)) location.href = text;
      };
      const location_ = {
        get href() {
          return location.href;
        },
        set href(value) {
          navigateSelf(value);
        },
        assign: navigateSelf,
        replace: navigateSelf
      };
      const noop = () => undefined;
      const shims = { location: location_, closed: false, opener: window, name: '', close: noop, focus: noop, blur: noop };
      return new Proxy(
        {},
        {
          get(_target, prop) {
            if (prop in shims) return shims[prop];
            const win = ensureReal();
            if (!win) return undefined;
            const value = win[prop];
            return typeof value === 'function' ? value.bind(win) : value;
          },
          set(_target, prop, value) {
            if (prop === 'location') {
              navigateSelf(value);
              return true;
            }
            const win = ensureReal();
            if (win) win[prop] = value;
            return true;
          }
        }
      );
    };

    window.open = function (url) {
      const href = url == null ? '' : String(url);
      if (/^javascript:/i.test(href)) return nativeOpen(arguments);
      if (href === '' || /^about:blank/i.test(href)) return blankWindowStub();
      location.href = href;
      return window;
    };
  }

  // ─── Message dispatch ──────────────────────────────────────────────────────
  // 本监听器在 document_start 注册，早于页面任何脚本，所以发给本脚本的报文一律就地截停：
  // 页面既学不到 token，也看不见指令内容。`to === 'dom'` 是 dom-agent.js 的报文，放行给它；
  // 出站（to === 'iso'）不截停——跨 world 的 stopImmediatePropagation 行为各版本不一，
  // 截停它有掐死 ISOLATED 接收的风险，故出站改用一次性 execId 认证（见 isolated.js）。
  nativeAddEventListener.call(window, 'message', (event) => {
    if (event.source !== window) return;
    if (event.origin !== location.origin) return;
    const data = event.data;
    if (!data || data.__ccsExt !== true || data.proto !== PROTO) return;
    if (data.to !== 'main') return;
    nativeStopImmediate.call(event);

    if (data.kind === 'CCS_EXT_HANDSHAKE') {
      // 只认第一条：它由 document_start 的 ISOLATED 脚本发出，页面脚本此时还没机会运行
      if (bridgeToken === undefined && typeof data.token === 'string') bridgeToken = data.token;
      return;
    }
    if (bridgeToken === undefined || data.token !== bridgeToken) return;

    if (IS_TOP) {
      if (data.kind === 'CCS_EXT_ENABLE') {
        installCcsExtFetch();
        installCcsExtDom();
        installCcsExtDownloads();
      } else if (data.kind === 'CCS_EXT_FETCH_RESPONSE') settleTopRequest(data);
      else if (data.kind === 'CCS_EXT_DOM_RESPONSE') settleDomRequest(data);
      else if (data.kind === 'CCS_EXT_DOWNLOAD_RESPONSE') settleDownloadRequest(data);
    } else {
      if (data.kind === 'CCS_EXT_EXECUTE') executeFetch(data.reqId, data.url, data.init);
      else if (data.kind === 'CCS_EXT_LOCKDOWN') activateLockdown();
    }
  });
})();

// CCS Fetch Proxy — MV3 service worker.
//
// State:
//  - Shell whitelist (origins) in chrome.storage.sync, defaults to https://localhost:3000,
//    editable from the options page.
//  - In-memory frame registry keyed by "tabId:frameId", refreshed by every frame's
//    document_start `frame-register` message. The registry's top-frame entry is the source of
//    truth for whitelist checks — no "tabs" permission is required because content scripts
//    self-report location.href.
//
// Routing: fetch-proxy-request carries the absolute endpoint URL; the SW picks the most
// recently registered non-top frame whose origin matches the endpoint origin and forwards the
// command to that exact frame. New-window lockdown is decided per frame: top-level shell must
// be whitelisted AND the frame origin must differ from the shell origin (same-origin module
// iframes are left untouched).

const DEFAULT_SHELL_WHITELIST = ['https://localhost:3000'];
const STORAGE_KEY = 'shellWhitelist';

// "tabId:frameId" -> { tabId, frameId, origin, href, isTop, ts }
const frameRegistry = new Map();

// Normalizes any whitelist entry or self-reported origin to a comparable origin string.
// Tolerant by design: entries may carry a path, query string, hash or trailing slash
// (e.g. "https://localhost:3000/?login=tenant" === "https://localhost:3000").
function toOrigin(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  try {
    return new URL(text).origin.toLowerCase();
  } catch {
    return text.replace(/[\/]+$/, '').toLowerCase();
  }
}

async function getWhitelist() {
  const stored = await chrome.storage.sync.get({ [STORAGE_KEY]: DEFAULT_SHELL_WHITELIST });
  const list = stored[STORAGE_KEY] || [];
  return list.map(toOrigin).filter(Boolean);
}

async function whitelistAllows(origin) {
  const normalized = toOrigin(origin);
  if (!normalized) return false;
  return (await getWhitelist()).includes(normalized);
}

function topFrameOf(tabId) {
  for (const entry of frameRegistry.values()) {
    if (entry.tabId === tabId && entry.isTop) return entry;
  }
  return null;
}

async function isShellTab(tabId, selfOrigin) {
  // Trust the sender's self-reported origin first — immune to registry timing races during
  // the login redirect flow (localhost → ERP login page → back to localhost) and to SW cold
  // starts where the frame-register message may not have been processed yet.
  if (selfOrigin && (await whitelistAllows(selfOrigin))) return true;
  if (tabId == null) return false;
  const top = topFrameOf(tabId);
  if (!top) return false;
  return whitelistAllows(top.origin);
}

async function routeFetchRequest(msg, sender) {
  const tabId = sender.tab && sender.tab.id;

  let targetOrigin;
  try {
    targetOrigin = new URL(msg.url).origin;
  } catch {
    return { ok: false, error: `Invalid request URL: ${msg.url}` };
  }

  const candidates = [];
  for (const entry of frameRegistry.values()) {
    if (entry.tabId === tabId && entry.frameId !== 0 && entry.origin === targetOrigin) candidates.push(entry);
  }
  if (!candidates.length) {
    return {
      ok: false,
      error: `未找到已打开的目标子网站页面（origin: ${targetOrigin}），请先在主窗口打开对应页面（如待办任务）后重试`
    };
  }
  candidates.sort((a, b) => b.ts - a.ts);

  const target = candidates[0];
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(
      tabId,
      { __ccsExt: true, proto: 'ccs-fetch-proxy', type: 'fetch-exec', reqId: msg.reqId, url: msg.url, init: msg.init },
      { frameId: target.frameId },
      (res) => {
        if (chrome.runtime.lastError) {
          // Frame navigated away or was removed — drop the stale entry and surface a clear error.
          frameRegistry.delete(`${tabId}:${target.frameId}`);
          resolve({
            ok: false,
            error: `目标页面已失效（${chrome.runtime.lastError.message}），请重新打开对应页面后重试`
          });
          return;
        }
        resolve(
          res && res.ok === true ? res : { ok: false, error: (res && res.error) || '目标页面未返回结果，请重试' }
        );
      }
    );
  });
}

async function handleMessage(msg, sender) {
  const tabId = sender.tab && sender.tab.id;
  const frameId = sender.frameId == null ? 0 : sender.frameId;

  switch (msg.type) {
    case 'frame-register': {
      if (tabId == null) return { ok: true };
      frameRegistry.set(`${tabId}:${frameId}`, {
        tabId,
        frameId,
        origin: toOrigin(msg.origin),
        href: msg.href || '',
        isTop: Boolean(msg.isTop) || frameId === 0,
        ts: Date.now()
      });
      return { ok: true };
    }

    case 'shell-check': {
      if (frameId !== 0) return { allowed: false };
      // Sender's self-reported origin is authoritative; registry is only a fallback.
      return { allowed: await isShellTab(tabId, msg.origin) };
    }

    case 'lockdown-check': {
      if (frameId === 0) return { lockdown: false };
      if (!(await isShellTab(tabId))) return { lockdown: false };
      const top = topFrameOf(tabId);
      const selfOrigin = toOrigin(msg.origin);
      // Cross-origin frames only: same-origin module iframes keep their existing behavior
      // (IframeCard.vue already handles same-origin lockdown on its own).
      return { lockdown: Boolean(top) && selfOrigin !== top.origin };
    }

    case 'fetch-proxy-request': {
      if (frameId !== 0)
        return { ok: false, error: 'Forbidden: only the top-level shell frame can issue proxied fetch requests' };
      if (!(await isShellTab(tabId, msg.origin)))
        return { ok: false, error: 'Forbidden: shell origin is not whitelisted (see extension options)' };
      return routeFetchRequest(msg, sender);
    }

    default:
      return {};
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.__ccsExt !== true) return false;
  handleMessage(msg, sender)
    .then(sendResponse)
    .catch((err) => sendResponse({ ok: false, error: (err && err.message) || String(err) }));
  return true; // async response
});

chrome.tabs.onRemoved.addListener((tabId) => {
  for (const [key, entry] of [...frameRegistry.entries()]) {
    if (entry.tabId === tabId) frameRegistry.delete(key);
  }
});

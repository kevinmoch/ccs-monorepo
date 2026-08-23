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

// Frames only register at document_start, but the in-memory registry is wiped whenever the MV3
// service worker is idle-terminated (~30s) — and static, already-loaded frames never navigate
// again, so they would stay unregistered forever. On a routing miss we actively rediscover:
// broadcast frame-ping to every frame in the tab; each frame's ISOLATED script re-registers in
// response. After a short grace period the caller can retry the lookup with a warm registry.
function discoverFrames(tabId) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    try {
      chrome.tabs.sendMessage(tabId, { __ccsExt: true, proto: 'ccs-fetch-proxy', type: 'frame-ping' }, () => {
        void chrome.runtime.lastError; // some frames may not answer; ignore
      });
    } catch {
      /* tab already gone */
    }
    setTimeout(finish, 500);
  });
}

function findFrameCandidates(tabId, targetOrigin) {
  const candidates = [];
  for (const entry of frameRegistry.values()) {
    if (entry.tabId === tabId && entry.frameId !== 0 && entry.origin === targetOrigin) candidates.push(entry);
  }
  return candidates.sort((a, b) => b.ts - a.ts);
}

// The caller hands us the exact iframe src. Ranking on origin + recency alone silently prefers
// whatever same-origin frame registered last — a hidden helper/download frame the sub-system
// opened after the real page — which answers with an almost empty document instead of failing.
function rankByUrl(candidates, targetUrl) {
  let targetPath;
  try {
    targetPath = new URL(targetUrl).pathname;
  } catch {
    targetPath = undefined;
  }
  const score = (entry) => {
    if (entry.href === targetUrl) return 2;
    if (targetPath === undefined) return 0;
    try {
      // In-frame navigation keeps the iframe's src attribute but changes location.href,
      // so the path is the strongest signal that survives it.
      return new URL(entry.href).pathname === targetPath ? 1 : 0;
    } catch {
      return 0;
    }
  };
  return [...candidates].sort((a, b) => score(b) - score(a) || b.ts - a.ts);
}

// 帧失语（ISOLATED 已转发但 MAIN 永不回音等）时 sendMessage 的回调永远不来；
// 没有超时，多候选循环会吊死在第一个失语帧上，后续候选与兜底都轮不到
const FRAME_RESPONSE_TIMEOUT_MS = 5000;

function sendToFrame(tabId, frameId, command) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => finish({ res: undefined, timedOut: true }), FRAME_RESPONSE_TIMEOUT_MS);
    chrome.tabs.sendMessage(tabId, { __ccsExt: true, proto: 'ccs-fetch-proxy', ...command }, { frameId }, (res) => {
      const lastError = chrome.runtime.lastError;
      finish({ res: lastError ? undefined : res, lastError });
    });
  });
}

async function routeToFrame(tabId, targetUrl, command) {
  let targetOrigin;
  try {
    targetOrigin = new URL(targetUrl).origin;
  } catch {
    return { ok: false, error: `Invalid target URL: ${targetUrl}` };
  }

  let candidates = findFrameCandidates(tabId, targetOrigin);
  // Zero: registry may be cold (SW restarted). More than one: the registered hrefs may predate
  // in-frame navigation, and stale hrefs would misrank. Both cases want a fresh round.
  if (candidates.length !== 1) {
    await discoverFrames(tabId);
    candidates = findFrameCandidates(tabId, targetOrigin);
  }
  if (!candidates.length) {
    return {
      ok: false,
      error: `未找到已打开的目标子网站页面（origin: ${targetOrigin}），请先在主窗口打开对应页面（如待办任务）后重试`
    };
  }

  // 同源多帧时注册表的 href 可能是旧的（帧内导航不改 iframe 的 src），排序只是猜。
  // 多候选才带 expectHref 让目标帧自验：拒投就纠偏注册表并顺延下一候选；全部拒投时退回
  // 最佳猜测投递（首帧的 src 属性天然滞后于帧内导航，不能因自验失败就整体拒绝）。
  // expectHref 是页面地址语义，只对 dom-exec 有意义：fetch-exec 的 targetUrl 是 API 端点，
  // 拿去跟帧的 location.pathname 比对必然全部拒投，白白多绕一圈才落到兜底。
  const ranked = rankByUrl(candidates, targetUrl);
  const verify = command.type === 'dom-exec' ? { expectHref: targetUrl } : {};
  let lastFailure;
  if (ranked.length > 1) {
    for (const target of ranked) {
      const { res, lastError, timedOut } = await sendToFrame(tabId, target.frameId, { ...command, ...verify });
      if (timedOut) {
        // 超时不是帧死了（可能只是在忙），注册表条目留着，顺延下一候选
        lastFailure = '目标页面响应超时，请重试';
        continue;
      }
      if (lastError) {
        // Frame navigated away or was removed — drop the stale entry and try the next candidate.
        frameRegistry.delete(`${tabId}:${target.frameId}`);
        lastFailure = `目标页面已失效（${lastError.message}），请重新打开对应页面后重试`;
        continue;
      }
      if (res && res.error === 'frame-url-mismatch') {
        // 帧自报的实际地址写回注册表，后续请求不用再猜
        if (res.href) frameRegistry.set(`${tabId}:${target.frameId}`, { ...target, href: res.href, ts: Date.now() });
        lastFailure = '目标页面地址已变化，未命中候选帧';
        continue;
      }
      return res && res.ok === true ? res : { ok: false, error: (res && res.error) || '目标页面未返回结果，请重试' };
    }
  }
  // 兜底挑仍在注册表里的最佳候选：循环里被删的条目已确认失效，不值得再投一次
  const fallback = ranked.find((target) => frameRegistry.has(`${tabId}:${target.frameId}`)) ?? ranked[0];
  const { res, lastError, timedOut } = await sendToFrame(tabId, fallback.frameId, command);
  if (timedOut) {
    return { ok: false, error: lastFailure ?? '目标页面响应超时，请重试' };
  }
  if (lastError) {
    frameRegistry.delete(`${tabId}:${fallback.frameId}`);
    return {
      ok: false,
      error: `目标页面已失效（${lastError.message}），请重新打开对应页面后重试`
    };
  }
  return res && res.ok === true
    ? res
    : { ok: false, error: (res && res.error) || lastFailure || '目标页面未返回结果，请重试' };
}

function routeFetchRequest(msg, sender) {
  return routeToFrame(sender.tab && sender.tab.id, msg.url, {
    type: 'fetch-exec',
    reqId: msg.reqId,
    url: msg.url,
    init: msg.init
  });
}

// Page perception / page action share the fetch routing: same tab, same origin match, same
// "open the page first" failure mode. Only the forwarded command differs.
function routeDomRequest(msg, sender) {
  return routeToFrame(sender.tab && sender.tab.id, msg.targetUrl, {
    type: 'dom-exec',
    reqId: msg.reqId,
    op: msg.op,
    payload: msg.payload
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
      if (frameId === 0) return { lockdown: false, shell: false };
      if (!(await isShellTab(tabId))) {
        // Cold registry (SW restarted, static top frame never re-registered) — rediscover first.
        await discoverFrames(tabId);
        if (!(await isShellTab(tabId))) return { lockdown: false, shell: false };
      }
      const top = topFrameOf(tabId);
      const selfOrigin = toOrigin(msg.origin);
      // Cross-origin frames only: same-origin module iframes keep their existing behavior
      // (IframeCard.vue already handles same-origin lockdown on its own).
      // `shell` 与 lockdown 分开报：同源子帧也可能收到 dom-exec，它需要知道自己在白名单外壳
      // 之下（好留着 dom-agent 的监听器探针），而 lockdown 只对跨域帧成立。
      return { lockdown: Boolean(top) && selfOrigin !== top.origin, shell: true };
    }

    case 'fetch-proxy-request': {
      if (frameId !== 0)
        return { ok: false, error: 'Forbidden: only the top-level shell frame can issue proxied fetch requests' };
      if (!(await isShellTab(tabId, msg.origin)))
        return { ok: false, error: 'Forbidden: shell origin is not whitelisted (see extension options)' };
      return routeFetchRequest(msg, sender);
    }

    case 'dom-proxy-request': {
      if (frameId !== 0)
        return {
          ok: false,
          error: 'Forbidden: only the top-level shell frame can issue page perception/action commands'
        };
      if (!(await isShellTab(tabId, msg.origin)))
        return { ok: false, error: 'Forbidden: shell origin is not whitelisted (see extension options)' };
      if (msg.op !== 'perceive' && msg.op !== 'act')
        return { ok: false, error: `Unsupported DOM operation: ${msg.op}` };
      return routeDomRequest(msg, sender);
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

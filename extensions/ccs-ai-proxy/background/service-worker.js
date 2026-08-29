// CCS Fetch Proxy — MV3 service worker.
//
// State:
//  - Shell whitelist (origins) in chrome.storage.sync, editable from the options page.
//    The factory default lives in shared/whitelist-defaults.js — shared with the options page
//    so the two can never drift apart.
//  - In-memory frame registry keyed by "tabId:frameId", refreshed by every frame's
//    document_start `frame-register` message. It is used for frame addressing only; whitelist
//    checks go through the browser-supplied ancestor chain (see shellOriginFor) because the
//    registry is wiped whenever MV3 idle-terminates this worker.
//
// Routing: fetch-proxy-request carries the absolute endpoint URL; the SW picks the most
// recently registered non-top frame whose origin matches the endpoint origin and forwards the
// command to that exact frame. New-window lockdown is decided per frame: top-level shell must
// be whitelisted AND the frame origin must differ from the shell origin (same-origin module
// iframes are left untouched).

importScripts('/shared/whitelist-defaults.js');

const DEFAULT_SHELL_WHITELIST = self.CCS_DEFAULT_SHELL_WHITELIST;
const STORAGE_KEY = 'shellWhitelist';

// "tabId:frameId" -> { tabId, frameId, key, origin, href, title, isTop, ts }
const frameRegistry = new Map();

// ─── 帧句柄 ───────────────────────────────────────────────────────────────────
//
// 按 URL 投递只比 origin + pathname（见 rankByUrl）。工作集一开就是若干个同为 `/ierp/`、
// 只有 query 不同的隐藏帧——它们彼此不可区分，排序纯属猜。句柄改由 SW 发放并绑定到
// "tabId:frameId"：帧内导航不改 frameId，所以它跨「列表 → 详情」依然有效。
//
// 存进 storage.session 是为了熬过 MV3 的空闲回收：注册表清空后若重新发号，外壳手里的
// 工作集句柄会在一次 30 秒静默之后集体失效，而那正是用户读一段回复的时间。
const FRAME_KEY_STORE = 'frameKeys';

/** "tabId:frameId" -> key；null 表示还没从 storage.session 读回来 */
let frameKeys = null;

async function loadFrameKeys() {
  if (frameKeys === null) {
    const stored = await chrome.storage.session.get({ [FRAME_KEY_STORE]: {} });
    frameKeys = stored[FRAME_KEY_STORE] || {};
  }
  return frameKeys;
}

async function frameKeyFor(slot) {
  const keys = await loadFrameKeys();
  if (!keys[slot]) {
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    keys[slot] = `frm-${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
    await chrome.storage.session.set({ [FRAME_KEY_STORE]: keys });
  }
  return keys[slot];
}

async function dropFrameKeys(predicate) {
  const keys = await loadFrameKeys();
  let changed = false;
  for (const slot of Object.keys(keys)) {
    if (!predicate(slot)) continue;
    delete keys[slot];
    changed = true;
  }
  if (changed) await chrome.storage.session.set({ [FRAME_KEY_STORE]: keys });
}

function findFrameByKey(tabId, key) {
  for (const entry of frameRegistry.values()) {
    if (entry.tabId === tabId && entry.key === key) return entry;
  }
  return null;
}

// ─── 外壳事件推送 ─────────────────────────────────────────────────────────────
//
// 到目前为止这条链路上每一条报文都是外壳发起的请求/应答对，帧内发生的事外壳一无所知：
// 用户自己点开一层子页面、或者一次页面操作开出了新页，都没有任何东西会告诉外壳。
// 这里补上唯一的反向通路——只发往顶层帧（外壳自己），子帧收不到。
function notifyShell(tabId, event) {
  if (tabId == null) return;
  try {
    chrome.tabs.sendMessage(
      tabId,
      { __ccsExt: true, proto: 'ccs-fetch-proxy', type: 'shell-event', event },
      { frameId: 0 },
      () => {
        void chrome.runtime.lastError; // 外壳可能已经关了
      }
    );
  } catch {
    /* tab already gone */
  }
}

// ─── 下载观察窗（SDK 0.15.0 分册 15 的宿主端口后半段） ────────────────────────
//
// 外壳只能看见自己那一帧的点击，跨域子系统页里的下载它一无所知；`chrome.downloads`
// 是唯一看得全的地方，所以窗口开在 SW 里，外壳只拿一个不透明 token。
//
// 只数**完成**次数：文件名、大小、类型、来源 URL 一律不出这个文件（D-15-3）。
// 模型要读内容仍必须走 list_downloaded_files / read_downloaded_file 的逐次确认卡。
//
// 窗口是时间闭区间：open 之前与 settle 之后的下载一概不计（FR-15.2）。
// 窗口最长活 WINDOW_TTL_MS，之后自动作废——外壳崩了/没调 settle 也不会留下常驻监听。
const WINDOW_TTL_MS = 30_000;

/** token -> { ids: Set<downloadId>, openedAt, onHit? } */
const downloadWindows = new Map();

function sweepDownloadWindows() {
  const now = Date.now();
  for (const [token, win] of [...downloadWindows.entries()]) {
    if (now - win.openedAt > WINDOW_TTL_MS) downloadWindows.delete(token);
  }
}

// 顶层注册：SW 被唤醒时监听器必须已经在，否则窗口期内的下载事件直接丢
chrome.downloads.onChanged.addListener((delta) => {
  if (!delta.state || delta.state.current !== 'complete') return;
  for (const win of downloadWindows.values()) {
    if (win.ids.has(delta.id)) continue;
    win.ids.add(delta.id);
    if (win.onHit) win.onHit();
  }
});

function openDownloadWindow() {
  sweepDownloadWindows();
  const token = `dl-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  downloadWindows.set(token, { ids: new Set(), openedAt: Date.now() });
  return token;
}

/**
 * 关窗并回报计数。`timeoutMs <= 0` 是「操作抛错了」那条路：关窗、丢弃计数。
 * token 认不出来（SW 被回收过）也返回 0——宁可少报，绝不多报。
 */
function settleDownloadWindow(token, timeoutMs) {
  const win = downloadWindows.get(token);
  if (!win) return Promise.resolve(0);
  const close = () => {
    downloadWindows.delete(token);
    return win.ids.size;
  };
  if (timeoutMs <= 0) {
    close();
    return Promise.resolve(0);
  }
  if (win.ids.size > 0) return Promise.resolve(close());
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(close()), timeoutMs);
    win.onHit = () => {
      clearTimeout(timer);
      resolve(close());
    };
  });
}

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

// 判定一个子帧是否处在白名单外壳之下，返回外壳 origin（不是则返回空串）。
// 子帧自报的 origin 不能用来判定它自己，但祖先链可以：那是浏览器填进 location.ancestorOrigins
// 的，ISOLATED world 读到的是真值，页面脚本改不了。注册表会被 MV3 的空闲回收清空，祖先链不会——
// 早先只认注册表，撞上 SW 冷启动就判定失败，而子帧重试几次后就永久放弃，lockdown 再也装不上。
async function shellOriginFor(msg, tabId) {
  const chain = Array.isArray(msg.ancestors) ? msg.ancestors : [];
  if (chain.length) {
    // 链尾是最外层；中间帧是谁不影响判定，整棵树都在这个外壳之下
    const top = toOrigin(chain[chain.length - 1]);
    return (await whitelistAllows(top)) ? top : '';
  }
  // 拿不到祖先链（老浏览器）才退回注册表，冷启动时先主动重新发现
  if (!(await isShellTab(tabId))) {
    await discoverFrames(tabId);
    if (!(await isShellTab(tabId))) return '';
  }
  const top = topFrameOf(tabId);
  return top ? top.origin : '';
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
//
// 带 frameKey 时不走 URL 排序：句柄是精确的，省掉 discoverFrames 的 500ms，也不会在
// 若干个同路径帧之间猜错。句柄认不出来（帧已关闭）如实报错，不回落到按 URL 猜——
// 那会把请求投到另一页上，而模型完全看不出来。
async function routeDomRequest(msg, sender) {
  const tabId = sender.tab && sender.tab.id;
  if (msg.frameKey) {
    let target = findFrameByKey(tabId, msg.frameKey);
    if (!target) {
      await discoverFrames(tabId);
      target = findFrameByKey(tabId, msg.frameKey);
    }
    if (!target) return { ok: false, error: 'frame-key-unknown' };
    const { res, lastError, timedOut } = await sendToFrame(tabId, target.frameId, {
      type: 'dom-exec',
      reqId: msg.reqId,
      op: msg.op,
      payload: msg.payload
    });
    if (timedOut) return { ok: false, error: '目标页面响应超时，请重试' };
    if (lastError) {
      frameRegistry.delete(`${tabId}:${target.frameId}`);
      return { ok: false, error: 'frame-key-unknown' };
    }
    return res && res.ok === true ? res : { ok: false, error: (res && res.error) || '目标页面未返回结果，请重试' };
  }
  return routeToFrame(tabId, msg.targetUrl, {
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
      const slot = `${tabId}:${frameId}`;
      const key = await frameKeyFor(slot);
      const previous = frameRegistry.get(slot);
      const entry = {
        tabId,
        frameId,
        key,
        origin: toOrigin(msg.origin),
        href: msg.href || '',
        title: msg.title || '',
        headerWrap: Boolean(msg.headerWrap),
        isTop: Boolean(msg.isTop) || frameId === 0,
        ts: Date.now()
      };
      frameRegistry.set(slot, entry);
      // 只在真的换了页/换了标题时通知：注册在每次导航与每次 <title> 变更时都会重发
      if (
        !entry.isTop &&
        (previous === undefined ||
          previous.href !== entry.href ||
          previous.title !== entry.title ||
          previous.headerWrap !== entry.headerWrap)
      ) {
        notifyShell(tabId, {
          kind: 'frame',
          key,
          href: entry.href,
          title: entry.title,
          headerWrap: entry.headerWrap,
          origin: entry.origin
        });
      }
      return { ok: true, key };
    }

    case 'shell-check': {
      if (frameId !== 0) return { allowed: false };
      // Sender's self-reported origin is authoritative; registry is only a fallback.
      return { allowed: await isShellTab(tabId, msg.origin) };
    }

    case 'lockdown-check': {
      if (frameId === 0) return { lockdown: false, shell: false };
      const shellOrigin = await shellOriginFor(msg, tabId);
      if (!shellOrigin) return { lockdown: false, shell: false };
      const selfOrigin = toOrigin(msg.origin);
      // Cross-origin frames only: same-origin module iframes keep their existing behavior
      // (IframeCard.vue already handles same-origin lockdown on its own).
      // `shell` 与 lockdown 分开报：同源子帧也可能收到 dom-exec，它需要知道自己在白名单外壳
      // 之下（好留着 dom-agent 的监听器探针），而 lockdown 只对跨域帧成立。
      return { lockdown: selfOrigin !== shellOrigin, shell: true };
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

    // 外壳要一份「这个标签页里现在有哪些受管帧」。它同时是句柄的发放窗口：
    // 外壳拿 href 认出主帧、拿句柄寻址，从此不再依赖按 URL 排序那套猜测。
    case 'frame-list': {
      if (frameId !== 0) return { ok: false, error: 'Forbidden: only the top-level shell frame can list frames' };
      if (!(await isShellTab(tabId, msg.origin)))
        return { ok: false, error: 'Forbidden: shell origin is not whitelisted (see extension options)' };
      await discoverFrames(tabId);
      const frames = [];
      for (const entry of frameRegistry.values()) {
        if (entry.tabId !== tabId || entry.isTop) continue;
        frames.push({ key: entry.key, href: entry.href, title: entry.title, origin: entry.origin });
      }
      return { ok: true, frames };
    }

    // 一次页面操作把新页「开」出来了（子帧里被改道的 window.open）。
    // 只是**转达地址**：真正开不开、开在哪，由外壳决定——扩展不替它开任何东西。
    case 'page-opened': {
      if (frameId === 0) return { ok: false, error: 'Forbidden: the shell frame cannot report opened pages' };
      // 发送方是子帧，也就是被判定的一方，所以不能像别处那样信它自报的 origin
      if (!(await shellOriginFor(msg, tabId))) return { ok: false, error: 'Forbidden: not a whitelisted shell tab' };
      notifyShell(tabId, { kind: 'opened', url: msg.url, origin: toOrigin(msg.origin) });
      return { ok: true };
    }

    case 'download-window': {
      // 与 dom-proxy-request 同一道闸门：只有白名单外壳的顶层帧能开窗
      if (frameId !== 0) return { ok: false, error: 'Forbidden: only the top-level shell frame can watch downloads' };
      if (!(await isShellTab(tabId, msg.origin)))
        return { ok: false, error: 'Forbidden: shell origin is not whitelisted (see extension options)' };
      if (msg.op === 'open') return { ok: true, token: openDownloadWindow() };
      if (msg.op === 'settle') {
        return { ok: true, count: await settleDownloadWindow(msg.token, Number(msg.timeoutMs) || 0) };
      }
      return { ok: false, error: `Unsupported download-window operation: ${msg.op}` };
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
  void dropFrameKeys((slot) => slot.startsWith(`${tabId}:`));
});

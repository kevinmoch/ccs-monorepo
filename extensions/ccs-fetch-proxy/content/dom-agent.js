// CCS Fetch Proxy — MAIN world DOM agent (sub-frames only).
//
// 让外壳里的 AI 能像读同源页面一样读/操作跨域 iframe。逻辑是 @webskill/browser 的
// `createDomPerceptionReader` / `createDomPageActionExecutor` 在纯 JS 里的镜像：角色映射、
// 可访问名优先级、include→exclude 顺序、句柄只发给「可操作范围内的可交互节点」、
// 句柄每次感知整体替换、模态提升，都必须与 SDK 一致，否则确认卡措辞与审计会对不上。
//
// 范围（include/exclude）永远由外壳下发，本脚本不带任何缺省白名单：没有范围就什么都不读。
// 授权判定在 service worker（顶层 shell origin 必须在白名单里），到这里已是被批准的请求。
(() => {
  'use strict';

  const PROTO = 'ccs-fetch-proxy';
  if (window === window.top) return; // 顶层外壳自己有 DOM，用不上桥

  const postToIsolated = (msg) => window.postMessage({ __ccsExt: true, proto: PROTO, ...msg }, location.origin);

  // ─── 感知：常量与 @webskill/browser 逐条对齐 ────────────────────────────────
  const SECRET_INPUT_TYPES = new Set(['password', 'hidden']);
  const ACTIONABLE_ROLES = new Set([
    'button',
    'checkbox',
    'combobox',
    'form',
    'link',
    'radio',
    'searchbox',
    'switch',
    'textbox'
  ]);
  const ROLE_BY_TAG = {
    A: 'link',
    BUTTON: 'button',
    CANVAS: 'img',
    H1: 'heading',
    H2: 'heading',
    H3: 'heading',
    H4: 'heading',
    H5: 'heading',
    H6: 'heading',
    IMG: 'img',
    LI: 'listitem',
    NAV: 'navigation',
    OL: 'list',
    P: 'paragraph',
    SELECT: 'combobox',
    SVG: 'img',
    TABLE: 'table',
    TD: 'cell',
    TEXTAREA: 'textbox',
    TH: 'columnheader',
    TR: 'row',
    UL: 'list'
  };
  const INPUT_TYPE_ROLE = { button: 'button', checkbox: 'checkbox', radio: 'radio', submit: 'button' };
  const MAX_TEXT = 200;
  const SKIPPED_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE']);
  const MODAL_SELECTOR = '[role=dialog][open], dialog[open], [aria-modal=true]';
  const FILLABLE_TAGS = new Set(['INPUT', 'TEXTAREA']);
  // 取像只对这三种标签，与 @webskill/browser 的 isCapturableElement 一致
  const CAPTURABLE_TAGS = new Set(['IMG', 'CANVAS', 'SVG']);
  // 原图字节要过 postMessage 才到外壳；压缩在外壳侧做，这里只挡住明显过大的
  const MAX_RAW_IMAGE_BYTES = 8 * 1024 * 1024;

  const clip = (text) => {
    const normalized = String(text == null ? '' : text)
      .replace(/\s+/g, ' ')
      .trim();
    return normalized.length > MAX_TEXT ? `${normalized.slice(0, MAX_TEXT)}…` : normalized;
  };

  const inputType = (element) => (element.getAttribute('type') || 'text').toLowerCase();

  function roleOf(element) {
    const explicit = element.getAttribute('role');
    if (explicit && explicit.trim() !== '') return explicit.trim();
    if (element.tagName === 'INPUT') return INPUT_TYPE_ROLE[inputType(element)] || 'textbox';
    return ROLE_BY_TAG[element.tagName.toUpperCase()] || 'generic';
  }

  function ownText(element) {
    let text = '';
    for (const node of element.childNodes) {
      if (node.nodeType === 3) text += node.nodeValue || '';
    }
    return clip(text);
  }

  function nameOf(element) {
    const label = element.getAttribute('aria-label');
    if (label && label.trim() !== '') return clip(label);
    const labelledBy = element.getAttribute('aria-labelledby');
    if (labelledBy) {
      const parts = labelledBy
        .split(/\s+/)
        .map((id) => {
          const node = document.getElementById(id);
          return node ? node.textContent || '' : '';
        })
        .filter((part) => part.trim() !== '');
      if (parts.length > 0) return clip(parts.join(' '));
    }
    if (element.tagName === 'IMG') {
      const alt = element.getAttribute('alt');
      if (alt && alt.trim() !== '') return clip(alt);
    }
    const own = ownText(element);
    return own === '' ? undefined : own;
  }

  function valueOf(element) {
    if (element.tagName === 'INPUT') {
      if (SECRET_INPUT_TYPES.has(inputType(element))) return undefined;
      return element.value === '' ? undefined : clip(element.value);
    }
    if (element.tagName === 'TEXTAREA' || element.tagName === 'SELECT') {
      return element.value === '' ? undefined : clip(element.value);
    }
    if (element.getAttribute('role') === 'combobox') {
      const value = element.getAttribute('data-value');
      return !value ? undefined : clip(value);
    }
    return undefined;
  }

  function hrefOf(element) {
    if (typeof element.href === 'string' && element.href !== '') return element.href;
    return element.getAttribute('href') || undefined;
  }

  // 只看显式声明与 computed display/visibility，不看尺寸——与 SDK 同口径
  function hidden(element) {
    if (element.hasAttribute('hidden')) return true;
    if (element.getAttribute('aria-hidden') === 'true') return true;
    const inline = element.getAttribute('style') || '';
    if (/display\s*:\s*none|visibility\s*:\s*hidden/i.test(inline)) return true;
    const computed = window.getComputedStyle(element);
    return computed.display === 'none' || computed.visibility === 'hidden';
  }

  // ─── 句柄表：每次感知整体替换，上一次的 ref 立即失效 ────────────────────────
  let handleTable = new Map(); // ref -> { element, target }
  let actionable = new Set();
  let actionExcluded = new Set();
  const elevatedModals = new Set();

  function issueRef(element, role) {
    if (!actionable.has(element) || actionExcluded.has(element)) return undefined;
    if (!ACTIONABLE_ROLES.has(role)) return undefined;
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    const ref = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    handleTable.set(ref, { element, target: describeElement(element) });
    return ref;
  }

  function selectorSets(include, exclude) {
    const inSet = new Set();
    const exSet = new Set();
    for (const selector of include || []) {
      for (const root of query(selector)) {
        inSet.add(root);
        for (const descendant of root.querySelectorAll('*')) inSet.add(descendant);
      }
    }
    for (const selector of exclude || []) {
      for (const root of query(selector)) {
        exSet.add(root);
        for (const descendant of root.querySelectorAll('*')) exSet.add(descendant);
      }
    }
    return { inSet, exSet };
  }

  // 外壳下发的选择器可能写错；一条无效选择器不该让整次感知失败
  function query(selector) {
    try {
      return document.querySelectorAll(selector);
    } catch {
      return [];
    }
  }

  // ─── 取像：与 @webskill/browser 的 captureElementImage 分级一致 ──────────────
  function bytesToBase64(bytes) {
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    return btoa(binary);
  }

  function splitDataUrl(dataUrl) {
    const comma = dataUrl.indexOf(',');
    if (!dataUrl.startsWith('data:') || comma === -1) return undefined;
    const meta = dataUrl.slice(5, comma);
    if (!meta.endsWith(';base64')) return undefined;
    return { mimeType: meta.slice(0, -';base64'.length), data: dataUrl.slice(comma + 1) };
  }

  /**
   * `<img>` 取原图字节、`<canvas>` 读回、`<svg>` 序列化；三条路互不兜底。
   * 在帧内 fetch 是同源请求，还自带子系统的会话身份——比外壳直接抓更容易成功。
   */
  async function captureImage(element) {
    const tag = element.tagName.toUpperCase();
    if (tag === 'IMG') {
      const src = element.currentSrc || element.src;
      if (!src) throw new Error('the <img> element has no resolved source');
      const inline = splitDataUrl(src);
      if (inline) return { mimeType: inline.mimeType, data: inline.data, level: 'src' };
      const response = await fetch(src, { mode: 'cors', credentials: 'include' });
      if (response.type === 'opaque') throw new Error('the response is opaque, so its bytes cannot be read');
      if (!response.ok) throw new Error(`fetching the source returned HTTP ${response.status}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > MAX_RAW_IMAGE_BYTES) {
        throw new Error(`the source image is ${bytes.byteLength} bytes, which is too large to pass through the bridge`);
      }
      return {
        mimeType: response.headers.get('content-type') || 'application/octet-stream',
        data: bytesToBase64(bytes),
        level: 'src'
      };
    }
    if (tag === 'CANVAS') {
      // 画布被跨域内容污染时 toDataURL 抛 SecurityError；不兜底重绘（同 SDK 裁决 D-3）
      const parsed = splitDataUrl(element.toDataURL('image/png'));
      if (!parsed) throw new Error('the canvas produced an unreadable data URL');
      return { mimeType: parsed.mimeType, data: parsed.data, level: 'canvas' };
    }
    const markup = new XMLSerializer().serializeToString(element);
    return { mimeType: 'image/svg+xml', data: bytesToBase64(new TextEncoder().encode(markup)), level: 'canvas' };
  }

  function describeNode(element, excluded, provenance, captureTargets) {
    if (excluded.has(element)) return undefined;
    if (SKIPPED_TAGS.has(element.tagName)) return undefined;
    if (hidden(element)) return undefined;

    const children = [];
    for (const child of element.children) {
      const node = describeNode(child, excluded, provenance, captureTargets);
      if (node !== undefined) children.push(node);
    }

    const name = nameOf(element);
    const value = valueOf(element);
    const role = roleOf(element);
    const href = role === 'link' ? hrefOf(element) : undefined;
    if (role === 'generic' && name === undefined && value === undefined && children.length === 0) return undefined;

    const node = { role };
    if (name !== undefined) node.name = name;
    if (value !== undefined) node.value = value;
    if (href !== undefined) node.href = href;
    if (provenance !== undefined) node.provenance = provenance;
    const ref = issueRef(element, role);
    if (ref !== undefined) node.ref = ref;
    if (children.length > 0) node.children = children;
    // 登记在剪枝之后：另起一次 querySelectorAll 扫描会绕过 exclude
    if (captureTargets !== undefined && CAPTURABLE_TAGS.has(element.tagName.toUpperCase())) {
      captureTargets.push({ element, node });
    }
    return node;
  }

  function modalSnapshot() {
    return new Set(query(MODAL_SELECTOR));
  }

  /** 本帧的身份与嵌套情况。同源子文档能读到 contentDocument，跨域的读不到，两者要分开报 */
  function frameProvenance() {
    const nested = document.querySelectorAll('iframe');
    let sameOrigin = 0;
    for (const frame of nested) {
      try {
        if (frame.contentDocument) sameOrigin += 1;
      } catch {
        /* 跨域，不计入 */
      }
    }
    return { documentUrl: location.href, nestedFrames: nested.length, nestedSameOriginFrames: sameOrigin };
  }

  function elevateNewModals(before) {
    for (const modal of query(MODAL_SELECTOR)) {
      if (!before.has(modal)) {
        elevatedModals.add(modal);
        return modal;
      }
    }
    return undefined;
  }

  /** 感知一次。payload: { include, exclude, actionInclude, actionExclude, capture } */
  async function perceive(payload) {
    handleTable = new Map();
    const include = payload && Array.isArray(payload.include) ? payload.include : [];
    if (include.length === 0) return { nodes: [], targets: [] };

    const capture = (payload && payload.capture) || undefined;
    const wantImages = Boolean(capture && capture.images && capture.maxImages > 0);
    const captureTargets = wantImages ? [] : undefined;

    const sets = selectorSets(payload.actionInclude, payload.actionExclude);
    actionable = sets.inSet;
    actionExcluded = sets.exSet;

    const excluded = new Set();
    for (const selector of payload.exclude || []) {
      for (const element of query(selector)) excluded.add(element);
    }

    const roots = [];
    for (const selector of include) {
      for (const element of query(selector)) {
        if (!roots.includes(element)) roots.push(element);
      }
    }

    const nodes = [];
    for (const element of roots) {
      const node = describeNode(element, excluded, undefined, captureTargets);
      if (node !== undefined) nodes.push(node);
    }

    // 已授权操作打开的模态：追加并标来源，授权面临时扩大必须看得见
    for (const modal of elevatedModals) {
      if (!modal.isConnected) {
        elevatedModals.delete(modal);
        continue;
      }
      actionable = new Set([modal, ...modal.querySelectorAll('*')]);
      const node = describeNode(modal, new Set(), 'modal-elevated', captureTargets);
      if (node !== undefined) nodes.push(node);
    }
    // 用户自己点开的对话框不在授权面里——给条可操作的说明，别让它凭空消失
    for (const modal of query(MODAL_SELECTOR)) {
      if (elevatedModals.has(modal)) continue;
      nodes.push({
        role: 'note',
        name:
          `The dialog "${nameOf(modal) || 'dialog'}" is open but outside the authorized scope because it was ` +
          'opened manually. Ask the user to let you open it instead.'
      });
    }

    const targets = [];
    for (const [ref, entry] of handleTable) targets.push([ref, entry.target]);
    // 外壳只知道自己请求了哪个 URL，不知道 service worker 最终投递到了哪个同源帧，
    // 也看不见本帧里是否还嵌着一层；读空时这三项是唯一能分辨「选错帧」与「内容更深」的依据。
    const result = { nodes, targets, ...frameProvenance() };
    if (!wantImages) return result;

    // id 带 erp- 前缀：外壳会把本帧的图与它自己那帧的合并，两边不能撞
    const selected = captureTargets.slice(0, capture.maxImages);
    const images = [];
    let imageFailures = 0;
    for (let index = 0; index < selected.length; index += 1) {
      const target = selected[index];
      const id = `erp-img-${index + 1}`;
      try {
        const image = await captureImage(target.element);
        target.node.imageId = id;
        images.push({ id, ...image });
      } catch (err) {
        // 一张图抓不到不该让整次感知失败，但必须说清是哪一张、为什么
        target.node.imageNote = `Not captured: ${(err && err.message) || String(err)}`;
        imageFailures += 1;
      }
    }
    for (const target of captureTargets.slice(capture.maxImages)) {
      target.node.imageNote = 'Not captured: the per-message image limit was reached';
    }
    result.images = images;
    result.imagesOmitted = captureTargets.length - selected.length;
    result.imageFailures = imageFailures;
    return result;
  }

  // ─── 操作：可访问名与 SDK 的执行器同一套优先级（确认卡措辞据此生成） ─────────
  const textOf = (element) => (element && element.textContent ? element.textContent.replace(/\s+/g, ' ').trim() : '');

  function accessibleName(element) {
    const labelledBy = element.getAttribute('aria-labelledby');
    if (labelledBy && labelledBy.trim() !== '') {
      const joined = labelledBy
        .split(/\s+/)
        .map((id) => textOf(document.getElementById(id)))
        .filter((part) => part !== '')
        .join(' ');
      if (joined !== '') return joined;
    }
    const label = element.getAttribute('aria-label');
    if (label && label.trim() !== '') return label.trim();
    const labels = element.labels;
    if (labels && labels.length > 0) {
      const joined = Array.from(labels, textOf)
        .filter((part) => part !== '')
        .join(' ');
      if (joined !== '') return joined;
    }
    const own = textOf(element);
    if (own !== '') return own;
    const wrapping = textOf(element.closest('label'));
    if (wrapping !== '') return wrapping;
    const placeholder = element.getAttribute('placeholder');
    if (placeholder && placeholder.trim() !== '') return placeholder.trim();
    const title = element.getAttribute('title');
    return title && title.trim() !== '' ? title.trim() : undefined;
  }

  function actionRoleOf(element) {
    const explicit = element.getAttribute('role');
    if (explicit && explicit.trim() !== '') return explicit.trim();
    if (element.tagName === 'INPUT') {
      const type = inputType(element);
      if (type === 'checkbox' || type === 'radio') return type;
      return type === 'button' || type === 'submit' ? 'button' : 'textbox';
    }
    if (element.tagName === 'BUTTON') return 'button';
    if (element.tagName === 'A') return 'link';
    if (element.tagName === 'TEXTAREA') return 'textbox';
    if (element.tagName === 'SELECT') return 'combobox';
    if (element.tagName === 'FORM') return 'form';
    return 'generic';
  }

  function describeElement(element) {
    const target = { role: actionRoleOf(element) };
    const name = accessibleName(element);
    if (name !== undefined) target.name = name;
    if (element.tagName === 'INPUT' && SECRET_INPUT_TYPES.has(inputType(element))) target.secret = true;
    return target;
  }

  // 受控组件（React 等）必须收到 input/change，且要绕过 value 劫持
  function fillValue(element, value) {
    const prototype = element.tagName === 'INPUT' ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value');
    if (setter && setter.set) setter.set.call(element, value);
    else element.value = value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }

  const norm = (text) =>
    String(text == null ? '' : text)
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

  async function waitFor(probe, timeoutMs = 2000) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const hit = probe();
      if (hit !== undefined) return hit;
      if (Date.now() >= deadline) return undefined;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }

  async function selectOption(element, value) {
    const target = describeElement(element);
    const fail = (reason) => ({ ok: false, target, reason });
    if (value === '') return fail('The select action needs a value.');

    if (element.tagName === 'SELECT') {
      const option = Array.from(element.options).find(
        (candidate) => norm(candidate.label) === norm(value) || norm(candidate.value) === norm(value)
      );
      if (!option) return fail(`No option named "${value}" is available.`);
      element.value = option.value;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return norm(element.selectedOptions[0] && element.selectedOptions[0].label) === norm(option.label)
        ? { ok: true, target }
        : fail(`The control did not accept "${value}".`);
    }

    element.click();
    const listbox = await waitFor(
      () => document.querySelector('[role=listbox], [role=grid], [role=menu]') || undefined
    );
    if (!listbox) return fail('The options panel did not open.');

    const option = Array.from(listbox.querySelectorAll('[role=option], [role=gridcell], [role=menuitem], option')).find(
      (candidate) => norm(accessibleName(candidate)) === norm(value)
    );
    if (!option) return fail(`No option named "${value}" is available.`);
    option.click();

    const settled = await waitFor(() => {
      const shown = `${accessibleName(element) || ''} ${element.value || ''}`;
      return norm(shown).includes(norm(value)) ? true : undefined;
    });
    return settled === true ? { ok: true, target } : fail(`The control did not settle on "${value}".`);
  }

  // 幂等：当前态已是目标态就不点，避免「点一下反而关掉」
  function setToggle(element, value, target) {
    const wanted = norm(value);
    if (wanted !== 'true' && wanted !== 'false') return { ok: false, target, reason: 'Use "true" or "false".' };
    const desired = wanted === 'true';
    const aria = element.getAttribute('aria-checked') || element.getAttribute('aria-pressed');
    const current = aria !== null ? aria === 'true' : element.tagName === 'INPUT' ? element.checked : undefined;
    if (current === undefined) return { ok: false, target, reason: 'The element is not a toggle.' };
    if (current === desired) return { ok: true, target, noop: true };
    element.click();
    return { ok: true, target };
  }

  async function act(payload) {
    const entry = handleTable.get(payload && payload.ref);
    if (!entry || !entry.element.isConnected) {
      return { ok: false, target: { role: 'generic' }, reason: 'The element reference is unknown or expired.' };
    }
    const element = entry.element;
    const target = describeElement(element);
    const fail = (reason) => ({ ok: false, target, reason });

    const inElevatedModal = Array.from(elevatedModals).some((modal) => modal.contains(element));
    if (!inElevatedModal) {
      const owningModal = element.closest(MODAL_SELECTOR);
      if (owningModal) {
        return fail(
          'That dialog is not in the authorized scope because it was opened manually. ' +
            'Ask me to open it, or add it to the host allowlist.'
        );
      }
      // 第二道闸门：发句柄之后页面可能变了，目标可能已挪出可操作范围
      if (!actionable.has(element) || actionExcluded.has(element)) {
        return fail('The element is no longer inside the actionable scope.');
      }
    }
    if (hidden(element)) return fail('The element is not visible.');
    if (element.hasAttribute('disabled')) return fail('The element is disabled.');

    const modalsBefore = modalSnapshot();
    const done = async (outcome) => {
      if (!outcome.ok) return outcome;
      const elevated = (await waitFor(() => elevateNewModals(modalsBefore), 500)) || elevateNewModals(modalsBefore);
      const name = elevated ? accessibleName(elevated) || 'dialog' : undefined;
      return name === undefined ? outcome : { ...outcome, elevatedModal: name };
    };

    switch (payload.action) {
      case 'click':
        element.click();
        return await done({ ok: true, target });
      case 'fill': {
        if (!FILLABLE_TAGS.has(element.tagName)) return fail('The element is not a text control.');
        if (element.hasAttribute('readonly')) return fail('The element is read-only.');
        fillValue(element, payload.value == null ? '' : payload.value);
        return await done({ ok: true, target });
      }
      case 'select': {
        const outcome = await selectOption(element, payload.value == null ? '' : payload.value);
        return outcome.ok ? await done({ ...outcome, target }) : { ...outcome, target };
      }
      case 'set':
        return await done(setToggle(element, payload.value == null ? '' : payload.value, target));
      case 'attach':
        // File 过不了 chrome.tabs.sendMessage 的 JSON 序列化；跨域帧的附件上传本桥不支持。
        return fail('Attaching files is not supported inside cross-origin frames.');
      default: {
        const form = element.tagName === 'FORM' ? element : element.form;
        if (!form) return fail('The element does not belong to a form.');
        form.requestSubmit();
        return await done({ ok: true, target });
      }
    }
  }

  // ─── 指令入口（ISOLATED 层转发 service worker 的 dom-exec） ──────────────────
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.origin !== location.origin) return;
    const data = event.data;
    if (!data || data.__ccsExt !== true || data.proto !== PROTO) return;
    if (data.kind !== 'CCS_EXT_DOM_EXECUTE') return;

    const run = data.op === 'act' ? act(data.payload) : Promise.resolve(perceive(data.payload));
    run.then(
      (result) => postToIsolated({ kind: 'CCS_EXT_DOM_EXECUTE_RESULT', reqId: data.reqId, ok: true, result }),
      (err) =>
        postToIsolated({
          kind: 'CCS_EXT_DOM_EXECUTE_RESULT',
          reqId: data.reqId,
          ok: false,
          error: (err && err.message) || String(err)
        })
    );
  });
})();

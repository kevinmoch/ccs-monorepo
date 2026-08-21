// CCS Fetch Proxy — MAIN world DOM agent (sub-frames only).
//
// 让外壳里的 AI 能像读同源页面一样读/操作跨域 iframe。逻辑是 @webskill/browser 的
// `createDomPerceptionReader` / `createDomPageActionExecutor` 在纯 JS 里的镜像：角色映射、
// 可访问名优先级、include→exclude 顺序、句柄只发给「可操作范围内的可交互节点」、
// 模态提升，都必须与 SDK 一致，否则确认卡措辞与审计会对不上。
// 与 SDK 的一处有意偏离：句柄不是每次感知整体替换，而是按元素稳定发放、跨感知保留
// （见句柄表注释）——ERP 场景下 perceive 与 act 之间随时会再发生一次感知，整体替换
// 会把模型手里的 ref 全部作废，表现为「每次执行都提示引用过期」。
//
// 范围（include/exclude）永远由外壳下发，本脚本不带任何缺省白名单：没有范围就什么都不读。
// 授权判定在 service worker（顶层 shell origin 必须在白名单里），到这里已是被批准的请求。
(() => {
  'use strict';

  const PROTO = 'ccs-fetch-proxy';
  if (window === window.top) return; // 顶层外壳自己有 DOM，用不上桥

  const postToIsolated = (msg) => window.postMessage({ __ccsExt: true, proto: PROTO, ...msg }, location.origin);

  // ─── 监听器探针：最强的可交互信号 ────────────────────────────────────
  // 本脚本 document_start 注入，先于页面脚本运行：包裹 addEventListener，把挂过
  // click 类监听的元素记下来。「有 click 监听器」就是可交互的定义本身，不看任何
  // 样式/类名声明——Tailwind 等工具类写法的菜单项四种样式信号全不带，只有这条路认得出。
  // Vue 2 的 v-on 逐元素绑定必经此处；事件委托挂在 document 上的框架认不到具体元素，
  // 由其余信号兜底。removeEventListener 不除名：误留的元素仍会被名字/可见性闸门拦住。
  const clickListenerTargets = new WeakSet();
  const CLICK_EVENT_TYPES = new Set(['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup']);
  const nativeAddEventListener = EventTarget.prototype.addEventListener;

  // Chrome 的 unload 弃用（Permissions-Policy unload=()，部分环境默认禁用）下，页面注册
  // unload 监听器会打一条 violation，而调用栈指到下面的包装函数，看起来像本扩展在报错。
  // 策略明确禁止时透传本就无意义（监听器不会触发），直接跳过，保持控制台干净、行为等价。
  // 浏览器不认识 unload 这条策略（features() 不含）或 API 缺失时一律放行，不改变旧环境行为。
  let unloadBlocked;
  function unloadDisallowed() {
    if (unloadBlocked !== undefined) return unloadBlocked;
    try {
      const policy = document.permissionsPolicy || document.featurePolicy;
      const known =
        policy && typeof policy.features === 'function' ? policy.features().includes('unload') : false;
      unloadBlocked = Boolean(
        known && policy && typeof policy.allowsFeature === 'function' && !policy.allowsFeature('unload')
      );
    } catch {
      unloadBlocked = false;
    }
    return unloadBlocked;
  }

  EventTarget.prototype.addEventListener = function (type, listener, options) {
    if (type === 'unload' && unloadDisallowed()) return undefined;
    if (CLICK_EVENT_TYPES.has(type) && this instanceof Element) clickListenerTargets.add(this);
    return nativeAddEventListener.call(this, type, listener, options);
  };

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

  // ─── 角色提升：让「可点的 div」拿到句柄 ──────────────────────────────
  // ERP 大量可交互元素是无语义角色的 div（如左侧菜单项）或当链接用的图片（如附件预览
  // 缩略图），generic/img 不在可操作角色集里，模型永远拿不到句柄。提升不靠枚举具体
  // class（换一种声明就失效），靠上面两条通用途径：外壳显式 roleHints（逃生舱）与
  // 内置通用可交互信号。只提升可操作角色。
  let activeRoleHints = [];

  function hintRoleOf(element) {
    for (const hint of activeRoleHints) {
      for (const selector of hint.selectors) {
        try {
          if (element.matches(selector)) return hint.role;
        } catch {
          /* 无效选择器跳过，不该让整次感知失败 */
        }
      }
    }
    return undefined;
  }

  function looksClickable(element) {
    try {
      return computedStyleOf(element).cursor === 'pointer';
    } catch {
      return false;
    }
  }

  // ─── 通用可交互信号：与具体业务 class 无关，不按样例穷举 ────────────
  // 无语义元素是否可点，可用的信号：
  //  0. 挂过 click 类监听器（监听器探针，行为事实，最强）；
  //  1. tabindex（非 -1）—— 键盘可聚焦的元素天然是控件；
  //  2. title —— 页面给它挂了操作提示（缩略图、菜单项常见）；
  //  3. class/id 含交互语义词根 —— 覆盖 btn-*/…-action/menu-*/link-* 等任意变体，
  //     带具体语义的图标类（icon-*/el-icon-*/anticon-*）也算：单元格里的图标按钮常无
  //     cursor 声明；词根带边界匹配，table（含 tab 子串）这类普通类名不会误中；
  //  4. cursor: pointer —— 页面声明了可点。getComputedStyle 最贵，殿后；
  //     执行顺序按成本排（前面的廉价信号命中就短路），不按强度排。
  const INTERACTIVE_TOKEN =
    /(?:^|[^a-z])(btn|button|actions?|click(?:able)?|link|menu|nav|tabs?|trigger|operate|operations?|handle|entry|toolbar|[a-z]*icons?(?:[-_][a-z0-9]+)?)(?:[^a-z]|$)/i;

  // 从图标类名反推语义当名字：el-icon-view → view、icon-download → download。
  // 图标按钮没有文字，这段语义词是模型辨认它唯一的线索；双下划线起的 BEM 内部后缀剥掉
  function iconHintOf(element) {
    for (const cls of (element.getAttribute('class') || '').split(/\s+/)) {
      const match = /[a-z]*icons?[-_]([a-z0-9][a-z0-9-_]*)$/i.exec(cls);
      if (match) {
        const semantic = match[1].split('__')[0];
        if (semantic !== '') return clip(semantic);
      }
    }
    return undefined;
  }

  function looksInteractive(element) {
    if (clickListenerTargets.has(element)) return true;
    const tabindex = element.getAttribute('tabindex');
    if (tabindex !== null && tabindex.trim() !== '' && tabindex.trim() !== '-1') return true;
    const title = element.getAttribute('title');
    if (title && title.trim() !== '') return true;
    // 用 getAttribute 取 class：SVG 元素的 className 不是字符串
    const token = `${element.getAttribute('class') || ''} ${element.id || ''}`;
    if (INTERACTIVE_TOKEN.test(token)) return true;
    return looksClickable(element);
  }

  function promoteRole(element, role, name, hasActionableDescendant = false) {
    // 只提升没有交互语义的角色：generic（裸 div/span）、img（当链接用的图片）、
    // cell（文字链接型单元格，点击面常挂在整格上）；link/button 等本身就能发句柄，不动
    if (role !== 'generic' && role !== 'img' && role !== 'cell') return role;
    // roleHints 是外壳的显式声明，无条件提升；通用信号则要求元素有可辨识的文字——
    // 直接名字或后代文本（<span> 包文字的链接很常见）；啥都没有的「按钮」对模型毫无意义
    const hinted = hintRoleOf(element);
    if (hinted) return hinted;
    // 后代里已有能发句柄的真控件时容器不再提升：否则快照里父按钮套子链接，
    // ref 清单翻倍，模型面对的是同一个东西的两个句柄
    if (hasActionableDescendant && role !== 'img') return role;
    if (!looksInteractive(element)) return role;
    // 图片自己就是辨识线索（缩略图/预览图），无需文字；文字型元素要求有可辨识的文字，
    // 图标按钮没有文字，从图标类名反推的语义也算
    if (role === 'img') return 'button';
    return name !== undefined || clip(element.textContent || '') !== '' || iconHintOf(element) !== undefined
      ? 'button'
      : role;
  }

  // 压掉匿名包装层：ERP 大量用语义为零的 div 容器，原样上报会喂给模型一大片 generic 嵌套。
  // 与 SDK 读取器的剪枝同思路：节点自身有名字/值/句柄/文本就保留，否则看孩子。
  function flatten(nodes) {
    const out = [];
    for (const node of nodes) {
      const children = node.children ? flatten(node.children) : [];
      const selfInteresting =
        node.name !== undefined ||
        node.value !== undefined ||
        node.ref !== undefined ||
        node.href !== undefined ||
        node.imageId !== undefined ||
        node.imageNote !== undefined ||
        node.provenance !== undefined ||
        node.role !== 'generic';
      if (selfInteresting) {
        out.push(children.length > 0 ? { ...node, children } : { ...node });
      } else {
        out.push(...children);
      }
    }
    return out;
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
          // 用元素自己的 ownerDocument：内联进来的同源嵌套帧元素不属于本 document
          const node = (element.ownerDocument || document).getElementById(id);
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
    if (own !== '') return own;
    // title 殿后，与操作侧 accessibleName 的优先级同序：ERP 的缩略图、菜单项常只有
    // title 能说明自己是什么，不读它模型拿到的就是一个没名字的按钮
    const title = element.getAttribute('title');
    return title && title.trim() !== '' ? clip(title) : undefined;
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

  // computed style 要经元素自己文档的 defaultView 取：内联进来的同源嵌套帧元素
  // 不属于本 window，直接调本窗口的 getComputedStyle 口径不对（且依赖跨 realm 行为）
  function computedStyleOf(element) {
    const view = element.ownerDocument && element.ownerDocument.defaultView;
    return (view || window).getComputedStyle(element);
  }

  // 只看显式声明与 computed display/visibility，不看尺寸——与 SDK 同口径
  function hidden(element) {
    if (element.hasAttribute('hidden')) return true;
    if (element.getAttribute('aria-hidden') === 'true') return true;
    const inline = element.getAttribute('style') || '';
    if (/display\s*:\s*none|visibility\s*:\s*hidden/i.test(inline)) return true;
    const computed = computedStyleOf(element);
    return computed.display === 'none' || computed.visibility === 'hidden';
  }

  // ─── 句柄表：按元素稳定发放，跨感知保留 ────────────────────────────────
  // 同一元素永远拿同一个 ref：模型重读页面时看到的还是同一批 ref，旧 ref 只要元素还在
  // 页面上、还在可操作范围内就继续有效。每次感知仍会把本次发放的 ref 全量上报给外壳
  // （issued），快照契约不变；act 的第二道闸门（可操作范围、可见性）照常拦住过期目标。
  let handleTable = new Map(); // ref -> { element, target }，跨感知保留
  const refByElement = new WeakMap(); // element -> ref
  let actionable = new Set();
  let actionExcluded = new Set();
  const elevatedModals = new Set();

  function issueRef(element, role, issued) {
    if (!actionable.has(element) || actionExcluded.has(element)) return undefined;
    if (!ACTIONABLE_ROLES.has(role)) return undefined;
    let ref = refByElement.get(element);
    if (ref === undefined) {
      const bytes = new Uint8Array(8);
      crypto.getRandomValues(bytes);
      ref = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
      refByElement.set(element, ref);
    }
    // target 描述随每次感知刷新（名字、值可能变了），ref 本身不变
    handleTable.set(ref, { element, target: describeElement(element) });
    issued.add(ref);
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

  // 已描述的子树里有没有拿到句柄的节点：容器提升决策用（见 promoteRole）
  function subtreeHasRef(nodes) {
    return nodes.some((node) => node.ref !== undefined || (node.children !== undefined && subtreeHasRef(node.children)));
  }

  function describeNode(element, excluded, provenance, captureTargets, issued) {
    if (excluded.has(element)) return undefined;
    if (SKIPPED_TAGS.has(element.tagName)) return undefined;
    if (hidden(element)) return undefined;

    const children = [];
    for (const child of element.children) {
      const node = describeNode(child, excluded, provenance, captureTargets, issued);
      if (node !== undefined) children.push(node);
    }

    const baseRole = roleOf(element);
    let name = nameOf(element);
    const value = valueOf(element);
    const role = promoteRole(element, baseRole, name, subtreeHasRef(children));
    // 被提升元素的文字可能在后代里（<span> 包文字的链接），直接文本按 SDK 口径为空，
    // 但那段文字是模型操作它唯一的线索，补成名字；图标按钮没文字，从图标类名反推
    if (role === 'button' && baseRole !== 'button' && name === undefined) {
      const inner = clip(element.textContent);
      name = inner !== '' ? inner : iconHintOf(element);
    }
    const href = role === 'link' ? hrefOf(element) : undefined;
    if (role === 'generic' && name === undefined && value === undefined && children.length === 0) return undefined;

    const node = { role };
    if (name !== undefined) node.name = name;
    if (value !== undefined) node.value = value;
    if (href !== undefined) node.href = href;
    if (provenance !== undefined) node.provenance = provenance;
    const ref = issueRef(element, role, issued);
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

  /** 帧的可路由地址：真实 href 优先，落到 src 属性；about:blank/srcdoc 等返回 undefined */
  function routableUrlOf(frame) {
    // 实际地址优先：帧内导航（新窗口拦截改当前帧跳转等）只改 location.href，不改 src 属性，
    // 初始 src 常常是不能直接在帧内打开的弹窗地址，拿它去感知会读到一个报错帧
    try {
      const actual = frame.contentWindow && frame.contentWindow.location.href;
      if (actual && actual !== 'about:blank') {
        const url = new URL(actual);
        if (url.protocol === 'http:' || url.protocol === 'https:') return url.href;
      }
    } catch {
      /* 跨域帧读不到 location，落到 src 属性 */
    }
    // 只认可路由的地址：srcdoc/about:blank 等没有 URL 的帧过不了 service worker 的路由
    const src = frame.src || frame.getAttribute('src');
    if (!src) return undefined;
    try {
      const url = new URL(src, location.href);
      return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * 本帧的身份与嵌套情况。同源子文档能读到 contentDocument，跨域的读不到，两者要分开报。
   * nestedFrameUrls 把可解析的子帧绝对地址一并上报：扩展的 content script 在所有帧里都在场，
   * 外壳拿这份清单就能按 URL 逐帧再发感知，把嵌套 iframe 的内容也读进来。
   */
  function frameProvenance() {
    const nested = document.querySelectorAll('iframe');
    let sameOrigin = 0;
    const urls = new Set();
    for (const frame of nested) {
      try {
        if (frame.contentDocument) sameOrigin += 1;
      } catch {
        /* 跨域，不计入 */
      }
      const url = routableUrlOf(frame);
      if (url !== undefined) urls.add(url);
    }
    return {
      documentUrl: location.href,
      nestedFrames: nested.length,
      nestedSameOriginFrames: sameOrigin,
      nestedFrameUrls: [...urls]
    };
  }

  // 同源但没有可路由地址的嵌套帧（about:blank/srcdoc）过不了 service worker 按 URL 的投递，
  // 报错页/注入内容常藏在里面；父帧能直接读它们的 contentDocument，就在这里内联进来
  function inlineNestedNodes(roots, excluded, captureTargets, issued) {
    const nodes = [];
    for (const frame of document.querySelectorAll('iframe')) {
      // 范围外的帧不读：include 圈了谁才看谁，别因为是嵌套帧就破例
      if (!roots.some((root) => root === frame || root.contains(frame))) continue;
      if (hidden(frame)) continue; // 隐藏帧（display:none 的报错页常见形态）内容不进快照
      let doc = null;
      try {
        doc = frame.contentDocument;
      } catch {
        continue; /* 跨域帧读不到，照旧走 nestedFrameUrls 路由 */
      }
      if (!doc || !doc.body) continue;
      if (routableUrlOf(frame) !== undefined) continue; /* 可路由的帧由外壳下钻，不重读 */
      const node = describeNode(doc.body, excluded, 'inline-frame', captureTargets, issued);
      if (node !== undefined) nodes.push(node);
    }
    return nodes;
  }

  // 「整页读不出文字」不能看 body.textContent：内联 <script> 的源码也算文本，
  // 预览页几乎必然带脚本，会永远判成有字。跳过脚本类标签，只看真实文本节点
  function hasReadableText() {
    if (!document.body) return false;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        const parent = node.parentElement;
        if (!parent || SKIPPED_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
        return node.nodeValue && node.nodeValue.trim() !== '' ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    return walker.nextNode() !== null;
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
    // 句柄表跨感知保留：先清掉元素已离开页面的条目，防止表无限膨胀；
    // 已删除元素的 ref 留在 refByElement 里也无害（WeakMap 随元素回收）
    for (const [ref, entry] of handleTable) {
      if (!entry.element.isConnected) handleTable.delete(ref);
    }
    const issued = new Set();
    const include = payload && Array.isArray(payload.include) ? payload.include : [];
    if (include.length === 0) return { nodes: [], targets: [] };

    const capture = (payload && payload.capture) || undefined;
    const wantImages = Boolean(capture && capture.images && capture.maxImages > 0);
    const captureTargets = wantImages ? [] : undefined;

    const sets = selectorSets(payload.actionInclude, payload.actionExclude);
    actionable = sets.inSet;
    actionExcluded = sets.exSet;

    // 角色提升规则由外壳声明；只允许提升到可操作角色，防止把任意角色塞进句柄发放面
    activeRoleHints = (payload && Array.isArray(payload.roleHints) ? payload.roleHints : []).filter(
      (hint) => hint && ACTIONABLE_ROLES.has(hint.role) && Array.isArray(hint.selectors)
    );

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
      const node = describeNode(element, excluded, undefined, captureTargets, issued);
      if (node !== undefined) nodes.push(node);
    }

    // 已授权操作打开的模态：追加并标来源，授权面临时扩大必须看得见
    for (const modal of elevatedModals) {
      if (!modal.isConnected) {
        elevatedModals.delete(modal);
        continue;
      }
      actionable = new Set([modal, ...modal.querySelectorAll('*')]);
      const node = describeNode(modal, new Set(), 'modal-elevated', captureTargets, issued);
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

    // 同源但没有可路由地址的嵌套帧（about:blank/srcdoc）过不了外壳按 URL 的下钻，
    // 报错页/注入内容常藏在里面；父帧同源能直接读，就地内联进来（限 include 范围内、可见的帧）
    nodes.push(...inlineNestedNodes(roots, excluded, captureTargets, issued));

    // 画布渲染页（WPS/Office 文档预览等）：DOM 里没有文字，内容全画在 canvas 上，
    // 不说清楚模型只能拿空快照瞎编。有大画布且整页读不出文字时给一条诚实说明
    let canvasNote;
    const canvases = [...document.querySelectorAll('canvas')].filter((c) => c.width >= 200 && c.height >= 150);
    if (canvases.length > 0 && !hasReadableText()) {
      canvasNote =
        'This page renders its content on <canvas> (typical of document preview/viewer pages), ' +
        'so no text can be extracted from the DOM. Tell the user the content is not machine-readable ' +
        'instead of guessing what it shows.';
    }

    // 只上报本次感知发放（刷新）过的 ref：历史 ref 仍在句柄表里可被 act 使用，
    // 但不该混进本次快照，否则外壳侧的归属表和模型看到的句柄清单都会越滚越大
    const targets = [];
    for (const ref of issued) {
      const entry = handleTable.get(ref);
      if (entry) targets.push([ref, entry.target]);
    }
    // 外壳只知道自己请求了哪个 URL，不知道 service worker 最终投递到了哪个同源帧，
    // 也看不见本帧里是否还嵌着一层；读空时这几项是唯一能分辨「选错帧」与「内容更深」的依据，
    // nestedFrameUrls 则让外壳能对更深一层继续发起感知。
    const provenance = frameProvenance();
    // flatten 只生成浅拷贝，而取像分支稍后会把 imageId/imageNote 写回原始节点，
    // 所以折叠必须排在图片标记之后，这里先出不取像的分支
    if (!wantImages) {
      return { nodes: flatten(nodes), targets, ...provenance, ...(canvasNote ? { canvasNote } : {}) };
    }

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
    return {
      nodes: flatten(nodes),
      targets,
      ...provenance,
      ...(canvasNote ? { canvasNote } : {}),
      images,
      imagesOmitted: captureTargets.length - selected.length,
      imageFailures
    };
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
    // 与感知同口径提升，确认卡上的角色措辞才不会与快照对不上
    const name = accessibleName(element);
    const target = { role: promoteRole(element, actionRoleOf(element), name) };
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
    const urlBefore = location.href;
    const done = async (outcome) => {
      if (!outcome.ok) return outcome;
      // 模态与导航竞速探测：SPA/hash 跳转立即返回，不必等满模态轮询。
      // 真实跨文档导航 commit 后本帧上下文销毁，这份响应本就发不出去（外壳会看到
      // 「目标页面已失效」），这是固有限制；下一次感知按帧自报的新地址自会跟上。
      let navigated = false;
      let elevated = await waitFor(() => {
        if (location.href !== urlBefore) {
          navigated = true;
          return elevateNewModals(modalsBefore) ?? null; // null 占位：地址已变就立即收兵
        }
        return elevateNewModals(modalsBefore);
      }, 500);
      // 超时兜底再试一次（与原语义一致）；已导航时不必——页面正在卸载
      if (elevated == null && !navigated) elevated = elevateNewModals(modalsBefore);
      let next = outcome;
      if (elevated) {
        next = { ...next, elevatedModal: accessibleName(elevated) || 'dialog' };
      }
      // 导航证据：动作之后本帧地址变了就是页面已切换，明确告诉模型——否则它只能靠
      // 重新感知猜，而重读快照里若还留着旧列表帧，它会循环重点原目标
      if (navigated || location.href !== urlBefore) {
        next = { ...next, navigated: true, documentUrl: location.href };
      }
      return next;
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

  // ─── 新窗口拦截不在本脚本 ────────────────────────────────────────────
  // 点击结果留在本帧的拦截（window.open / <a target> 改当前帧跳转）由 main-world.js 的
  // lockdown 承担：它只在「白名单外壳下的跨域帧」激活，而本脚本跑在所有网站的所有帧里，
  // 在这里拦截会无差别改写用户正常浏览行为（Ctrl+点击、具名 target 导航等），故删除。
  // 导航证据（act 的 navigated/documentUrl）不依赖拦截的位置，照常工作。

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

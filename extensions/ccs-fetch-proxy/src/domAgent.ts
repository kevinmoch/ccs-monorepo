// CCS Fetch Proxy — 目标帧内的页面代理（MAIN world，document_start，每一帧）。
//
// 感知/操作的实现**全部来自 @webskill/browser**：本文件只做三件本地的事——
//   1. 装 click 监听器探针（必须在 MAIN world 且早于页面脚本，SDK 拿不到这个时机）；
//   2. 把 ISOLATED 递来的私有报文翻译成 SDK 的 `PageAgentRequest`，再把应答翻回去；
//   3. 声明本帧的可操作范围（见 src/scopes.ts）。
//
// 此前这里是一份 1000 余行、与 @webskill/browser「逐条对齐」的手写实现。逐条对齐的东西
// 会逐条走样：SDK 修一个可见性判定、加一条角色提升信号，这边不会自己跟上，而差异只会在
// 模型点错元素的时候才被发现。现在这条路径与 SDK 自己的浏览器扩展示例是同一份代码。
import { createPageAgentHandler } from '@webskill/sdk/browser';
import type { PageAgentReply, PageAgentRequest } from '@webskill/sdk/browser';
import { ERP_ACTION_SCOPE, ERP_ROLE_HINTS } from './scopes';

(() => {
  const PROTO = 'ccs-fetch-proxy';

  // 原生引用在 document_start 取好，页面之后改原型也劫持不到这条链路
  const nativeAddEventListener = EventTarget.prototype.addEventListener;
  const nativeStopImmediate = Event.prototype.stopImmediatePropagation;
  const nativePostMessage = window.postMessage.bind(window) as (message: unknown, targetOrigin: string) => void;

  // ─── 监听器探针：最强的可交互信号（FR-15.1 信号 0）────────────────────────
  // 本脚本先于页面脚本运行：包裹 addEventListener，把挂过 click 类监听的元素记下来。
  // 「有 click 监听器」就是可交互的定义本身，不看任何样式/类名声明——Tailwind 等工具类
  // 写法的菜单项四种样式信号全不带，只有这条路认得出。Vue 2 的 v-on 逐元素绑定必经此处；
  // 事件委托挂在 document 上的框架认不到具体元素，由 SDK 的其余信号兜底。
  // removeEventListener 不除名：误留的元素仍会被名字/可见性闸门拦住。
  //
  // WeakSet 而不是 DOM 标记属性：handler 与探针同 realm 同 world，不必把痕迹写进页面 DOM。
  const clickListenerTargets = new WeakSet<Element>();
  const CLICK_EVENT_TYPES = new Set(['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup']);

  // Chrome 的 unload 弃用（Permissions-Policy unload=()）下，页面注册 unload 监听器会打一条
  // violation，而调用栈指到下面的包装函数，看起来像本扩展在报错。策略明确禁止时透传本就
  // 无意义（监听器不会触发），直接跳过，保持控制台干净、行为等价。浏览器不认识这条策略
  // （features() 不含）或 API 缺失时一律放行，不改变旧环境行为。
  let unloadBlocked: boolean | undefined;
  function unloadDisallowed(): boolean {
    if (unloadBlocked !== undefined) return unloadBlocked;
    try {
      const policy = document as unknown as { permissionsPolicy?: unknown; featurePolicy?: unknown };
      const p = (policy.permissionsPolicy ?? policy.featurePolicy) as
        | { features?: () => string[]; allowsFeature?: (f: string) => boolean }
        | undefined;
      const known = typeof p?.features === 'function' ? p.features().includes('unload') : false;
      unloadBlocked = Boolean(known && typeof p?.allowsFeature === 'function' && !p.allowsFeature('unload'));
    } catch {
      unloadBlocked = false;
    }
    return unloadBlocked;
  }

  function probeAddEventListener(
    this: EventTarget,
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions
  ): void {
    if (type === 'unload' && unloadDisallowed()) return;
    if (CLICK_EVENT_TYPES.has(type) && this instanceof Element) clickListenerTargets.add(this);
    nativeAddEventListener.call(this, type, listener, options);
  }
  EventTarget.prototype.addEventListener = probeAddEventListener as typeof EventTarget.prototype.addEventListener;

  // 探针必须在 document_start 装好才看得见页面注册的监听器，可那时还不知道本帧是否在白名单
  // 外壳之下——于是每个网站的每个子帧都被改了原型、还吞掉了 unload 注册。ISOLATED 拿到确定
  // 答复「不是外壳下的帧」后会发来 DISARM，把原型还回去，不给无关站点留痕。
  // 只在原型仍是自己那份时还原：页面若在其上再包了一层，动它会把人家的包装一并抹掉。
  function disarmProbe(): void {
    if (EventTarget.prototype.addEventListener === probeAddEventListener) {
      EventTarget.prototype.addEventListener = nativeAddEventListener;
    }
  }

  // ─── SDK 页面代理 ─────────────────────────────────────────────────────────
  // 工厂而不是每次新建：reader 是有状态的（ref 表、模态提升状态跨请求累积），
  // 每次请求新建就永远 resolve 不到上一次感知发出的 ref。
  const handler = createPageAgentHandler({
    actionScope: ERP_ACTION_SCOPE,
    promoteRoles: true,
    interactiveHint: (element) => clickListenerTargets.has(element),
    roleHints: ERP_ROLE_HINTS,
    // 同源嵌套帧就地并入、跨源嵌套帧报成 nestedFrames 交给外壳下钻（分册 16）
    discoverNestedFrames: true
    // pickFiles 不注入：attach 需要用户手势，而本帧是被远程驱动的，一律按「用户取消」处理
  });

  // ─── 与 ISOLATED 的私有通道 ───────────────────────────────────────────────
  // 出站不带 token（页面读得到也无妨），靠 ISOLATED 发下的一次性 execId 认证；
  // 入站验一次性 bridgeToken 并在页面任何监听器之前截停。
  let bridgeToken: string | undefined;
  const postToIsolated = (msg: Record<string, unknown>): void => {
    nativePostMessage({ __ccsExt: true, proto: PROTO, to: 'iso', ...msg }, location.origin);
  };

  async function execute(reqId: string, op: unknown, payload: unknown): Promise<void> {
    try {
      const request = payload as PageAgentRequest;
      const expected = request?.type === 'execute' ? 'act' : 'perceive';
      if (op !== expected) throw new Error(`op/payload mismatch: op=${String(op)} type=${String(request?.type)}`);
      const reply: PageAgentReply = await handler.handle(request);
      // documentUrl 随应答回传：外壳按 URL 寻址本帧，帧在请求途中导航过就要能看出来。
      // 包在 result 里而不是外层信封——中间的 ISOLATED / service worker 只转发 result。
      postToIsolated({
        kind: 'CCS_EXT_DOM_EXECUTE_RESULT',
        reqId,
        ok: true,
        result: { reply, documentUrl: location.href }
      });
    } catch (err) {
      postToIsolated({
        kind: 'CCS_EXT_DOM_EXECUTE_RESULT',
        reqId,
        ok: false,
        error: (err as Error | undefined)?.message ?? String(err)
      });
    }
  }

  nativeAddEventListener.call(window, 'message', ((event: MessageEvent) => {
    if (event.source !== window) return;
    if (event.origin !== location.origin) return;
    const data = event.data as Record<string, unknown> | null;
    if (!data || data.__ccsExt !== true || data.proto !== PROTO) return;
    if (data.to !== 'dom') return;
    nativeStopImmediate.call(event);

    if (data.kind === 'CCS_EXT_HANDSHAKE') {
      // 只认第一条：它由 document_start 的 ISOLATED 脚本发出，页面脚本此时还没机会运行
      if (bridgeToken === undefined && typeof data.token === 'string') bridgeToken = data.token;
      return;
    }
    if (bridgeToken === undefined || data.token !== bridgeToken) return;

    if (data.kind === 'CCS_EXT_DOM_DISARM') disarmProbe();
    else if (data.kind === 'CCS_EXT_DOM_EXECUTE' && typeof data.reqId === 'string') {
      void execute(data.reqId, data.op, data.payload);
    }
  }) as EventListener);
})();

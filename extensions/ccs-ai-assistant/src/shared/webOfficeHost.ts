/**
 * 页内 WPS 文档的宿主端口（0.21.0 分册 11~13 的扩展侧）。
 *
 * SDK 那边只认 `WebOfficeHost` 这个接口，一行 `chrome.` 也没有；
 * 这里负责把它落到真的浏览器上：枚举与只读调用走内容脚本，截屏走 `captureVisibleTab`。
 *
 * ## 为什么截屏必须用 `captureVisibleTab`
 *
 * 文档在**跨源 iframe** 里。页面侧的任何办法（canvas、`html2canvas`、
 * `drawImage(iframe)`）都拿不到跨源帧的像素——那是同源策略的本意。
 * 扩展的 `captureVisibleTab` 拍的是合成后的标签页画面，因此它拍得到；
 * 代价是它**同时拍到文档以外的一切**，这一点必须在授权卡上说明，而不是在这里悄悄办掉。
 */
import type { WebOfficeHost, WebOfficeInstanceRecord } from '@webskill/browser';
import { WEB_OFFICE_CHANNEL, isWebOfficeResult, type WebOfficeRequest } from './messages';
import { extractPdfText, pdfDocumentReader } from './pdfText';
import { createPptxSourceReader } from './pptxSource';
import { compressImageToBudget } from '@webskill/browser';

/** 内容脚本没应答就不能干等：面板里悬着的读取会把整轮对话拖住 */
const TAB_TIMEOUT_MS = 30_000;

export interface ExtensionWebOfficeHostOptions {
  tabId(): number | undefined;
  origin(): string | undefined;
  pageUrl(): string | undefined;
  /** 截图预算；来自 `multimodal.maxImageBytes`，每次现读，不在装配期定死 */
  maxImageBytes(): number;
}

interface Listing {
  handle: string;
  claimedOfficeType?: unknown;
  claimedFileId?: unknown;
  claimedViaMount?: unknown;
  ready?: unknown;
}

async function ask(tabId: number, request: Omit<WebOfficeRequest, 'channel'>, frameId: number): Promise<unknown> {
  const message: WebOfficeRequest = { channel: WEB_OFFICE_CHANNEL, ...request };
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('The page did not answer in time.')), TAB_TIMEOUT_MS)
  );
  const reply = await Promise.race([chrome.tabs.sendMessage(tabId, message, { frameId }), timeout]);
  if (!isWebOfficeResult(reply)) throw new Error('The page returned an unexpected reply.');
  if (!reply.ok) throw new Error(reply.reason);
  return reply.value;
}

/**
 * 标签页里所有装得上内容脚本的帧（FR-11.4c）。
 *
 * 顶层帧永远排第一：多数站点的实例确实在那儿，先问它能少走几趟；
 * 真实部署里实例反而在子帧甚至孙帧上（客户站点的 Word / Excel 是孙帧、PDF 是子帧），
 * 所以「只问 frameId 0」那条老假设已经作废。
 */
async function frameIds(tabId: number): Promise<number[]> {
  try {
    const frames = (await chrome.webNavigation.getAllFrames({ tabId })) ?? [];
    const ids = frames.map((frame) => frame.frameId).filter((id) => id !== 0);
    return [0, ...ids];
  } catch {
    return [0];
  }
}

/** 帧 → 父帧。用于判断某一帧是不是另一帧的祖先（`viaMount` 去重） */
async function frameParents(tabId: number): Promise<Map<number, number>> {
  try {
    const frames = (await chrome.webNavigation.getAllFrames({ tabId })) ?? [];
    return new Map(frames.map((frame) => [frame.frameId, frame.parentFrameId]));
  } catch {
    return new Map();
  }
}

function hasAncestor(parents: Map<number, number>, frameId: number, ancestor: number): boolean {
  let cursor = parents.get(frameId);
  // 帧树不深，但页面能造出环形的父子声明；步数封顶免得在这里转不出来
  for (let hops = 0; cursor !== undefined && cursor >= 0 && hops < 32; hops += 1) {
    if (cursor === ancestor) return true;
    cursor = parents.get(cursor);
  }
  return false;
}

/**
 * 向**指定序号的那一帧**取字节（DV-18）。
 *
 * 浏览器的 `frameId` 与页面里的 `window.frames` 序号不是同一套编号，所以这里
 * 逐个问顶层帧的直接子帧：请求带上目标序号，帧自己比对，不是自己就直说不是。
 * **逐个显式寻址而不是广播**（AC-16.3）：广播的话先答的那一帧说了算，
 * 一页两份文档时会把另一份的字节记到这份头上。
 *
 * 谁都答不上就返回 `undefined`——上层降级到视觉通道。
 */
async function askFrame(tabId: number, frameIndex: number): Promise<unknown> {
  const frames = (await chrome.webNavigation.getAllFrames({ tabId })) ?? [];
  for (const frame of frames) {
    if (frame.frameId === 0 || frame.parentFrameId !== 0) continue;
    const message: WebOfficeRequest = { channel: WEB_OFFICE_CHANNEL, kind: 'take-frame-pdf', frameIndex };
    let reply: unknown;
    try {
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('The page did not answer in time.')), TAB_TIMEOUT_MS)
      );
      reply = await Promise.race([chrome.tabs.sendMessage(tabId, message, { frameId: frame.frameId }), timeout]);
    } catch {
      continue; // 那一帧没装内容脚本、或已经卸载：换下一帧
    }
    if (isWebOfficeResult(reply) && reply.ok) return reply.value;
  }
  return undefined;
}

export function createExtensionWebOfficeHost(options: ExtensionWebOfficeHostOptions): WebOfficeHost {
  const requireTab = (): number => {
    const tabId = options.tabId();
    if (tabId === undefined) throw new Error('No tab is bound.');
    return tabId;
  };

  /** 描述符只探一次：`api.ready` 之后方法表不再变，每次读都探一遍是白花往返 */
  const surfaces = new Map<string, { methods: ReadonlySet<string>; capturedAt: number }>();
  /** handle → 它是从哪一帧枚举出来的。后续每一次调用都投回那一帧（FR-11.4c） */
  const homeFrames = new Map<string, number>();

  const frameOf = (handle: string): number => homeFrames.get(handle) ?? 0;

  return {
    async list(): Promise<readonly WebOfficeInstanceRecord[]> {
      const tabId = options.tabId();
      if (tabId === undefined) return [];
      const documentUrl = options.pageUrl() ?? '';
      const ids = await frameIds(tabId);
      // 并发问、按帧序合并：广告页动辄几十个帧，串行问一遍要等到面板超时。
      // 顺序仍然由 `ids` 定，不由谁先答定——先答者优先会让同一页两次枚举给出不同的排序
      const answers = await Promise.all(
        ids.map(async (frameId) => {
          try {
            return await ask(tabId, { kind: 'list' }, frameId);
          } catch {
            return undefined; // 那一帧没装内容脚本、或已经卸载：跳过它，不连累其余帧
          }
        })
      );
      const found: WebOfficeInstanceRecord[] = [];
      const owners: { frameId: number; viaMount: boolean }[] = [];
      ids.forEach((frameId, index) => {
        const value = answers[index];
        if (!Array.isArray(value)) return;
        for (const entry of value as Listing[]) {
          if (typeof entry.handle !== 'string') continue;
          homeFrames.set(entry.handle, frameId);
          owners.push({ frameId, viaMount: entry.claimedViaMount === true });
          found.push({
            handle: entry.handle,
            officeType: typeof entry.claimedOfficeType === 'string' ? entry.claimedOfficeType : '',
            ...(typeof entry.claimedFileId === 'string' ? { fileId: entry.claimedFileId } : {}),
            documentUrl,
            state: entry.ready === true ? ('ready' as const) : ('initialising' as const)
          });
        }
      });
      // `config()` 造的句柄住在宿主帧，文档本体在它 mount 的子帧里，子帧会拿
      // `WPSOpenApi` 再报一次同一份。两条都留下就成了「一页两份、请指名」——
      // 而那两份其实是同一份。文档在哪一帧，就以哪一帧为准
      const parents = await frameParents(tabId);
      const supersedes = (frameId: number): boolean =>
        owners.some((other) => !other.viaMount && hasAncestor(parents, other.frameId, frameId));
      return found.filter((_record, index) => {
        const owner = owners[index]!;
        return !owner.viaMount || !supersedes(owner.frameId);
      });
    },

    async keyOf(handle) {
      const tabId = options.tabId();
      const origin = options.origin();
      // 两项缺一就不发钥匙：授权与记忆全按 origin 记账，来源不确定时宁可当作没有实例
      if (tabId === undefined || origin === undefined) return undefined;
      return { origin, tabId, handle };
    },

    read: {
      async describe(handle) {
        const cached = surfaces.get(handle);
        if (cached !== undefined) return cached;
        const value = await ask(requireTab(), { kind: 'describe', handle }, frameOf(handle));
        const methods = new Set<string>(Array.isArray(value) ? (value as unknown[]).filter(isString) : []);
        const surface = { methods, capturedAt: Date.now() };
        surfaces.set(handle, surface);
        return surface;
      },
      async call(handle, method, args) {
        return ask(
          requireTab(),
          { kind: 'call', handle, method, ...(args === undefined ? {} : { args }) },
          frameOf(handle)
        );
      },
      async takeCapturedPdf(handle) {
        // 两段式：先问登记着这份文档的那一帧「字节在顶层 `window.frames` 的第几个」，
        // 再到那一帧去取。不让子帧把字节送上来，是因为 SDK 所在的窗口收到任何一条
        // 窗口消息（包括一条端口握手）都会把它自己的应答队列推错位，整份文档打不开（DV-18）
        const tabId = requireTab();
        const frameIndex = await ask(tabId, { kind: 'take-pdf', handle }, frameOf(handle));
        if (typeof frameIndex === 'number') {
          const value = await askFrame(tabId, frameIndex);
          // 结构化克隆过 `chrome.tabs.sendMessage` 会把 Uint8Array 变成普通对象，
          // 所以两侧约定用数字数组传；这里恢复成字节
          if (Array.isArray(value) && value.length > 0) return Uint8Array.from(value as number[]);
        }
        // 嗅探器空手是**常态**而不是意外：weboffice 服务端渲染，正常浏览时整份 PDF 根本不过网。
        // 退到页面自己握着的那条原件直链（右上角下载图标点的就是它，FR-12.5f）。
        // 逐帧问而不是问这份文档那一帧：实测里链接在宿主帧、实例在 office 帧，两者从不同帧
        for (const frameId of await frameIds(tabId)) {
          let linked: unknown;
          try {
            linked = await ask(tabId, { kind: 'take-linked-pdf' }, frameId);
          } catch {
            continue; // 那一帧没装内容脚本、或已经卸载
          }
          if (Array.isArray(linked) && linked.length > 0) return Uint8Array.from(linked as number[]);
        }
        return undefined;
      },
      async takeCapturedPresentation(_handle) {
        // 演示文稿没有嗅探这一路：weboffice 服务端渲染，原件从来不过网。
        // 逐帧问直链的理由同上——链接在宿主帧，实例在 office 帧
        const tabId = requireTab();
        for (const frameId of await frameIds(tabId)) {
          let linked: unknown;
          try {
            linked = await ask(tabId, { kind: 'take-linked-presentation' }, frameId);
          } catch {
            continue;
          }
          if (Array.isArray(linked) && linked.length > 0) return Uint8Array.from(linked as number[]);
        }
        return undefined;
      }
    },

    vision: {
      async scroll(handle) {
        const value = (await ask(requireTab(), { kind: 'scroll', handle }, frameOf(handle))) as {
          scrollTop?: unknown;
          viewportHeight?: unknown;
          done?: unknown;
        };
        return {
          scrollTop: typeof value?.scrollTop === 'number' ? value.scrollTop : 0,
          viewportHeight: typeof value?.viewportHeight === 'number' ? value.viewportHeight : 0,
          done: value?.done === true
        };
      },
      async capture() {
        const tabId = requireTab();
        // 拍之前确认这个 tab 真的在前台：`captureVisibleTab` 拍的是**当前可见**的那一个，
        // 用户在我们发起截屏后切了页，拍到的就是他另一个标签页的内容
        const before = await chrome.tabs.get(tabId);
        if (before.active !== true) throw new Error('The tab is no longer in the foreground.');
        const dataUrl = await chrome.tabs.captureVisibleTab(before.windowId, { format: 'jpeg', quality: 85 });
        // 拍完再确认一次。两次之间仍有一个窗口期——真的在那一瞬间切走的话，
        // 这张图会被下面这次检查拦掉；而在「检查之后、截屏返回之前」切走则拦不住。
        // 这个残余窗口无法在扩展 API 上闭合，如实记在这里，不假装它不存在。
        const after = await chrome.tabs.get(tabId);
        if (after.active !== true) throw new Error('The tab was switched away while capturing.');
        const blob = await (await fetch(dataUrl)).blob();
        const budget = options.maxImageBytes();
        const compressed = await compressImageToBudget(blob, budget);
        return { mimeType: compressed.blob.type, data: await blobToBase64(compressed.blob) };
      }
    },

    // pdf.js 装在扩展里，SDK 不打包它；②级读取靠这一个函数把字节变成文本
    pdfExtractor: (bytes: Uint8Array) => extractPdfText(bytes),

    // ⓪ 级：同一份 pdf.js 再干一件事——逐页拿文本并把有图的那几页渲染出来（分册 23）。
    // 与 `read_document` 用的是同一份实现，不做第二份
    pdfDocumentReader,

    // ⓪ 级（演示文稿）：pptx 包里没有渲染好的页面图，所以这是解包器不是渲染器
    presentationReader: createPptxSourceReader()
  };
}

/** base64 不手写（AGENTS.md §6）：交给平台的 data URL 再切一刀 */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read the screenshot.'));
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.readAsDataURL(blob);
  });
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

/**
 * WPS WebOffice SDK 的挂钩（0.21.0 分册 11 / 分册 12）。
 *
 * 跑在**页面自己的 JS 世界**且 `document_start` 注入——两个条件缺一不可：
 * ISOLATED world 拿不到页面创建的 SDK 实例对象，而 `document_idle` 时
 * 真实站点早已在 `window.onload` 里 `init()` 完了，挂上去也只能等下一次。
 *
 * ## 三条不可让步的约束
 *
 * 1. **页面察觉不到我们在**（AC-11.1 / AC-11.1a）：`WebOfficeSDK` 这个名字在页面赋值之前
 *    必须仍然是**未声明**的——不是「存在但为 undefined」。所以这里既不占位也不装 getter，
 *    而是在几个确定的时刻扫一眼它在不在（FR-11.1a）。客户站点的 `open-jssdk` 用
 *    `try { o = WebOfficeSDK } catch { o = 内置SDK }` 做特性探测，占位描述符会让它选中
 *    一个 `undefined`，接着 `new o.config()` 抛错、文档打不开——那是我们制造的故障。
 * 2. **句柄不由页面决定**（FR-11.3a）：这一侧只发本地序号 `localId`，
 *    授权用的 handle 由 ISOLATED 侧生成并保管映射。页面伪造 localId 最多
 *    指向另一个它自己的实例，指不到别的标签页、更换不出授权。
 * 3. **只读**（FR-12.2）：调用器只认白名单里的方法名，写方法从来不在清单里。
 *
 * 出错一律吞掉。这段代码在别人的页面里跑，抛出去会打断页面自己的初始化；
 * `console.error` 同理——那是页面的控制台，不是我们的日志。
 */

import { dispatchBridgeEvent, readBridgeEvent } from './domBridge';
import { frameIndexInTop } from './frameIndex';
import { takeLinkedPdf, takeLinkedPresentation } from './fileLink';
import { takeSniffedPdf } from './pdfSniffer';
import {
  WEB_OFFICE_BRIDGE_CHANNEL,
  WEB_OFFICE_BRIDGE_REQUEST_EVENT,
  WEB_OFFICE_BRIDGE_RESPONSE_EVENT,
  WEB_OFFICE_OFFICE_TYPE_MIRROR,
  WEB_OFFICE_READ_METHOD_MIRROR,
  isWebOfficeBridgeRequest,
  type WebOfficeBridgeResponse,
  type WebOfficeInstanceSummary
} from './bridge';

type Unknown = Record<string, unknown>;

/**
 * 「这个值能不能挂属性」——不是「它是不是对象」。
 *
 * 真实 UMD 包导出的 `WebOfficeSDK` 是一个**类**（`typeof === 'function'`），
 * `init` / `OfficeType` / `version` 都是它的静态成员。早先各处写 `typeof x === 'object'`，
 * 于是真实站点上整条挂钩链静默失效（DV-16）。JS 里能承载属性的是 object 与 function 两种，
 * 判定必须两种都认。
 */
function holdsProperties(value: unknown): value is Unknown {
  return (typeof value === 'object' || typeof value === 'function') && value !== null;
}

declare global {
  interface Window {
    /**
     * 页面自己挂上来的 WPS SDK。类型写 `unknown` 是刻意的：
     * 它的形状由页面决定，我们只做转发，任何具体声明都是我们替页面编的。
     */
    WebOfficeSDK?: unknown;
    /** WPS 自家阅读器在 office 帧上留下的实例（FR-11.1d 收养的对象） */
    WPSOpenApi?: unknown;
    /** open-jssdk 的三个 UMD 导出名（FR-11.1e）。它们是三个不同对象，各有各的 `config` */
    OpenSDK?: unknown;
    WPS?: unknown;
    litePreviewSDK?: unknown;
    /** 同一帧上的文档类型标记，`'w'` / `'s'` / `'f'` */
    officeType?: unknown;
  }
}

interface InstanceRecord {
  localId: string;
  instance: Unknown;
  officeType: string;
  fileId?: string;
  iframeId?: string;
  state: 'initialising' | 'ready' | 'failed';
  /** `config()` 造的远程句柄，文档在子帧里；宿主拿它去重 */
  viaMount?: boolean;
  /** 就绪信号来过了吗。信号是一次性的，`Application` 却是懒创建的，两者不同步 */
  readySignalled?: boolean;
  /** 工作表名单与它们在 `Sheets` 里的真实序号；见 `sheetIndex` */
  sheets?: { names: string[]; positions: number[] };
}

const records: InstanceRecord[] = [];

let nextLocalId = 1;

/**
 * 结构指纹（FR-11.2）。
 *
 * `init` 之前唯一稳定可见的形状就是 `OfficeType` 枚举（v2.0.5 另有 `version` 静态属性，
 * 但它不在需求认定的指纹面里）。少一个键、或某个键的值变了，都说明这不是我们验证过的那一版——**不挂**。
 * 多出来的键放行：新增类型不影响我们只读那四种。
 */
function fingerprintMatches(sdk: Unknown): boolean {
  const officeType = sdk['OfficeType'];
  if (!holdsProperties(officeType)) return false;
  const actual = officeType as Record<string, unknown>;
  for (const [name, value] of Object.entries(WEB_OFFICE_OFFICE_TYPE_MIRROR)) {
    if (actual[name] !== value) return false;
  }
  return true;
}

/**
 * 一次跨帧取值的上限。**必须有**：读错一个成员时 WPS 那边既不回也不报错，
 * Promise 永远挂着；而 SDK 的请求是排队的，一条挂死后面全部连带超时。
 * 真页面上实测过：把属性当方法调，之后每一条读取都停摆（FR-12.5a 的录像）。
 */
const CALL_TIMEOUT_MS = 15_000;

type Step = readonly [op: 'get' | 'call', member: string, args?: readonly unknown[]];

function settle(value: unknown, what: string): Promise<unknown> {
  return Promise.race([
    Promise.resolve(value),
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Reading "${what}" from the document timed out.`)), CALL_TIMEOUT_MS);
    })
  ]);
}

/**
 * 沿路径往下走，**中途一次都不 await**。
 *
 * SDK 给每个成员生成的存取器返回的是一个带 `then` 的代理函数，子成员挂在它上面；
 * await 掉就变成普通值，再往下取只会拿到 undefined。所以导航是同步的，只有终点才取值。
 */
function reach(root: unknown, ...steps: readonly Step[]): unknown {
  let current = root;
  for (const [op, member, args] of steps) {
    if (!holdsProperties(current)) return undefined;
    current = (current as Unknown)[member];
    if (op !== 'call') continue;
    if (typeof current !== 'function') return undefined;
    current = (current as (...a: unknown[]) => unknown)(...(args ?? []));
  }
  return current;
}

/** 走到终点并取值。路径中断时报出断在哪一段，而不是一句笼统的读取失败 */
async function value(root: unknown, ...steps: readonly Step[]): Promise<unknown> {
  const trail = steps.map(([, member]) => member).join('.');
  const target = reach(root, ...steps);
  if (target === undefined) throw new Error(`"${trail}" is not available on this document.`);
  return await settle(target, trail);
}

/**
 * 能力探测：这条路径在本实例上存不存在。
 *
 * 末段只查描述符、**不读值**——读一次就是一次跨帧往返，而 `describe` 一上来要问十几条。
 * 早先这里用 `typeof candidate === 'function'` 判定，那是恒真的：SDK 给属性和方法
 * 生成的都是带 `then` 的函数对象，两者从外面看没有区别（DV-16 的实测结论）。
 */
function hasPath(root: unknown, segments: readonly string[]): boolean {
  let current = root;
  for (const segment of segments.slice(0, -1)) {
    if (!holdsProperties(current)) return false;
    current = (current as Unknown)[segment];
  }
  if (!holdsProperties(current)) return false;
  const last = segments[segments.length - 1] ?? '';
  return Object.getOwnPropertyDescriptor(current, last) !== undefined || last in current;
}

/**
 * WPS 用 `\r` 分段，并在域的位置塞控制字符（目录域两端是 `\u0003` / `\u0004`）。
 * `\u000B` 是软换行（PPT 文本框里一条要点内部的折行），删掉会把两行黏成一个词。
 */
function normaliseText(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\r\n?|\u000B/g, '\n').replace(/[\u0000-\u0008\u000C\u000E-\u001F]/g, '');
}

function numberAt(args: readonly unknown[], index: number, fallback: number): number {
  const raw = Number(args[index]);
  return Number.isFinite(raw) ? raw : fallback;
}

/** WPS 会往工作表名单里塞内部表（存单元格图片用），那不是用户的数据 */
function isReservedSheet(name: string): boolean {
  return name.startsWith('WpsReserved_');
}

interface ReadAdapter {
  /** 能力探测路径，末段只查名字不读值 */
  readonly probe: readonly string[];
  invoke(record: InstanceRecord, args: readonly unknown[]): Promise<unknown>;
}

/**
 * 逻辑方法 → 真实 API（按 officeType 分组）。
 *
 * 分组不是为了整齐：`api.ready` 下发的描述符**每种类型完全不同**，
 * Writer 的根是 `ActiveDocument`、表格是 `Sheets`/`ActiveSheet`、PDF 是 `ActivePDF`、
 * 演示是 `ActivePresentation`（DV-16）。
 * 一张扁平的候选表只会让三种类型互相试探对方的名字，全部落空。
 *
 * 这里不是「转发一次调用」而是**适配**：`extract.ts` 要的是 `{items,total}`、`{rows,rowCount}`
 * 这类我们自己的形状，WPS 给的是 VBA 那一套对象模型，中间的换算只能在这一侧做。
 *
 * 每条路径都由 `scripts/probeWebOffice.mjs` 在真文档上取到过值（2026-09-08 录，FR-12.5a）。
 */
const ADAPTERS: Record<string, Record<string, ReadAdapter>> = {
  // ---- Writer
  w: {
    GetDocumentText: {
      // `ActiveDocument.Range` 是空区域（实测 Start=End=0），整篇正文在 `Content` 上
      probe: ['ActiveDocument', 'Content', 'Text'],
      async invoke(record) {
        const app = record.instance['Application'];
        const text = await value(app, ['get', 'ActiveDocument'], ['get', 'Content'], ['get', 'Text']);
        return normaliseText(String(text ?? ''));
      }
    },
    GetParagraphs: {
      probe: ['ActiveDocument', 'Content', 'Paragraphs', 'Count'],
      async invoke(record, args) {
        const app = record.instance['Application'];
        const offset = Math.max(0, numberAt(args, 0, 0));
        const limit = Math.max(1, numberAt(args, 1, 200));
        const paragraphs = reach(app, ['get', 'ActiveDocument'], ['get', 'Content'], ['get', 'Paragraphs']);
        const total = Number(await value(paragraphs, ['get', 'Count'])) || 0;
        const items: { text: string }[] = [];
        for (let index = offset; index < Math.min(total, offset + limit); index += 1) {
          // Item 是 1 基的
          const text = await value(paragraphs, ['call', 'Item', [index + 1]], ['get', 'Range'], ['get', 'Text']);
          items.push({ text: normaliseText(String(text ?? '')) });
        }
        return { items, total };
      }
    }
  },
  // ---- Spreadsheet
  s: {
    GetSheetNames: {
      probe: ['Sheets', 'GetNameList'],
      async invoke(record) {
        return await sheetNames(record);
      }
    },
    GetUsedRange: {
      probe: ['ActiveSheet', 'UsedRange'],
      async invoke(record, args) {
        const app = record.instance['Application'];
        const position = (await sheetPositions(record))[numberAt(args, 0, 0)];
        if (position === undefined) return { rows: [], rowCount: 0, columnCount: 0 };
        const start = Math.max(0, numberAt(args, 1, 0));
        const limit = Math.max(1, numberAt(args, 2, 200));
        const used = reach(app, ['get', 'Sheets'], ['call', 'Item', [position]], ['get', 'UsedRange']);
        const rowCount = Number(await value(used, ['get', 'Rows'], ['get', 'Count'])) || 0;
        const columnCount = Number(await value(used, ['get', 'Columns'], ['get', 'Count'])) || 0;
        const take = Math.min(limit, rowCount - start);
        if (take <= 0 || columnCount <= 0) return { rows: [], rowCount, columnCount };
        // Offset/Resize 一次框出一块，避免自己拼 A1 地址串（列号进制换算是纯粹的出错来源）
        const grid = await value(
          used,
          ['call', 'Offset', [start, 0]],
          ['call', 'Resize', [take, columnCount]],
          ['get', 'Value2']
        );
        return { rows: Array.isArray(grid) ? grid : [], rowCount, columnCount };
      }
    }
  },
  // ---- PDF
  f: {
    GetPageCount: {
      probe: ['ActivePDF', 'PagesCount'],
      async invoke(record) {
        const app = record.instance['Application'];
        return Number(await value(app, ['get', 'ActivePDF'], ['get', 'PagesCount'])) || 0;
      }
    },
    GetPageText: {
      probe: ['ActivePDF', 'PageTextData'],
      async invoke(record, args) {
        const app = record.instance['Application'];
        // 页码是 1 基的；抽取器按 0 基传
        const page = Math.max(0, numberAt(args, 0, 0)) + 1;
        const data = await value(app, ['get', 'ActivePDF'], ['call', 'PageTextData', [page]]);
        if (!Array.isArray(data)) return '';
        return normaliseText(data.map((entry) => String((entry as { content?: unknown })?.content ?? '')).join('\n'));
      }
    }
  },
  // ---- Presentation
  p: {
    GetSlideCount: {
      probe: ['ActivePresentation', 'Slides', 'Count'],
      async invoke(record) {
        const app = record.instance['Application'];
        return Number(await value(app, ['get', 'ActivePresentation'], ['get', 'Slides'], ['get', 'Count'])) || 0;
      }
    },
    GetSlideBody: {
      probe: ['ActivePresentation', 'Slides', 'Item'],
      async invoke(record, args) {
        return await shapeTexts(reach(slideAt(record, numberAt(args, 0, 0)), ['get', 'Shapes']));
      }
    },
    GetSlideNotes: {
      probe: ['ActivePresentation', 'Slides', 'Item'],
      async invoke(record, args) {
        const shapes = reach(slideAt(record, numberAt(args, 0, 0)), ['get', 'NotesPage'], ['get', 'Shapes']);
        // 只缺备注不算失败（设计 §3.3）：备注页取不到就当这张没写备注
        if (shapes === undefined) return '';
        const { texts } = await shapeTexts(shapes);
        // 备注页上除备注框外还挂着页码之类的字段占位符，取值是一个孤零零的符号（实测 `*`）。
        // 不含任何字母或数字的那一条不是备注
        return texts.filter((text) => /[\p{L}\p{N}]/u.test(text)).join('\n');
      }
    }
  }
};

/** 第 `index` 张（0 基）幻灯片。`Slides.Item` 是 1 基的 */
function slideAt(record: InstanceRecord, index: number): unknown {
  const app = record.instance['Application'];
  const at = Math.max(0, index) + 1;
  return reach(app, ['get', 'ActivePresentation'], ['get', 'Slides'], ['call', 'Item', [at]]);
}

/**
 * 一组形状里的文本，连同形状总数——后者是 FR-12.4c 那条「有多少读不出来」的分母。
 *
 * 先问 `HasTextFrame` 而不是直接试 `TextFrame`：图片与图表上那条链断在半路，
 * 抛出来的话报的是 `TextRange` 读不到，看不出问题其实在形状上。
 * 这个成员在某些形状上不存在（实测取到 undefined），那时才退回去试文本路径。
 */
async function shapeTexts(shapes: unknown): Promise<{ texts: string[]; shapeCount: number }> {
  if (shapes === undefined) return { texts: [], shapeCount: 0 };
  const shapeCount = Number(await value(shapes, ['get', 'Count'])) || 0;
  const texts: string[] = [];
  for (let index = 1; index <= shapeCount; index += 1) {
    const shape = reach(shapes, ['call', 'Item', [index]]);
    const hasTextFrame = reach(shape, ['get', 'HasTextFrame']);
    if (hasTextFrame !== undefined && (await settle(hasTextFrame, 'HasTextFrame')) !== true) continue;
    const text = reach(shape, ['get', 'TextFrame'], ['get', 'TextRange'], ['get', 'Text']);
    if (text === undefined) continue;
    const line = normaliseText(String((await settle(text, 'TextFrame.TextRange.Text')) ?? '')).trim();
    if (line !== '') texts.push(line);
  }
  return { texts, shapeCount };
}

/**
 * 工作表名单，以及「第几张用户表」对应 WPS 里的第几个位置。
 *
 * 两者必须一起算：名单里滤掉了内部表，滤完之后的下标就不再等于 `Sheets.Item` 的序号了。
 * 缓存在实例上——`extract.ts` 每读一块都要定位一次表，每次都重新问一遍会把往返预算吃光。
 */
async function sheetIndex(record: InstanceRecord): Promise<{ names: string[]; positions: number[] }> {
  if (record.sheets !== undefined) return record.sheets;
  const raw = await value(record.instance['Application'], ['get', 'Sheets'], ['call', 'GetNameList', []]);
  const all = Array.isArray(raw) ? raw.map((name) => String(name ?? '')) : [];
  const names: string[] = [];
  const positions: number[] = [];
  for (const [index, name] of all.entries()) {
    if (isReservedSheet(name)) continue;
    names.push(name);
    positions.push(index + 1);
  }
  record.sheets = { names, positions };
  return record.sheets;
}

async function sheetNames(record: InstanceRecord): Promise<string[]> {
  return (await sheetIndex(record)).names;
}

async function sheetPositions(record: InstanceRecord): Promise<number[]> {
  return (await sheetIndex(record)).positions;
}

function resolveAdapter(record: InstanceRecord, method: string): ReadAdapter | undefined {
  const adapter = ADAPTERS[record.officeType]?.[method];
  if (adapter === undefined) return undefined;
  try {
    return hasPath(record.instance['Application'], adapter.probe) ? adapter : undefined;
  } catch {
    // 存取器的 get 陷阱可能抛：当作这一版没有这个能力
    return undefined;
  }
}

/** 描述符探测：本实例当前支持哪些逻辑方法。上层据此选读取路线，而不是试错 */
function describe(record: InstanceRecord): readonly string[] {
  return WEB_OFFICE_READ_METHOD_MIRROR.filter((method) => resolveAdapter(record, method) !== undefined);
}

function summarize(record: InstanceRecord): WebOfficeInstanceSummary {
  return {
    localId: record.localId,
    officeType: record.officeType,
    ...(record.fileId === undefined ? {} : { fileId: record.fileId }),
    ...(record.iframeId === undefined ? {} : { iframeId: record.iframeId }),
    ...(record.viaMount === true ? { viaMount: true } : {}),
    state: record.state
  };
}

/**
 * 探明脚本专用的原始视图（FR-12.5a）。
 *
 * 桥上的 `describe` 只回白名单里解析得到的方法，用它探明等于拿答案对答案；
 * 探明要看的是白名单之外还有什么，因此这里把实例原样交出去。
 * 唯一的调用方 `webOfficeProbeReport.ts` 整体挂在 `__WEBSKILL_WEBOFFICE_PROBE__` 之下，
 * 生产构建里那个分支被消除，这个导出随之无人引用、被摇掉。
 */
export function probeRecords(): readonly { summary: WebOfficeInstanceSummary; instance: unknown }[] {
  return records.map((record) => ({ summary: summarize(record), instance: record.instance }));
}

/**
 * 枚举时顺手清理已经从 DOM 上摘掉的实例（FR-11.5）。
 *
 * 不设定时器轮询：页面关掉一个文档后我们并不需要「立刻」知道，
 * 下一次有人来问的时候发现它不在了就够了。
 */
function liveRecords(): InstanceRecord[] {
  for (let i = records.length - 1; i >= 0; i -= 1) {
    const record = records[i]!;
    if (record.iframeId !== undefined && document.getElementById(record.iframeId) === null) {
      records.splice(i, 1);
      continue;
    }
    // 就绪信号是一次性的，而 `Application` 是懒创建的：信号到达那一刻它还不在，
    // 这份实例就会永远停在 initialising，症状是同一个页面「有时读得了、有时说还在加载」。
    // 不加定时器，也不放宽判定——只对**已经来过信号**的实例，在有人来问时补看一眼（FR-11.1a）
    if (record.state === 'initialising' && record.readySignalled === true) markReady(record);
  }
  return records;
}

function findRecord(localId: string): InstanceRecord | undefined {
  return liveRecords().find((record) => record.localId === localId);
}

/** iframe 是 SDK 自己插的，插入时机不定；就绪后回填一次即可（FR-11.4） */
function backfillIframeId(record: InstanceRecord): void {
  if (record.iframeId !== undefined) return;
  try {
    const frames = document.querySelectorAll('iframe.web-office-iframe');
    for (const frame of Array.from(frames)) {
      const id = frame.getAttribute('id');
      if (id === null || id === '') continue;
      if (records.some((other) => other.iframeId === id)) continue;
      record.iframeId = id;
      return;
    }
  } catch {
    // 取不到就留空：iframeId 只用于清理与 PDF 归属，缺了不影响读取
  }
}

/**
 * 宣布就绪。`Application` 是懒创建的，`ready()` 兑现之前不存在（需求 §1.7 实测）——
 * `api.ready` 事件可能先到，那时宣布就绪，能力探测会得出「一个能力都没有」。
 * 所以取不到就先不宣布，等下一次有人来问时 `liveRecords` 再看。
 */
function markReady(record: InstanceRecord): void {
  record.readySignalled = true;
  try {
    if (record.instance['Application'] === undefined) return;
  } catch {
    return;
  }
  record.state = 'ready';
  backfillIframeId(record);
}

/**
 * 就绪判定只认真实事件（FR-11.4）。
 *
 * 计时器「等三秒大概好了」会把「没就绪」误报成「读出来是空的」——
 * 那是最难查的一类错，因为它的症状是内容不全而不是报错。
 */
function watchReady(record: InstanceRecord): void {
  try {
    const apiEvent = record.instance['ApiEvent'] as Unknown | undefined;
    const add = apiEvent?.['AddApiEventListener'];
    if (typeof add === 'function') {
      (add as (name: string, handler: () => void) => void).call(apiEvent, 'api.ready', () => markReady(record));
    }
  } catch {
    // 换下面的 ready() 兜底
  }
  try {
    const ready = record.instance['ready'];
    if (typeof ready === 'function') {
      void Promise.resolve((ready as () => unknown).call(record.instance)).then(
        () => markReady(record),
        () => {
          record.state = 'failed';
        }
      );
    }
  } catch {
    // 两条路都没有就靠 `liveRecords` 的补看：上层报 not-ready，而不是读出半份内容
  }
}

function registerInstance(instance: unknown, params: unknown): void {
  // 整个注册过程包在吞异常里：我们在别人的页面里，抛出去会打断页面自己的初始化
  try {
    if (!holdsProperties(instance)) return;
    const options = (holdsProperties(params) ? params : {}) as Unknown;
    const officeType = typeof options['officeType'] === 'string' ? (options['officeType'] as string) : '';
    const fileId = typeof options['fileId'] === 'string' ? (options['fileId'] as string) : undefined;
    const record: InstanceRecord = {
      localId: `local-${nextLocalId++}`,
      instance: instance as Unknown,
      officeType,
      ...(fileId === undefined ? {} : { fileId }),
      state: 'initialising'
    };
    records.push(record);
    watchReady(record);
  } catch {
    // 诊断信息走 ISOLATED 侧，不往页面控制台写
  }
}

/**
 * 包过的 `init` 缓存。每次属性读取都新建一个函数，页面就会看到
 * `SDK.init !== SDK.init`——真实 SDK 上那是同一个对象，这种差别是可观测的。
 */
const patchedInits = new WeakMap<object, (this: unknown, params: unknown) => unknown>();

/**
 * 包一层 `init`，并把原函数自己的属性搬过来。
 *
 * UMD 包把 `OfficeType` 同时挂在 SDK 对象与 `init` 函数上，页面两处都读得到；
 * 只转发调用而不搬属性，`WebOfficeSDK.init.OfficeType` 就会变成 `undefined`——
 * 那正是 AC-11.3（透传等价）要挡的那一类可观测差异。
 */
function patchInit(
  original: (p: unknown) => unknown,
  target: Unknown,
  receiver: unknown
): (this: unknown, params: unknown) => unknown {
  const cached = patchedInits.get(original);
  if (cached !== undefined) return cached;
  const patched = function patchedInit(this: unknown, params: unknown): unknown {
    const instance = original.call(this === receiver ? target : this, params);
    registerInstance(instance, params);
    return instance;
  };
  try {
    for (const key of Reflect.ownKeys(original)) {
      // `length` / `name` / `prototype` 是函数自带的，搬过去只会把包装函数的元信息弄乱
      if (key === 'length' || key === 'name' || key === 'prototype') continue;
      const descriptor = Object.getOwnPropertyDescriptor(original, key);
      if (descriptor !== undefined) Object.defineProperty(patched, key, descriptor);
    }
  } catch {
    // 搬不动就算了：调用本身照常，页面顶多少看见一个附属属性
  }
  patchedInits.set(original, patched);
  return patched;
}

/**
 * 把 SDK 对象换成一个转发一切、只在 `init` 上做手脚的 Proxy。
 *
 * 不复制属性、不做浅拷贝：SDK 内部有跨方法共享的状态，拷一份出来会让
 * 页面调用的和我们看到的变成两个对象。`getOwnPropertyDescriptors` + `setPrototypeOf`
 * 只用于让 `Object.keys`、`instanceof` 这类页面自检看起来与原来一致。
 */
function wrap(sdk: Unknown): Unknown {
  if (!fingerprintMatches(sdk)) return sdk;
  return new Proxy(sdk, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (property !== 'init' || typeof value !== 'function') return value;
      return patchInit(value as (p: unknown) => unknown, target, receiver);
    }
  });
}

/**
 * 收养已经建好的实例（FR-11.1d）。
 *
 * 真实部署里 SDK 被打包进 WPS 自家阅读器，宿主页上没有任何全局可拦；
 * 实例只在最内层 office 帧上露成 `window.WPSOpenApi`。它是 `init` 的**产物**，
 * 身上没有 `init`、也没有 `OfficeType` 枚举，所以指纹校验对它不适用；
 * 也**不包 Proxy**——没有 `init` 可拦，包一层只会多出一处页面看得见的差异。
 *
 * 识别面是 `ready` + `ApiEvent`，**不能是 `Application`**：实测里后者是懒创建的，
 * `ready()` 兑现之前根本不存在（需求 §1.7）。Word / Excel 外面套着阅读器帧，
 * 那一层自己 await 过 `ready()`，所以拿 `Application` 当识别面在它俩身上碰巧能成；
 * PDF 是顶层页直接嵌 office 帧，没有那一层，于是永远认不出来。
 */
const adopted = new WeakSet<object>();
/** 已经包过的 SDK（原件与代理都记），免得一轮轮扫描把代理又包一层 */
const wrapped = new WeakSet<object>();

/** 优先信这一帧自己的标记，其次才是 URL 里 WPS 自己拼的那一段 */
function frameOfficeType(): string {
  const declared = window.officeType;
  if (typeof declared === 'string' && declared !== '') return declared;
  const match = /\/office\/([^/?#]+)\//.exec(window.location.pathname);
  return match?.[1] ?? '';
}

function frameFileId(): string | undefined {
  try {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('_w_third_file_id') ?? params.get('file_id');
    return id === null || id === '' ? undefined : id;
  } catch {
    return undefined;
  }
}

function adoptOpenApi(): void {
  try {
    const api = window.WPSOpenApi;
    if (!holdsProperties(api) || adopted.has(api)) return;
    if (typeof api['ready'] !== 'function' || !('ApiEvent' in api)) return;
    adopted.add(api);
    const fileId = frameFileId();
    const record: InstanceRecord = {
      localId: `local-${nextLocalId++}`,
      instance: api,
      officeType: frameOfficeType(),
      ...(fileId === undefined ? {} : { fileId }),
      state: 'initialising'
    };
    records.push(record);
    watchReady(record);
  } catch {
    // 页面把这些全局定义成会抛的存取器：当作这一帧没有实例
  }
}

/**
 * 包住页面**已经放好**的 SDK（FR-11.1a）。
 *
 * 不预先 `defineProperty` 占位：那会让 `try { WebOfficeSDK } catch` 这种特性探测
 * 拿到 `undefined` 而不是 `ReferenceError`，真实站点上足以让整份文档打不开（AC-11.1a）。
 * 代价是两次扫描之间的同步 `init` 会漏掉，兜底是上面的收养。
 */
function wrapExistingSdk(): void {
  try {
    const sdk = window.WebOfficeSDK;
    if (!holdsProperties(sdk) || wrapped.has(sdk)) return;
    const proxy = wrap(sdk);
    if (proxy === sdk) return;
    wrapped.add(sdk);
    wrapped.add(proxy);
    window.WebOfficeSDK = proxy;
  } catch {
    // 页面把它定义成不可写、或 setter 抛错：让它去，我们本来就无权改
  }
}

function scan(): void {
  adoptOpenApi();
  wrapExistingSdk();
  wrapConfigSdks();
}

/**
 * open-jssdk（v0.1.x）的三个 UMD 导出名（FR-11.1e）。
 *
 * 它与 `WebOfficeSDK` 是**两代 API**，三处都不一样：工厂叫 `config` 不叫 `init`；
 * 它返回 **Promise** 而不是实例；参数里既没有 `officeType` 也没有 `fileId`，
 * 类型与文档 id 藏在 `url` 的 `/office/{类型}/{id}` 段里。
 *
 * 实测（2026-09-10，ccs.huaweicloud.com 的 `open-jssdk-v0.1.3.umd.js`）：
 * 三个名字是**三个不同对象**，各有各的 `config`，且都没有 `OfficeType` 枚举，
 * 所以 FR-11.2 那套结构指纹在这一支上无从谈起——**全局名就是指纹**。
 * 只认这三个名字、只在 `config` 是函数时才包，是这条分支唯一的准入。
 */
const CONFIG_SDK_GLOBALS = ['OpenSDK', 'WPS', 'litePreviewSDK'] as const;

const patchedConfigs = new WeakMap<object, (this: unknown, params: unknown) => unknown>();

/** 从 `config({url})` 的 url 里取 `/office/{类型}/{id}` 那两段 */
function officeUrlParts(params: unknown): { officeType: string; fileId?: string } {
  try {
    const url = holdsProperties(params) ? params['url'] : undefined;
    if (typeof url !== 'string' || url === '') return { officeType: '' };
    const parsed = new URL(url, window.location.href);
    const match = /\/office\/([^/?#]+)\/([^/?#]+)/.exec(parsed.pathname);
    const declared = parsed.searchParams.get('_w_third_file_id') ?? parsed.searchParams.get('file_id');
    const fileId = declared !== null && declared !== '' ? declared : match?.[2];
    return { officeType: match?.[1] ?? '', ...(fileId === undefined ? {} : { fileId }) };
  } catch {
    return { officeType: '' };
  }
}

function registerConfigured(instance: unknown, params: unknown): void {
  try {
    if (!holdsProperties(instance) || adopted.has(instance)) return;
    adopted.add(instance);
    const { officeType, fileId } = officeUrlParts(params);
    const record: InstanceRecord = {
      localId: `local-${nextLocalId++}`,
      instance,
      officeType,
      ...(fileId === undefined ? {} : { fileId }),
      state: 'initialising',
      viaMount: true
    };
    records.push(record);
    watchReady(record);
  } catch {
    // 诊断信息走 ISOLATED 侧，不往页面控制台写
  }
}

function patchConfig(
  original: (p: unknown) => unknown,
  target: Unknown,
  receiver: unknown
): (this: unknown, params: unknown) => unknown {
  const cached = patchedConfigs.get(original);
  if (cached !== undefined) return cached;
  const patched = function patchedConfigFn(this: unknown, params: unknown): unknown {
    const result = original.call(this === receiver ? target : this, params);
    // **原样交还** `result`：页面 `await` 的必须是它自己那个 Promise，
    // 我们另起一条链去等实例。返回我们 then 出来的新 Promise 是页面看得见的差异（AC-11.3）
    void Promise.resolve(result).then(
      (instance) => registerConfigured(instance, params),
      () => undefined
    );
    return result;
  };
  patchedConfigs.set(original, patched);
  return patched;
}

function wrapConfigSdks(): void {
  for (const name of CONFIG_SDK_GLOBALS) {
    try {
      const sdk = window[name];
      if (!holdsProperties(sdk) || wrapped.has(sdk)) continue;
      if (typeof sdk['config'] !== 'function') continue;
      const proxy = new Proxy(sdk, {
        get(target, property, receiver) {
          const value = Reflect.get(target, property, receiver);
          if (property !== 'config' || typeof value !== 'function') return value;
          return patchConfig(value as (p: unknown) => unknown, target, receiver);
        }
      });
      wrapped.add(sdk);
      wrapped.add(proxy);
      window[name] = proxy;
    } catch {
      // 页面把它定义成不可写、或 setter 抛错：让它去，我们本来就无权改
    }
  }
}

/**
 * 装挂钩：扫描 + 桥。**不碰 `window.WebOfficeSDK` 这个名字的可见性**——
 * 装钩前后 `'WebOfficeSDK' in window` 与裸标识符的求值结果必须逐字相同（AC-11.1a）。
 */
export function installWebOfficeHook(): void {
  scan();
  // 事件驱动的确定时刻，不是定时器轮询（FR-11.1a）
  document.addEventListener('DOMContentLoaded', scan);
  window.addEventListener('load', scan);
  document.addEventListener(WEB_OFFICE_BRIDGE_REQUEST_EVENT, onBridgeMessage);
}

function reply(id: number, value: unknown): void {
  const response: WebOfficeBridgeResponse = { channel: WEB_OFFICE_BRIDGE_CHANNEL, id, ok: true, value };
  // 序列化不了就如实报错，而不是把一条空信封发出去让对面等超时
  if (!dispatchBridgeEvent(WEB_OFFICE_BRIDGE_RESPONSE_EVENT, response)) fail(id, 'value-not-serialisable');
}

function fail(id: number, reason: string): void {
  const response: WebOfficeBridgeResponse = { channel: WEB_OFFICE_BRIDGE_CHANNEL, id, ok: false, reason };
  dispatchBridgeEvent(WEB_OFFICE_BRIDGE_RESPONSE_EVENT, response);
}

function onBridgeMessage(event: Event): void {
  const payload = readBridgeEvent(event);
  if (!isWebOfficeBridgeRequest(payload)) {
    // 信封对得上（channel + id）却没过内容校验，绝大多数就是被只读白名单挡下的方法名。
    // 静默丢弃会让对面干等一整个超时，末了还只能报「没人应答」——那句话既慢又指错方向。
    // 与 ccs-ai-assistant 的同名文件在此处分叉：那边唯一的发送方是它自己的 relay，
    // 而这条链路上方法名是页面经 SW 传进来的，挡下来的请求必须当场说清楚。
    const envelope = payload as { channel?: unknown; id?: unknown } | undefined;
    if (envelope && envelope.channel === WEB_OFFICE_BRIDGE_CHANNEL && typeof envelope.id === 'number') {
      fail(envelope.id, 'request-not-allowed: unknown kind or method outside the read-only whitelist');
    }
    return;
  }
  const request = payload;
  try {
    if (request.kind === 'enumerate') {
      // 没有定时器，所以每次有人来问就再看一眼（FR-11.1a）
      scan();
      reply(request.id, liveRecords().map(summarize));
      return;
    }
    if (request.kind === 'take-frame-pdf') {
      const bytes = takeSniffedPdf();
      reply(request.id, bytes === undefined ? undefined : Array.from(bytes));
      return;
    }
    // 直链是**这一帧**的事，与本帧有没有实例无关：实测里链接在宿主帧、实例在 office 帧
    if (request.kind === 'take-linked-pdf') {
      void takeLinkedPdf().then(
        (bytes) => reply(request.id, bytes === undefined ? undefined : Array.from(bytes)),
        // 直链里带着 requestkey，异常消息可能把它捎出去；一律当作没取到
        () => reply(request.id, undefined)
      );
      return;
    }
    if (request.kind === 'take-linked-presentation') {
      void takeLinkedPresentation().then(
        (bytes) => reply(request.id, bytes === undefined ? undefined : Array.from(bytes)),
        () => reply(request.id, undefined)
      );
      return;
    }
    const record = findRecord(request.localId);
    if (record === undefined) {
      fail(request.id, 'no-instance');
      return;
    }
    if (request.kind === 'describe') {
      reply(request.id, describe(record));
      return;
    }
    if (request.kind === 'scroll') {
      reply(request.id, scrollOnce());
      return;
    }
    if (request.kind === 'take-pdf') {
      reply(request.id, frameIndexOf(record));
      return;
    }
    if (record.state !== 'ready') {
      fail(request.id, 'not-ready');
      return;
    }
    const adapter = resolveAdapter(record, request.method);
    if (adapter === undefined) {
      fail(request.id, `capability-absent:${request.method}`);
      return;
    }
    void adapter.invoke(record, request.args).then(
      (result) => reply(request.id, result),
      (error: unknown) => fail(request.id, error instanceof Error ? error.message : String(error))
    );
  } catch (error) {
    fail(request.id, error instanceof Error ? error.message : String(error));
  }
}

/** 视觉通道用：往下滚一屏，回报滚动位置。截屏本身在扩展侧做，这里只负责挪位置 */
function scrollOnce(): { scrollTop: number; viewportHeight: number; done: boolean } {
  const doc = document.scrollingElement ?? document.documentElement;
  const viewportHeight = window.innerHeight;
  const before = doc.scrollTop;
  // 留一点重叠：整屏跳会把跨屏的一行内容切掉，重叠的那条由上层如实说明而不是裁掉
  window.scrollBy(0, viewportHeight - 200);
  const after = doc.scrollTop;
  return { scrollTop: after, viewportHeight, done: after === before };
}

/**
 * 本实例的文档 iframe 在 `window.frames` 里的序号——PDF 字节的全部归属依据（DV-18）。
 *
 * 字节留在子帧自己手里，谁都不往这个窗口发消息：这一帧住着 WPS SDK，
 * 它收到**任何**一条 message 都会把自己的应答队列推错位，连一条握手也不行
 * （DV-17 记的实测；握手那条同样致命，见 DV-18）。所以改成报坐标：
 * 宿主拿着序号把取件请求直接投到那一帧去。
 *
 * 对不上就返回 `undefined`：上层降级到视觉通道，而不是拿另一份文档的字节充数。
 */
function frameIndexOf(record: InstanceRecord): number | undefined {
  // 收养来的实例与字节住同一帧：报本帧的序号，而不是去找一个它根本没有的子 iframe
  if (record.iframeId === undefined) return frameIndexInTop();
  const frame = document.getElementById(record.iframeId) as HTMLIFrameElement | null;
  const target = frame?.contentWindow ?? null;
  if (target === null) return undefined;
  for (let index = 0; index < window.length; index += 1) {
    if (window[index] === target) return index;
  }
  return undefined;
}

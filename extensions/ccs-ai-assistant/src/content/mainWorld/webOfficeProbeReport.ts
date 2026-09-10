/**
 * 前置探明脚本（0.21.0 分册 12 FR-12.5a / AC-12.11，DV-8 定的第一个可交付物）。
 *
 * 它要回答的四件事都只有**真的 WPS 页面**答得了：描述符里 PDF 暴露了哪些方法、
 * iframe 内的请求下载的是不是完整 PDF、若不是则下发的是什么、分页是不是虚拟滚动。
 * 所以这里给的是一份可复跑的脚本，而不是一段 DevTools 里手敲的代码——
 * 结论要带日期与手段回写需求文档，手敲出来的下次没人能复现。
 *
 * ## 只出键名，不出内容
 *
 * 报告里只有方法名、路径名、字节数、节点计数这类**结构信息**。
 * 文档正文一个字都不进报告，URL 的查询串整条丢掉（WPS 的 token 就在那里）。
 *
 * ## 不进生产产物
 *
 * 整个模块挂在 `__WEBSKILL_WEBOFFICE_PROBE__` 之下，默认 `false`，
 * 由 `vite.probe.config.ts` 的 `define` 注入。生产构建里这个分支被消除，
 * 模块连同 `PROBE_MARK` 一起不会出现在 `dist/probe.js`——
 * 由仓库根 `test/webOfficeProbe.test.ts` 双向守着。
 *
 * ## 怎么跑
 *
 * ```bash
 * WEBSKILL_WEBOFFICE_PROBE=1 pnpm -C examples/browser-extension build:src
 * ```
 * 加载 `dist/` → 打开真实 WPS 文档页 → 在**页面**的控制台里：
 * ```js
 * copy(JSON.stringify(window.__webskillWebOfficeProbe(), null, 2))
 * ```
 * 把输出连同 `capturedAt` 填进 12-req 的 FR-12.5a 表与 14-req §4 的第 3、7 两行。
 */

import type { WebOfficeInstanceSummary } from '../../shared/webOfficeBridge';
import { probeRecords } from './webOfficeHook';

/** 产物里搜这一串即可判定探明代码有没有漏进生产构建 */
export const PROBE_MARK = 'webskill:weboffice-probe';

/** 向下枚举几层。API 候选路径最深是 `Application.X.Y`，多走一层留余地 */
const MAX_DEPTH = 3;

interface RequestNote {
  /** 只留 pathname：查询串里有 WPS 的 token */
  path: string;
  contentType: string | null;
  bytes: number;
  /** 前 5 个字节的可打印形态，用来判断到底下发的是什么 */
  magic: string;
  /** 尾部是否有 `%%EOF`——完整 PDF 与「只下发了一段」的分界 */
  looksComplete: boolean;
}

export interface MemberNote {
  /** 相对实例的点路径，例如 `Application.ActiveDocument` */
  path: string;
  /** 从属性描述符读出来的形态：读 getter 的值可能触发真实调用，探明不干那事 */
  kind: 'getter' | 'function' | 'object' | 'value';
}

export interface WebOfficeProbeReport {
  mark: typeof PROBE_MARK;
  /** ISO 日期，直接填进需求文档的「日期」列 */
  capturedAt: string;
  frame: 'top' | 'child';
  instances: ReadonlyArray<WebOfficeInstanceSummary & { members: readonly MemberNote[] }>;
  requests: readonly RequestNote[];
  /** 分页渲染的结构快照，用来判断离屏页有没有被渲染 */
  paging: { canvases: number; canvasesInViewport: number; scrollHeight: number; viewportHeight: number };
}

const notes: RequestNote[] = [];

const printable = (bytes: Uint8Array): string =>
  [...bytes.slice(0, 5)].map((b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : `\\x${b.toString(16)}`)).join('');

function note(url: string, contentType: string | null, bytes: Uint8Array): void {
  let path: string;
  try {
    path = new URL(url, location.href).pathname;
  } catch {
    path = '<unparseable>';
  }
  const tail = new TextDecoder().decode(bytes.slice(-1024));
  notes.push({
    path,
    contentType,
    bytes: bytes.byteLength,
    magic: printable(bytes),
    looksComplete: tail.includes('%%EOF')
  });
}

/** 观察本帧的请求。与嗅探器分开写：那一条是生产逻辑，只认 PDF；这一条要看**全部**下发内容 */
function observeRequests(): void {
  const nativeFetch = window.fetch;
  if (typeof nativeFetch === 'function') {
    window.fetch = function observedFetch(this: unknown, ...args: Parameters<typeof fetch>): Promise<Response> {
      const promise = nativeFetch.apply(this ?? window, args) as Promise<Response>;
      return promise.then((response) => {
        void response
          .clone()
          .arrayBuffer()
          .then((buffer) => {
            note(response.url, response.headers.get('content-type'), new Uint8Array(buffer));
          })
          .catch(() => undefined);
        return response;
      });
    } as typeof fetch;
  }

  const nativeOpen = XMLHttpRequest.prototype.open;
  const nativeSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function observedOpen(
    this: XMLHttpRequest & { __probeUrl?: string },
    method: string,
    url: string | URL,
    ...rest: unknown[]
  ): void {
    this.__probeUrl = String(url);
    (nativeOpen as unknown as (...a: unknown[]) => void).call(this, method, url, ...rest);
  } as typeof XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.send = function observedSend(
    this: XMLHttpRequest & { __probeUrl?: string },
    body?: Parameters<XMLHttpRequest['send']>[0]
  ): void {
    this.addEventListener('load', () => {
      try {
        const response: unknown = this.response;
        if (response instanceof ArrayBuffer) {
          note(this.__probeUrl ?? '', this.getResponseHeader('content-type'), new Uint8Array(response));
        }
      } catch {
        // 跨源 XHR 读不到响应；记不到就算了
      }
    });
    nativeSend.call(this, body ?? null);
  };
}

/**
 * 逐层记下成员的**名字与描述符形态**。
 *
 * 不走桥的 `describe`：那一条只回白名单里解析得到的方法，
 * 而探明要问的恰恰是「白名单之外还有什么」——用它探明等于拿答案对答案。
 *
 * 一律用 `getOwnPropertyDescriptor` 判形态，不读值：真实 API 是动态 Proxy，
 * 读一个 getter 就是一次跨源往返，甚至可能改到文档状态。
 */
export function probeMembers(root: unknown): readonly MemberNote[] {
  const out: MemberNote[] = [];
  const seen = new Set<unknown>();
  const walk = (node: unknown, path: string, depth: number): void => {
    if (depth > MAX_DEPTH || node === null || (typeof node !== 'object' && typeof node !== 'function')) return;
    if (seen.has(node)) return;
    seen.add(node);
    // 自有键 + 原型链上的键：SDK 的方法常挂在原型上
    for (const holder of [node, Object.getPrototypeOf(node)]) {
      if (holder === null || holder === Object.prototype) continue;
      let names: string[];
      try {
        names = Object.getOwnPropertyNames(holder);
      } catch {
        continue;
      }
      for (const name of names) {
        if (name === 'constructor') continue;
        const child = `${path}.${name}`;
        if (out.some((m) => m.path === child)) continue;
        let descriptor: PropertyDescriptor | undefined;
        try {
          descriptor = Object.getOwnPropertyDescriptor(holder, name);
        } catch {
          continue;
        }
        if (descriptor === undefined) continue;
        if (descriptor.get !== undefined) {
          out.push({ path: child, kind: 'getter' });
          continue;
        }
        const value = descriptor.value as unknown;
        if (typeof value === 'function') {
          out.push({ path: child, kind: 'function' });
        } else if (typeof value === 'object' && value !== null) {
          out.push({ path: child, kind: 'object' });
          walk(value, child, depth + 1);
        } else {
          out.push({ path: child, kind: 'value' });
        }
      }
    }
  };
  walk(root, '', 1);
  return out;
}

function report(): WebOfficeProbeReport {
  const instances = probeRecords().map(({ summary, instance }) => ({ ...summary, members: probeMembers(instance) }));
  const canvases = [...document.querySelectorAll('canvas')];
  return {
    mark: PROBE_MARK,
    capturedAt: new Date().toISOString(),
    frame: window.top === window ? 'top' : 'child',
    instances,
    requests: notes,
    paging: {
      canvases: canvases.length,
      canvasesInViewport: canvases.filter((c) => {
        const box = c.getBoundingClientRect();
        return box.bottom > 0 && box.top < window.innerHeight;
      }).length,
      scrollHeight: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight
    }
  };
}

export function installWebOfficeProbeReport(): void {
  observeRequests();
  Object.defineProperty(window, '__webskillWebOfficeProbe', { configurable: true, value: report });
}

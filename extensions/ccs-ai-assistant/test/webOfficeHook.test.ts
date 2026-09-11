// @vitest-environment jsdom
/**
 * MAIN world 挂钩的失败路径（0.21.0 分册 14 FR-14.3）。
 *
 * FR-14.3 的十一条变体里，有六条只关乎挂钩本身——页面上没有 SDK、晚注入、
 * 页面反过来覆盖我们、一页两个实例、同一 iframe 二次 init、伪造的 postMessage。
 * 它们不需要真浏览器，因此按 AC-G12a 的归层留在 CI 单测里，
 * 而不是压在那套不进 CI 的扩展 e2e 上。
 *
 * 用例一律**从页面的角度**驱动：给 `window.WebOfficeSDK` 赋值、调 `init`、
 * 发 postMessage。直接调内部函数验不出「页面察觉不到我们在」这件事。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dispatchBridgeEvent, readBridgeEvent } from '../src/shared/domBridge';
import {
  WEB_OFFICE_BRIDGE_CHANNEL,
  WEB_OFFICE_BRIDGE_REQUEST_EVENT,
  WEB_OFFICE_BRIDGE_RESPONSE_EVENT,
  WEB_OFFICE_OFFICE_TYPE_MIRROR,
  type WebOfficeBridgePayload,
  type WebOfficeInstanceSummary
} from '../src/shared/webOfficeBridge';

/** 每个用例一份新的模块状态；装上去的监听器在 afterEach 全部毁掉 */
const installed: Array<[EventTarget, string, EventListenerOrEventListenerObject]> = [];

async function install(): Promise<void> {
  vi.resetModules();
  const nativeWindow = window.addEventListener.bind(window);
  const nativeDocument = document.addEventListener.bind(document);
  window.addEventListener = ((type: string, handler: EventListenerOrEventListenerObject, options?: unknown) => {
    installed.push([window, type, handler]);
    nativeWindow(type, handler as EventListener, options as AddEventListenerOptions);
  }) as typeof window.addEventListener;
  document.addEventListener = ((type: string, handler: EventListenerOrEventListenerObject, options?: unknown) => {
    installed.push([document, type, handler]);
    nativeDocument(type, handler as EventListener, options as AddEventListenerOptions);
  }) as typeof document.addEventListener;
  const { installWebOfficeHook } = await import('../src/content/mainWorld/webOfficeHook');
  installWebOfficeHook();
  window.addEventListener = nativeWindow as typeof window.addEventListener;
  document.addEventListener = nativeDocument as typeof document.addEventListener;
}

let nextId = 1;

/**
 * 走真通道问一句。
 *
 * 通道是 `document` 上的 `CustomEvent` 而不是 `window.postMessage`：实测下，
 * 往承载 WPS SDK 的窗口投任何一条 message，它之后的取值就全部挂死（DV-17）。
 */
function ask(payload: WebOfficeBridgePayload): Promise<{ ok: boolean; value?: unknown; reason?: string }> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      document.removeEventListener(WEB_OFFICE_BRIDGE_RESPONSE_EVENT, onResponse);
      reject(new Error('no reply'));
    }, 500);
    const onResponse = (event: Event): void => {
      const data = readBridgeEvent(event) as { channel?: unknown; id?: unknown; ok?: unknown };
      if (data?.channel !== WEB_OFFICE_BRIDGE_CHANNEL || data.id !== id || data.ok === undefined) return;
      clearTimeout(timer);
      document.removeEventListener(WEB_OFFICE_BRIDGE_RESPONSE_EVENT, onResponse);
      resolve(data as { ok: boolean });
    };
    document.addEventListener(WEB_OFFICE_BRIDGE_RESPONSE_EVENT, onResponse);
    dispatchBridgeEvent(WEB_OFFICE_BRIDGE_REQUEST_EVENT, { channel: WEB_OFFICE_BRIDGE_CHANNEL, id, ...payload });
  });
}

const enumerate = async (): Promise<WebOfficeInstanceSummary[]> =>
  ((await ask({ kind: 'enumerate' })).value ?? []) as WebOfficeInstanceSummary[];

interface FakeOptions {
  officeType?: string;
  /** 伪 SDK 的枚举；给别的值就是「不是我们验证过的那一版」 */
  officeTypes?: Record<string, string>;
  /** 挂在 `Application.ActiveDocument` 下的对象树；层级照真实 WPS（`Content.Text` 之类） */
  document?: Record<string, unknown>;
}

/**
 * 一个只做到「够被挂钩认出来」的假 SDK。它不是 fixture，只是页面那一侧的最小形状。
 *
 * 返回**函数**而不是对象：真实 UMD 包导出的是带静态 `init` / `OfficeType` / `version`
 * 的类。这一点被写错过，代价是真实站点上挂钩静默不生效而全套用例照绿（DV-16）。
 */
function fakeSdk(options: FakeOptions = {}): Record<string, unknown> & ((...args: unknown[]) => unknown) {
  const officeType = options.officeTypes ?? { ...WEB_OFFICE_OFFICE_TYPE_MIRROR };
  function WebOfficeSdk(this: unknown): void {
    // 页面不 new 它；存在只是为了让 typeof 与真实包一致
  }
  const sdk = WebOfficeSdk as unknown as Record<string, unknown> & ((...args: unknown[]) => unknown);
  sdk['OfficeType'] = officeType;
  sdk['version'] = '2.0.5';
  sdk['init'] = (params: { officeType?: string; fileId?: string }): Record<string, unknown> => {
    const frame = document.createElement('iframe');
    frame.className = 'web-office-iframe';
    frame.id = `office-iframe-${document.querySelectorAll('iframe').length + 1}`;
    document.body.appendChild(frame);
    const listeners: Array<() => void> = [];
    const application: Record<string, unknown> = {
      ActiveDocument: { ...(options.document ?? {}) }
    };
    return {
      Application: application,
      ApiEvent: {
        AddApiEventListener: (_name: string, handler: () => void) => listeners.push(handler),
        RemoveApiEventListener: () => undefined
      },
      /** 页面调 init 时还没就绪；用例显式触发 */
      __fireReady: () => {
        for (const handler of listeners) handler();
      },
      __params: params
    };
  };
  return sdk;
}

beforeEach(() => {
  document.body.innerHTML = '';
  Reflect.deleteProperty(window, 'WebOfficeSDK');
  Reflect.deleteProperty(window, 'WPSOpenApi');
  Reflect.deleteProperty(window, 'officeType');
  for (const name of ['OpenSDK', 'WPS', 'litePreviewSDK']) Reflect.deleteProperty(window, name);
});

afterEach(() => {
  for (const [target, type, handler] of installed.splice(0)) target.removeEventListener(type, handler);
  Reflect.deleteProperty(window, 'WebOfficeSDK');
  Reflect.deleteProperty(window, 'WPSOpenApi');
  Reflect.deleteProperty(window, 'officeType');
  for (const name of ['OpenSDK', 'WPS', 'litePreviewSDK']) Reflect.deleteProperty(window, name);
  vi.doUnmock('../src/content/mainWorld/webOfficePdfSniffer');
});

/**
 * 页面把 UMD 包挂上全局。
 *
 * 真实页面是 `<script src="…jssdk.js">` 在**解析期**做这件事，`init()` 才等到
 * `window.onload`（分册 11 §1.1）；挂钩正是在两者之间的 `DOMContentLoaded` 上
 * 扫描到它的。所以赋值之后必须把那一拍走完，否则测的是一个真实页面里不存在的时序。
 * 我们不再预先占住这个属性——占住会让 `try { WebOfficeSDK } catch` 走错分支，
 * 真实站点上足以让整份文档打不开（AC-11.1a）。
 */
function pageLoadsSdk<T>(sdk: T): T {
  (window as unknown as Record<string, unknown>)['WebOfficeSDK'] = sdk;
  document.dispatchEvent(new Event('DOMContentLoaded'));
  return sdk;
}

describe('页面上没有 WebOffice（AC-11.1 / AC-G5）', () => {
  it('页面赋值之前 `typeof window.WebOfficeSDK` 仍是 undefined，不是「存在但为空」', async () => {
    await install();

    expect(typeof window.WebOfficeSDK).toBe('undefined');
    expect((window as unknown as Record<string, unknown>)['WebOfficeSDK']).toBeUndefined();
  });

  it('没有实例时枚举回空表，而不是报错', async () => {
    await install();

    await expect(enumerate()).resolves.toEqual([]);
  });
});

describe('页面察觉不到这个名字被动过（AC-11.1a）', () => {
  /**
   * 早先这里装的是占位 getter/setter。`typeof` 确实还是 `'undefined'`，
   * 但 `'WebOfficeSDK' in window` 变成了 true，裸标识符也不再抛 ReferenceError——
   * 于是 `try { o = WebOfficeSDK } catch { o = 内置SDK }` 这种特性探测走进了 try 分支，
   * 拿到 `undefined` 之后 `new o.config(...)` 直接抛，客户站点上整份 PDF 打不开。
   */
  it('装钩之后这个名字仍然是「未声明」，三个观察面逐字不变', async () => {
    await install();

    expect('WebOfficeSDK' in window).toBe(false);
    expect(Object.getOwnPropertyDescriptor(window, 'WebOfficeSDK')).toBeUndefined();
    expect(() => new Function('return WebOfficeSDK')()).toThrow(ReferenceError);
  });

  it('页面赋值之后才存在，且是页面自己那次赋值造成的', async () => {
    await install();
    pageLoadsSdk(fakeSdk());

    expect('WebOfficeSDK' in window).toBe(true);
    expect(typeof window.WebOfficeSDK).toBe('function');
  });
});

describe('全局的宿主形状（DV-16 回归）', () => {
  it('SDK 是带静态 init 的函数时照样挂得上——真实 UMD 包就是这个形状', async () => {
    await install();
    const sdk = fakeSdk();
    expect(typeof sdk).toBe('function');

    pageLoadsSdk(sdk);
    (window.WebOfficeSDK as { init(p: unknown): unknown }).init({ officeType: 'f', fileId: 'pdf' });

    const records = await enumerate();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ officeType: 'f', fileId: 'pdf' });
  });

  it('包过之后 typeof 仍是 function，页面自检看不出差别', async () => {
    await install();
    pageLoadsSdk(fakeSdk());

    expect(typeof window.WebOfficeSDK).toBe('function');
    expect((window.WebOfficeSDK as { version?: unknown }).version).toBe('2.0.5');
  });
});

describe('注入时机（AC-11.2）', () => {
  it('SDK 在 load 之后才出现也挂得上——下一次枚举会重新扫一遍', async () => {
    await install();
    window.dispatchEvent(new Event('load'));

    (window as unknown as Record<string, unknown>)['WebOfficeSDK'] = fakeSdk();
    // 面板打开时的那次枚举本身就是一个扫描点（FR-11.1a）
    await expect(enumerate()).resolves.toEqual([]);
    (window.WebOfficeSDK as { init(p: unknown): unknown }).init({ officeType: 'w', fileId: 'f1' });

    const records = await enumerate();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ officeType: 'w', fileId: 'f1', state: 'initialising' });
  });
});

/** open-jssdk 那一支：工厂叫 `config`，返回 Promise，参数里没有 officeType */
function fakeOpenJssdk(): { config: (p: unknown) => Promise<Record<string, unknown>> } {
  return {
    config: (_params: unknown) =>
      Promise.resolve({
        ready: () => Promise.resolve(),
        Application: {},
        ApiEvent: { AddApiEventListener: () => undefined, RemoveApiEventListener: () => undefined }
      })
  };
}

describe('open-jssdk 的 config 工厂（FR-11.1e）', () => {
  it('OpenSDK.config 造出来的实例也挂得上，类型与 id 从 url 里取', async () => {
    // 实测：`config({url, mount, refreshToken})` 参数里既没有 officeType 也没有 fileId
    await install();
    (window as unknown as Record<string, unknown>)['OpenSDK'] = fakeOpenJssdk();
    document.dispatchEvent(new Event('DOMContentLoaded'));

    const sdk = window.OpenSDK as { config(p: unknown): Promise<unknown> };
    await sdk.config({ url: 'https://wps.test/wpsview/weboffice/office/f/doc-hash?_w_tokentype=1' });

    const records = await enumerate();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ officeType: 'f', fileId: 'doc-hash', viaMount: true });
  });

  it('页面 await 到的还是它自己那个 Promise，我们不换掉返回值', async () => {
    await install();
    const original = fakeOpenJssdk();
    const promise = Promise.resolve({ ready: () => Promise.resolve(), Application: {} });
    original.config = () => promise;
    (window as unknown as Record<string, unknown>)['OpenSDK'] = original;
    document.dispatchEvent(new Event('DOMContentLoaded'));

    const returned = (window.OpenSDK as { config(p: unknown): unknown }).config({ url: '' });

    expect(returned).toBe(promise);
  });

  it('WPS 与 litePreviewSDK 是另外两个对象，各自独立挂', async () => {
    // 实测三个全局名互不相等、各有各的 config，只挂其中一个会漏掉用另外两个名字的页面
    await install();
    (window as unknown as Record<string, unknown>)['WPS'] = fakeOpenJssdk();
    (window as unknown as Record<string, unknown>)['litePreviewSDK'] = fakeOpenJssdk();
    document.dispatchEvent(new Event('DOMContentLoaded'));

    await (window.WPS as { config(p: unknown): Promise<unknown> }).config({ url: '/office/w/a' });
    await (window.litePreviewSDK as { config(p: unknown): Promise<unknown> }).config({ url: '/office/s/b' });

    const records = await enumerate();
    expect(records.map((record) => record.officeType)).toEqual(['w', 's']);
  });

  it('config 不是函数的同名全局不碰：`{config}` 这种形状太弱，撑不起指纹', async () => {
    await install();
    const decoy = { config: 'not a function' };
    (window as unknown as Record<string, unknown>)['OpenSDK'] = decoy;
    document.dispatchEvent(new Event('DOMContentLoaded'));

    expect(window.OpenSDK).toBe(decoy);
    await expect(enumerate()).resolves.toEqual([]);
  });

  it('config 抛出 / Promise 拒绝时不记一条空实例', async () => {
    await install();
    const sdk = { config: () => Promise.reject(new Error('token expired')) };
    (window as unknown as Record<string, unknown>)['OpenSDK'] = sdk;
    document.dispatchEvent(new Event('DOMContentLoaded'));

    await expect((window.OpenSDK as { config(p: unknown): Promise<unknown> }).config({ url: '' })).rejects.toThrow();

    await expect(enumerate()).resolves.toEqual([]);
  });
});

describe('透传等价（AC-11.3）', () => {
  it('包过的 init 保留原函数身上的属性，且每次读到的是同一个函数', async () => {
    await install();
    const sdk = fakeSdk();
    // 真实 UMD 包把枚举同时挂在 SDK 对象与 init 函数上，页面两处都读得到
    Object.defineProperty(sdk['init'], 'OfficeType', { enumerable: true, value: sdk['OfficeType'] });
    pageLoadsSdk(sdk);

    const wrapped = window.WebOfficeSDK as { init: { (p: unknown): unknown; OfficeType?: Record<string, string> } };
    expect(wrapped.init.OfficeType).toBe(sdk['OfficeType']);
    expect(wrapped.init).toBe((window.WebOfficeSDK as { init: unknown }).init);
  });

  it('入参对象与返回值都原样穿过，不复制也不包装', async () => {
    await install();
    pageLoadsSdk(fakeSdk());
    const sdk = window.WebOfficeSDK as { init(p: unknown): { __params: unknown } };

    const params = { officeType: 'w', fileId: 'f1' };
    const instance = sdk.init(params);

    expect(instance.__params).toBe(params);
  });
});

describe('页面反过来覆盖我们（AC-11.4）', () => {
  it('页面把属性重新定义掉之后我们退场，不抛错也不再登记', async () => {
    await install();
    const sdk = fakeSdk();

    Object.defineProperty(window, 'WebOfficeSDK', { configurable: true, writable: true, value: sdk });
    (window.WebOfficeSDK as { init(p: unknown): unknown }).init({ officeType: 'w' });

    // 页面比我们更有权处置自己的全局：拿到的就是它自己的对象，没有代理
    expect(window.WebOfficeSDK).toBe(sdk);
    await expect(enumerate()).resolves.toEqual([]);
  });
});

describe('收养页面自己建好的实例（AC-11.11 / FR-11.1d）', () => {
  /**
   * 真实部署里 SDK 被打包进 WPS 自家阅读器，宿主页上没有 `WebOfficeSDK` 这个全局，
   * 实例只在最内层 office 帧上露成 `window.WPSOpenApi`。它是 `init` 的产物，
   * 身上没有 `init`，也没有 `OfficeType` 枚举——只能靠 `ready` + `ApiEvent` 认。
   *
   * 形状照客户站点 PDF 帧实测（需求 §1.7）：刚加载完时身上只有 `ready` / `ApiEvent`，
   * `Application` 要等 `ready()` 兑现之后才被挂上去。
   */
  function fakeOpenApi(text: string): Record<string, unknown> {
    const listeners: Array<() => void> = [];
    let open = (): void => undefined;
    const opened = new Promise<void>((resolve) => {
      open = resolve;
    });
    const api: Record<string, unknown> = {
      ApiEvent: {
        AddApiEventListener: (_name: string, handler: () => void) => listeners.push(handler),
        RemoveApiEventListener: () => undefined
      },
      ready: () => opened.then(() => api),
      /** 只放事件，不造 `Application`：模拟 `api.ready` 先于文档真正可用到达 */
      __fireReady: () => {
        for (const handler of listeners) handler();
      },
      /** 文档真正可用：`Application` 这时才出现，`ready()` 随之兑现 */
      __openDocument: () => {
        api['Application'] = { ActiveDocument: { Content: { Text: text } } };
        open();
      }
    };
    return api;
  }

  it('页面上只有 WPSOpenApi 时也能枚举到，类型取自本帧的标记', async () => {
    await install();
    (window as unknown as Record<string, unknown>)['officeType'] = 'w';
    (window as unknown as Record<string, unknown>)['WPSOpenApi'] = fakeOpenApi('hello');

    const records = await enumerate();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ officeType: 'w', state: 'initialising' });
  });

  it('Application 还没被创建也照样收养——它要等 ready() 兑现（真实 PDF 帧实测）', async () => {
    await install();
    (window as unknown as Record<string, unknown>)['officeType'] = 'f';
    const api = fakeOpenApi('hello');
    (window as unknown as Record<string, unknown>)['WPSOpenApi'] = api;

    // 收养的这一刻它身上确实没有 Application：拿它当识别面就会把 PDF 整个挡在外面
    expect('Application' in api).toBe(false);
    await expect(enumerate()).resolves.toHaveLength(1);
  });

  it('就绪事件先于 Application 到达时不算就绪：否则能力探测会得出一个能力都没有', async () => {
    await install();
    (window as unknown as Record<string, unknown>)['officeType'] = 'w';
    const api = fakeOpenApi('hello');
    (window as unknown as Record<string, unknown>)['WPSOpenApi'] = api;
    const [before] = await enumerate();
    (api['__fireReady'] as () => void)();

    const [record] = await enumerate();
    expect(record?.state).toBe('initialising');
    const described = await ask({ kind: 'describe', localId: before!.localId });
    expect(described).toMatchObject({ ok: true, value: [] });
  });

  it('就绪信号早到而 Application 晚到时，下一次枚举会补看一眼，不会永远卡在 initialising', async () => {
    await install();
    (window as unknown as Record<string, unknown>)['officeType'] = 'w';
    const api = fakeOpenApi('hello');
    (window as unknown as Record<string, unknown>)['WPSOpenApi'] = api;
    await enumerate();

    // 信号先到：此刻 Application 还不在，按上一条用例的口径不能宣布就绪
    (api['__fireReady'] as () => void)();
    expect((await enumerate())[0]?.state).toBe('initialising');

    // Application 随后出现，但**没有第二次信号**——就绪事件是一次性的。
    // 症状就是用户说的「同一份 PDF 有时读得了、有时说还在加载」
    (api['__openDocument'] as () => void)();

    const [record] = await enumerate();
    expect(record?.state).toBe('ready');
    const result = await ask({ kind: 'call', localId: record!.localId, method: 'GetDocumentText', args: [] });
    expect(result).toMatchObject({ ok: true, value: 'hello' });
  });

  it('Application 出现之后状态才变 ready，读得到真内容', async () => {
    await install();
    (window as unknown as Record<string, unknown>)['officeType'] = 'w';
    const api = fakeOpenApi('hello');
    (window as unknown as Record<string, unknown>)['WPSOpenApi'] = api;
    await enumerate();
    (api['__openDocument'] as () => void)();
    await (api['ready'] as () => Promise<unknown>)();

    const [record] = await enumerate();
    expect(record?.state).toBe('ready');
    const result = await ask({ kind: 'call', localId: record!.localId, method: 'GetDocumentText', args: [] });
    expect(result).toMatchObject({ ok: true, value: 'hello' });
  });

  it('收养的是实例本人，不包代理——它身上没有 init 可拦，包一层只多一处破绽', async () => {
    await install();
    (window as unknown as Record<string, unknown>)['officeType'] = 'w';
    const api = fakeOpenApi('hello');
    (window as unknown as Record<string, unknown>)['WPSOpenApi'] = api;

    await enumerate();

    expect(window.WPSOpenApi).toBe(api);
  });

  it('扫两遍只登记一条，面板反复开合不会把同一份文档记成好几份', async () => {
    await install();
    (window as unknown as Record<string, unknown>)['officeType'] = 's';
    (window as unknown as Record<string, unknown>)['WPSOpenApi'] = fakeOpenApi('x');

    await enumerate();
    document.dispatchEvent(new Event('DOMContentLoaded'));
    window.dispatchEvent(new Event('load'));

    await expect(enumerate()).resolves.toHaveLength(1);
  });

  it('没有 ready / ApiEvent 的对象不算实例：那只是同名的别的东西', async () => {
    await install();
    (window as unknown as Record<string, unknown>)['WPSOpenApi'] = { version: '1.0' };

    await expect(enumerate()).resolves.toEqual([]);
  });
});

describe('多实例（AC-11.5 / AC-12.9）', () => {
  it('一页两个文档登记成两条，句柄互不相同', async () => {
    await install();
    pageLoadsSdk(fakeSdk());
    const sdk = window.WebOfficeSDK as { init(p: unknown): { __fireReady(): void } };

    sdk.init({ officeType: 'w', fileId: 'a' }).__fireReady();
    sdk.init({ officeType: 's', fileId: 'b' }).__fireReady();

    const records = await enumerate();
    expect(records.map((r) => r.fileId)).toEqual(['a', 'b']);
    expect(new Set(records.map((r) => r.localId)).size).toBe(2);
  });

  it('同一个 iframe 不会被两条记录同时认领', async () => {
    await install();
    pageLoadsSdk(fakeSdk());
    const sdk = window.WebOfficeSDK as { init(p: unknown): { __fireReady(): void } };

    const first = sdk.init({ officeType: 'w', fileId: 'a' });
    // 第二次 init 之前先把 iframe 摘掉一个：真实页面二次 init 会复用容器
    document.querySelectorAll('iframe')[1]?.remove();
    const second = sdk.init({ officeType: 'w', fileId: 'a' });
    first.__fireReady();
    second.__fireReady();

    const claimed = (await enumerate()).map((r) => r.iframeId).filter((id): id is string => id !== undefined);
    expect(new Set(claimed).size).toBe(claimed.length);
  });
});

describe('伪造的身份进不来（AC-13.3 / FR-11.3a）', () => {
  it('页面自称的 instanceId 不进登记表，句柄由我们编号', async () => {
    await install();
    pageLoadsSdk(fakeSdk());
    const sdk = window.WebOfficeSDK as { init(p: unknown): unknown };

    sdk.init({ officeType: 'w', fileId: 'f', instanceId: 'admin', appId: 'trusted' });

    const [record] = await enumerate();
    expect(record?.localId).not.toContain('admin');
    expect(JSON.stringify(record)).not.toContain('trusted');
    // 授权用的 handle 不在这一侧，MAIN world 拿不到它（FR-11.3a）
    expect(record).not.toHaveProperty('handle');
  });
});

describe('版本指纹（AC-11.8）', () => {
  it('枚举值对不上就不挂钩：页面拿到的是它自己的对象', async () => {
    await install();
    const v1 = fakeSdk({ officeTypes: { Spreadsheet: 'excel', Writer: 'word' } });

    pageLoadsSdk(v1);
    (window.WebOfficeSDK as { init(p: unknown): unknown }).init({ officeType: 'w' });

    expect(window.WebOfficeSDK).toBe(v1);
    await expect(enumerate()).resolves.toEqual([]);
  });

  it('多出新类型仍然挂钩：WPS 加一种类型不该让整条能力失效', async () => {
    await install();
    pageLoadsSdk(fakeSdk({ officeTypes: { ...WEB_OFFICE_OFFICE_TYPE_MIRROR, Future: 'z' } }));
    (window.WebOfficeSDK as { init(p: unknown): unknown }).init({ officeType: 'w' });

    await expect(enumerate()).resolves.toHaveLength(1);
  });
});

describe('伪造的请求（AC-11.7）', () => {
  /** 只数**回应**事件 */
  function countReplies(): () => number {
    let replies = 0;
    const handler = (event: Event): void => {
      if ((readBridgeEvent(event) as { ok?: unknown } | null)?.ok !== undefined) replies += 1;
    };
    document.addEventListener(WEB_OFFICE_BRIDGE_RESPONSE_EVENT, handler);
    installed.push([document, WEB_OFFICE_BRIDGE_RESPONSE_EVENT, handler]);
    return () => replies;
  }

  it('不带 channel 常量的消息一个字都不回', async () => {
    await install();
    const replies = countReplies();

    dispatchBridgeEvent(WEB_OFFICE_BRIDGE_REQUEST_EVENT, { kind: 'enumerate', id: 999 });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(replies()).toBe(0);
  });

  it('写方法在入口就被挡掉，且当场回一条失败', async () => {
    await install();
    const replies = countReplies();
    let reason: unknown;
    const onResponse = (event: Event): void => {
      const data = readBridgeEvent(event) as { id?: unknown; reason?: unknown } | null;
      if (data?.id === 998) reason = data.reason;
    };
    document.addEventListener(WEB_OFFICE_BRIDGE_RESPONSE_EVENT, onResponse);
    installed.push([document, WEB_OFFICE_BRIDGE_RESPONSE_EVENT, onResponse]);

    dispatchBridgeEvent(WEB_OFFICE_BRIDGE_REQUEST_EVENT, {
      channel: WEB_OFFICE_BRIDGE_CHANNEL,
      id: 998,
      kind: 'call',
      method: 'SetDocumentText',
      args: []
    });
    await new Promise((resolve) => setTimeout(resolve, 20));

    // 挡下来了：方法没有被执行。但不能就此静默——对面只会干等一整个超时，
    // 末了报「没人应答」，那句话既慢又把排查引到通道故障上去
    expect(replies()).toBe(1);
    expect(reason).toContain('request-not-allowed');
  });

  it('老的 window.postMessage 通道已经不通了（DV-17）', async () => {
    await install();
    const replies = countReplies();

    // 桥搬离 message 事件正是这一版的修复本身：往承载 WPS SDK 的窗口投消息，
    // 会让它之后每一次取值都永不返回。这条用例守着「我们不再监听那条通道」。
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { channel: WEB_OFFICE_BRIDGE_CHANNEL, id: 997, kind: 'enumerate' },
        source: window
      })
    );
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(replies()).toBe(0);
  });

  it('一整轮问答期间不往窗口投任何一条消息（DV-17）', async () => {
    await install();
    const posted = vi.spyOn(window, 'postMessage');

    await expect(ask({ kind: 'enumerate' })).resolves.toMatchObject({ ok: true });

    expect(posted).not.toHaveBeenCalled();
    posted.mockRestore();
  });
});

describe('调用前的两道门', () => {
  it('还没就绪时报 not-ready，而不是读出半份内容', async () => {
    await install();
    pageLoadsSdk(fakeSdk({ document: { Content: { Text: 'hello' } } }));
    const sdk = window.WebOfficeSDK as { init(p: unknown): unknown };
    sdk.init({ officeType: 'w' });
    const [record] = await enumerate();

    const result = await ask({ kind: 'call', localId: record!.localId, method: 'GetDocumentText', args: [] });

    expect(result).toMatchObject({ ok: false, reason: 'not-ready' });
  });

  it('描述符里没有的方法归因为能力缺失，并点名是哪一个', async () => {
    await install();
    pageLoadsSdk(fakeSdk());
    const sdk = window.WebOfficeSDK as { init(p: unknown): { __fireReady(): void } };
    sdk.init({ officeType: 'w' }).__fireReady();
    const [record] = await enumerate();

    const result = await ask({ kind: 'call', localId: record!.localId, method: 'GetDocumentText', args: [] });

    expect(result).toMatchObject({ ok: false, reason: 'capability-absent:GetDocumentText' });
  });

  it('describe 只回真的解析得到的方法', async () => {
    await install();
    pageLoadsSdk(fakeSdk({ document: { Content: { Text: 'hello' } } }));
    const sdk = window.WebOfficeSDK as { init(p: unknown): { __fireReady(): void } };
    sdk.init({ officeType: 'w' }).__fireReady();
    const [record] = await enumerate();

    const result = await ask({ kind: 'describe', localId: record!.localId });

    expect(result.value).toEqual(['GetDocumentText']);
  });

  it('不存在的实例报 no-instance', async () => {
    await install();

    const result = await ask({ kind: 'call', localId: 'local-999', method: 'GetDocumentText', args: [] });

    expect(result).toMatchObject({ ok: false, reason: 'no-instance' });
  });
});

/**
 * 演示文稿的形状层（AC-12.16 / FR-12.4a-c）。
 *
 * 形状照 2026-09-09 客户站点实测：图片形状的 `HasTextFrame` 是 `false` 且
 * 在它上面碰 `TextFrame` 会抛错；备注页除备注框外还挂着一个取值为 `*` 的页码占位符；
 * 文本里的 `\u000B` 是一条要点内部的软换行。三样都不是假想，都曾经把结果读脏。
 */
describe('演示文稿逐形状取文本（AC-12.16）', () => {
  /** 一个只读的形状；`TextFrame` 用 getter 是为了让「碰它就抛」这件事可断言 */
  function shape(text: string | undefined): Record<string, unknown> {
    return {
      HasTextFrame: text !== undefined,
      get TextFrame(): unknown {
        if (text === undefined) throw new Error('shape has no text frame');
        return { TextRange: { Text: text } };
      }
    };
  }

  function shapes(list: Array<string | undefined>): Record<string, unknown> {
    const built = list.map(shape);
    return { Count: built.length, Item: (index: number) => built[index - 1] };
  }

  /** `Slides.Item` 是 1 基的；`notes` 为 undefined 表示这张压根没有备注页 */
  function fakePresentation(
    deck: Array<{ shapes: Array<string | undefined>; notes?: Array<string | undefined> }>
  ): Record<string, unknown> {
    const listeners: Array<() => void> = [];
    const slides = deck.map((slide) => ({
      Shapes: shapes(slide.shapes),
      ...(slide.notes === undefined ? {} : { NotesPage: { Shapes: shapes(slide.notes) } })
    }));
    return {
      Application: {
        ActivePresentation: {
          Slides: { Count: slides.length, Item: (index: number) => slides[index - 1] }
        }
      },
      ApiEvent: {
        AddApiEventListener: (_name: string, handler: () => void) => listeners.push(handler),
        RemoveApiEventListener: () => undefined
      },
      ready: () => Promise.resolve(undefined)
    };
  }

  async function adopt(
    deck: Array<{ shapes: Array<string | undefined>; notes?: Array<string | undefined> }>
  ): Promise<string> {
    await install();
    (window as unknown as Record<string, unknown>)['officeType'] = 'p';
    (window as unknown as Record<string, unknown>)['WPSOpenApi'] = fakePresentation(deck);
    // 第一次枚举只完成收养，`ready()` 要下一拍才兑现；照真实站点的时序走两拍
    await enumerate();
    const [record] = await enumerate();
    expect(record?.state).toBe('ready');
    return record!.localId;
  }

  const call = async (localId: string, method: string, args: unknown[] = []): Promise<unknown> => {
    const result = await ask({ kind: 'call', localId, method, args });
    expect(result, `${method} 应当成功`).toMatchObject({ ok: true });
    return result.value;
  };

  it('三个逻辑方法都从 ActivePresentation 下解析得到', async () => {
    const localId = await adopt([{ shapes: ['a'] }]);

    const described = await ask({ kind: 'describe', localId });

    expect(described.value).toEqual(['GetSlideCount', 'GetSlideBody', 'GetSlideNotes']);
  });

  it('正文按形状顺序取，图片形状跳过但仍计入总数', async () => {
    // 第二个形状是图片：`HasTextFrame` 为 false，碰 `TextFrame` 会抛错
    const localId = await adopt([{ shapes: ['第一段', undefined, '   ', '第二段'] }]);

    await expect(call(localId, 'GetSlideCount')).resolves.toBe(1);
    // shapeCount 是 4 而不是 2：FR-12.4c 的「有多少读不出来」靠这个分母
    await expect(call(localId, 'GetSlideBody', [0])).resolves.toEqual({
      texts: ['第一段', '第二段'],
      shapeCount: 4
    });
  });

  it('软换行转成换行而不是被删掉——否则两行黏成一个词', async () => {
    const localId = await adopt([{ shapes: ['强电产品线：\u000B汇报日期：\r'] }]);

    await expect(call(localId, 'GetSlideBody', [0])).resolves.toEqual({
      texts: ['强电产品线：\n汇报日期：'],
      shapeCount: 1
    });
  });

  it('备注读得到，页码占位符那条不算备注', async () => {
    // 备注页实测形状：① 幻灯片缩略图（无文本框）② 备注框 ③ 页码域，取值是一个孤零零的 `*`
    const localId = await adopt([
      { shapes: ['封面'], notes: [undefined, '这里要强调工期\r', '*\r'] },
      { shapes: ['目录'], notes: [undefined, '\r', '*\r'] }
    ]);

    await expect(call(localId, 'GetSlideNotes', [0])).resolves.toBe('这里要强调工期');
    await expect(call(localId, 'GetSlideNotes', [1])).resolves.toBe('');
  });

  it('没有备注页时回空串，不是整次读取失败', async () => {
    const localId = await adopt([{ shapes: ['只有正文'] }]);

    await expect(call(localId, 'GetSlideNotes', [0])).resolves.toBe('');
  });

  it('序号从 0 基转成 WPS 的 1 基，第二张读到的是第二张', async () => {
    const localId = await adopt([{ shapes: ['第一张'] }, { shapes: ['第二张'] }]);

    await expect(call(localId, 'GetSlideBody', [1])).resolves.toEqual({ texts: ['第二张'], shapeCount: 1 });
  });
});

describe('PDF 字节的归属（FR-12.5b / DV-18）', () => {
  /**
   * 归属靠**帧序号**，不靠任何跨窗口消息。
   *
   * 这一帧住着 WPS SDK，往它的窗口投任何一条 message——包括早先那条端口握手——
   * 都会把它自己的应答队列推错位，真实站点上的后果是整份文档打不开。
   * 所以字节留在子帧里，这一侧只回答「那份文档的 iframe 是第几个」。
   */
  /**
   * jsdom 认得 `window.length`，却不给索引访问（`window[0]` 是 undefined），
   * 而浏览器里 `window.frames[i]` 与 `iframe.contentWindow` 是同一个 WindowProxy。
   * 这里把索引补上，让生产代码那段扫描跑在与浏览器一致的前提下。
   */
  function exposeFrameIndex(frame: HTMLIFrameElement, index: number): void {
    Object.defineProperty(window, String(index), { configurable: true, value: frame.contentWindow });
    exposed.push(String(index));
  }

  const exposed: string[] = [];
  afterEach(() => {
    for (const key of exposed.splice(0)) Reflect.deleteProperty(window, key);
  });

  it('take-pdf 回报的序号在 window.frames 里正好指向本实例的 iframe', async () => {
    await install();
    pageLoadsSdk(fakeSdk());
    const sdk = window.WebOfficeSDK as { init(p: unknown): { __fireReady(): void } };
    sdk.init({ officeType: 'f' }).__fireReady();
    const [record] = await enumerate();
    const frame = document.querySelector('iframe.web-office-iframe') as HTMLIFrameElement;
    exposeFrameIndex(frame, 0);

    const result = await ask({ kind: 'take-pdf', localId: record!.localId });

    expect(result.value).toBe(0);
  });

  it('一页两份文档时各报各的序号，不会把字节记到另一份头上', async () => {
    await install();
    pageLoadsSdk(fakeSdk());
    const sdk = window.WebOfficeSDK as { init(p: unknown): { __fireReady(): void } };
    sdk.init({ officeType: 'f' }).__fireReady();
    sdk.init({ officeType: 's' }).__fireReady();
    const summaries = await enumerate();
    const frames = document.querySelectorAll('iframe.web-office-iframe');
    exposeFrameIndex(frames[0] as HTMLIFrameElement, 0);
    exposeFrameIndex(frames[1] as HTMLIFrameElement, 1);

    const first = await ask({ kind: 'take-pdf', localId: summaries[0]!.localId });
    const second = await ask({ kind: 'take-pdf', localId: summaries[1]!.localId });

    expect(first.value).toBe(0);
    expect(second.value).toBe(1);
  });

  it('iframe 已经被摘掉时回 undefined，让上层降级到视觉通道', async () => {
    await install();
    pageLoadsSdk(fakeSdk());
    const sdk = window.WebOfficeSDK as { init(p: unknown): { __fireReady(): void } };
    sdk.init({ officeType: 'f' }).__fireReady();
    const [record] = await enumerate();
    document.querySelector('iframe.web-office-iframe')!.remove();

    const result = await ask({ kind: 'take-pdf', localId: record!.localId });

    expect(result.value).toBeUndefined();
  });

  it('take-frame-pdf 交出本帧嗅到的字节，且不需要实例句柄', async () => {
    // 桥这一侧只负责路由与序列化；「取一次就没了」由嗅探器自己保证（见它的用例）
    // 保留原模块其余导出：`webOfficeFileLink` 也从这里取魔数与体积上限
    vi.doMock('../src/content/mainWorld/webOfficePdfSniffer', async (importOriginal) => {
      let bytes: Uint8Array | undefined = Uint8Array.from([0x25, 0x50, 0x44, 0x46]);
      return {
        ...(await importOriginal<Record<string, unknown>>()),
        installWebOfficePdfSniffer: (): void => undefined,
        takeSniffedPdf: (): Uint8Array | undefined => {
          const taken = bytes;
          bytes = undefined;
          return taken;
        }
      };
    });
    await install();

    const first = await ask({ kind: 'take-frame-pdf' });
    const second = await ask({ kind: 'take-frame-pdf' });

    expect(first.value).toEqual([0x25, 0x50, 0x44, 0x46]);
    expect(second.value).toBeUndefined();
  });

  it('take-linked-pdf 问的是本帧知不知道直链，与本帧有没有实例无关（FR-12.5f）', async () => {
    // 实测：`downloadurl` 在宿主帧，`WPSOpenApi` 在 office 帧，两者从来不在同一帧
    await install();
    (window as unknown as Record<string, unknown>)['downloadurl'] = `${location.origin}/servlet/wps/download`;
    expect(await enumerate()).toEqual([]);

    vi.stubGlobal('fetch', () =>
      Promise.resolve({
        ok: true,
        headers: { get: (): string | null => null },
        arrayBuffer: () => Promise.resolve(Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d]).buffer)
      })
    );

    const result = await ask({ kind: 'take-linked-pdf' });

    expect(result).toMatchObject({ ok: true });
    expect(result.value).toEqual([0x25, 0x50, 0x44, 0x46, 0x2d]);
    Reflect.deleteProperty(window, 'downloadurl');
    vi.unstubAllGlobals();
  });
});

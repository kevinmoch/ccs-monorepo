/**
 * `@webskill/ui-kit` 的本地垫片。
 *
 * ui-kit 没有发布形态：npm 上只有 @webskill/sdk、@webskill/chatbot、@webskill/console，
 * ui-kit 被 bundle 进了 chatbot/console 的产物里而没有自己的包。本扩展从 SDK 仓库复制而来，
 * 源码里 import 的是工作区内部的 @webskill/ui-kit，这份垫片按原包公开面补齐三类内容：
 *
 * 1. 运行时配置层（defaultRuntimeConfig / mergeRuntimeConfigDefaults / 两个 store 实现）——
 *    逻辑逐行移植自已发布 bundle 里的同一份实现（chatbot 产物内嵌 ui-kit 源码），
 *    类型以 `import type` 复用 @webskill/console 的再导出（只取类型：console 产物顶层
 *    会碰 document，值级引用会把 node 环境的测试与内容脚本一起拖崩）；
 * 2. 主题组件（ThemeScope / useRuntimeAppearance / Dialog）——按扩展实际用到的
 *    props 面重写，不引 Radix（原实现靠它做焦点陷阱，扩展侧只有一个确认弹窗）；
 * 3. 受控枚举（RUNTIME_RENDERER_IDS / QUICK_PROMPT_ICON_NAMES / MAX_QUICK_PROMPT_LIMIT）——
 *    取值与 bundle 内的常量逐字一致，extensionConfig.mjs 的 MIRRORED_ENUMS 靠单测与它对齐。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { JSX, ReactNode } from 'react';
import type {
  LocalizedText,
  RuntimeAppearanceConfig,
  RuntimeConfig,
  RuntimeConfigStore,
  RuntimeQuickPrompt,
  RuntimeRendererId
} from '@webskill/console';
import {
  DEFAULT_LOOP_LIMITS,
  DEFAULT_MAX_DATA_SOURCE_BYTES,
  DEFAULT_MAX_DOCUMENT_BYTES,
  DEFAULT_MAX_DOCUMENT_TEXT_BYTES,
  DEFAULT_MAX_UPLOAD_FILE_BYTES
} from '@webskill/sdk';

export type {
  RuntimeAppearanceConfig,
  RuntimeConfig,
  RuntimeConfigStore,
  RuntimeQuickPrompt,
  RuntimeRendererId
} from '@webskill/console';

export type Locale = 'zh' | 'en';
export type RuntimeLlmEntry = RuntimeConfig['llm']['entries'][number];

const SUPPORTED_LOCALES: readonly Locale[] = ['zh', 'en'];

const trimmed = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  return text === '' ? undefined : text;
};

function resolveLocalizedText(text: LocalizedText | string | undefined, locale: Locale): string | undefined {
  if (typeof text === 'string') return trimmed(text);
  if (typeof text !== 'object' || text === null) return undefined;
  const record = text as Record<string, unknown>;
  const preferred = trimmed(record[locale]);
  if (preferred !== undefined) return preferred;
  for (const candidate of SUPPORTED_LOCALES) {
    const value = trimmed(record[candidate]);
    if (value !== undefined) return value;
  }
  return undefined;
}

function normalizeLocalizedText(value: unknown): LocalizedText {
  if (typeof value === 'string') {
    const text = trimmed(value);
    if (text === undefined) return {};
    return Object.fromEntries(SUPPORTED_LOCALES.map((locale) => [locale, text]));
  }
  if (typeof value !== 'object' || value === null) return {};
  const record = value as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const locale of SUPPORTED_LOCALES) {
    const text = trimmed(record[locale]);
    if (text !== undefined) out[locale] = text;
  }
  return out;
}

function hasLocalizedText(text: LocalizedText): boolean {
  return SUPPORTED_LOCALES.some((locale) => resolveLocalizedText(text, locale) !== undefined);
}

/** 快捷指令图标的受控枚举（console 的图标下拉数据源） */
export const QUICK_PROMPT_ICON_NAMES = [
  'chart',
  'document',
  'report',
  'search',
  'list',
  'bug',
  'test',
  'metric',
  'compare',
  'page',
  'run',
  'warn',
  'sparkles',
  'settings'
] as const;

/** 渲染器档位的枚举值；下拉选项与导入校验共用同一份 */
export const RUNTIME_RENDERER_IDS = ['native', 'a2ui', 'openui', 'vercel'] as const;

/** 空态网格是两列，8 条即四行；用户可在 console 里上调 */
export const DEFAULT_QUICK_PROMPT_LIMIT = 8;
/** 可调范围的天花板：20 条已经把欢迎区撑成十行，再多就满屏都是按钮 */
export const MAX_QUICK_PROMPT_LIMIT = 20;

/** 存储里的脏值不能让空态变成空白或一堵墙；非正整数一律回默认 */
function clampQuickPromptLimit(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_QUICK_PROMPT_LIMIT;
  const floored = Math.floor(value);
  if (floored < 1) return DEFAULT_QUICK_PROMPT_LIMIT;
  return Math.min(floored, MAX_QUICK_PROMPT_LIMIT);
}

/** 生成式 UI 场景预设的默认开放范围 */
const DEFAULT_UI_PRESETS = ['charts', 'cards', 'dashboards', 'slides', 'reports'];

/** SDK 默认值（三个运行上限取自 `DEFAULT_LOOP_LIMITS`；interaction user/required/300s、deny-all 等） */
export function defaultRuntimeConfig(): RuntimeConfig {
  return {
    loop: {
      ...DEFAULT_LOOP_LIMITS,
      toolResultMaxBytes: 256e3,
      maxDocumentBytes: DEFAULT_MAX_DOCUMENT_BYTES,
      maxDocumentTextBytes: DEFAULT_MAX_DOCUMENT_TEXT_BYTES
    },
    interaction: {
      missingParams: 'user',
      confirmations: 'required',
      interactionTimeoutMs: 3e5,
      approvalScope: 'once-per-run'
    },
    router: { strategy: 'progressive' },
    hooks: {
      timeoutMs: 5e3,
      failOnHookError: false
    },
    streaming: true,
    renderResult: true,
    sandbox: {
      executor: 'auto',
      networkPolicy: 'deny-all',
      capabilities: {
        readReference: true,
        readAsset: true,
        writeArtifact: true,
        confirm: true,
        fetchData: false
      },
      maxDataSourceBytes: DEFAULT_MAX_DATA_SOURCE_BYTES,
      dataSources: [],
      remoteUrl: {
        allowHttp: false,
        allowPrivateHosts: false
      },
      typescript: { enabled: false },
      downloadedFiles: false,
      uploadFiles: false,
      maxUploadFileBytes: DEFAULT_MAX_UPLOAD_FILE_BYTES
    },
    llm: { entries: [] },
    agentCapabilities: {
      todo: true,
      skillGeneration: false,
      generativeUi: false,
      delegation: false,
      uiPresets: [...DEFAULT_UI_PRESETS]
    },
    security: { unsignedSkills: 'warn' },
    appearance: {
      theme: 'dark',
      locale: 'zh',
      renderer: 'native',
      dictationLang: ''
    },
    multimodal: {
      imageAttachments: false,
      pageImageCapture: false,
      maxImageBytes: 10 * 1024 * 1024,
      maxImagesPerMessage: 50,
      minImageArea: 1024
    },
    documentSurface: { enabled: false },
    userProfile: {
      enabled: false,
      injectMaxBytes: 4096,
      recordLimit: 500,
      encrypted: true
    },
    skillState: { quarantineThreshold: 5 },
    quickPrompts: [],
    quickPromptsSeeded: false,
    quickPromptLimit: DEFAULT_QUICK_PROMPT_LIMIT,
    dismissedAutoEntries: []
  };
}

/** 旧的单对象配置升格成列表时使用的固定 id：每次 load 都重算，随机 id 会让会话里存的归属失效 */
const MIGRATED_ENTRY_ID = 'llm-1';

function isLlmEntry(value: unknown): value is RuntimeLlmEntry {
  const e = value as RuntimeLlmEntry | undefined;
  return typeof e?.id === 'string' && e.id !== '' && typeof e.provider === 'string';
}

/**
 * `llm` 段的迁移：旧的单对象升格为单元素列表，原字段一个不丢（含 `apiKey`）。
 * 全空的旧配置等价于「还没配过模型」，不生成占位条目。
 */
function mergeLlmSelection(raw: unknown): RuntimeConfig['llm'] {
  const value = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const entries = Array.isArray(value['entries'])
    ? (value['entries'] as unknown[]).filter(isLlmEntry).map((entry) => ({
        ...entry,
        label: entry.label ?? entry.model ?? entry.id
      }))
    : upgradeLegacyLlm(value);
  if (entries.length === 0) return { entries: [] };
  const requested = typeof value['defaultId'] === 'string' ? value['defaultId'] : undefined;
  const defaultId = entries.some((entry) => entry.id === requested) ? requested : entries[0]?.id;
  return defaultId !== undefined ? { entries, defaultId } : { entries };
}

function upgradeLegacyLlm(legacy: Record<string, unknown>): RuntimeLlmEntry[] {
  const model = typeof legacy.model === 'string' ? legacy.model.trim() : '';
  const baseUrl = typeof legacy.baseUrl === 'string' ? legacy.baseUrl.trim() : '';
  const apiKey = typeof legacy.apiKey === 'string' ? legacy.apiKey.trim() : '';
  if (model === '' && baseUrl === '' && apiKey === '') return [];
  const provider = typeof legacy.provider === 'string' ? legacy.provider : 'openai-compatible';
  return [
    {
      id: MIGRATED_ENTRY_ID,
      label: model !== '' ? model : provider,
      provider: provider as RuntimeLlmEntry['provider'],
      model,
      ...(baseUrl !== '' ? { baseUrl } : {}),
      ...(apiKey !== '' ? { apiKey } : {}),
      ...(typeof legacy.requestTimeoutMs === 'number' ? { requestTimeoutMs: legacy.requestTimeoutMs } : {})
    }
  ];
}

/** 存储读出的部分配置按默认值补齐（老版本存储缺字段时平滑迁移） */
export function mergeRuntimeConfigDefaults(partial: unknown): RuntimeConfig {
  const d = defaultRuntimeConfig();
  const p = (typeof partial === 'object' && partial !== null ? partial : {}) as Record<string, unknown>;
  const sub = <K extends keyof RuntimeConfig>(key: K, base: RuntimeConfig[K]): RuntimeConfig[K] =>
    // 泛型索引类型不能 spread（TS2698），Object.assign 等价且绕开
    Object.assign({}, base, p[key as string] ?? {});
  return {
    loop: sub('loop', d.loop),
    interaction: sub('interaction', d.interaction),
    router: sub('router', d.router),
    hooks: sub('hooks', d.hooks),
    streaming: typeof p['streaming'] === 'boolean' ? p['streaming'] : d.streaming,
    renderResult: typeof p['renderResult'] === 'boolean' ? p['renderResult'] : d.renderResult,
    sandbox: {
      ...sub('sandbox', d.sandbox),
      capabilities: {
        ...d.sandbox.capabilities,
        ...(((p['sandbox'] as Record<string, unknown> | undefined)?.['capabilities'] ?? {}) as Record<string, unknown>)
      },
      remoteUrl: {
        ...d.sandbox.remoteUrl,
        ...(((p['sandbox'] as Record<string, unknown> | undefined)?.['remoteUrl'] ?? {}) as Record<string, unknown>)
      },
      typescript: {
        ...d.sandbox.typescript,
        ...(((p['sandbox'] as Record<string, unknown> | undefined)?.['typescript'] ?? {}) as Record<string, unknown>)
      },
      dataSources: readDataSourceEntries((p['sandbox'] as Record<string, unknown> | undefined)?.['dataSources'])
    },
    llm: mergeLlmSelection(p['llm']),
    agentCapabilities: {
      ...sub('agentCapabilities', d.agentCapabilities),
      uiPresets: readStringList(
        (p['agentCapabilities'] as Record<string, unknown> | undefined)?.['uiPresets'],
        d.agentCapabilities.uiPresets
      )
    },
    security: sub('security', d.security),
    appearance: mergeAppearance(p['appearance'], d.appearance),
    multimodal: mergeMultimodal(p['multimodal'], d.multimodal),
    documentSurface: mergeDocumentSurface(p['documentSurface'], d.documentSurface),
    userProfile: mergeUserProfile(p['userProfile'], d.userProfile),
    skillState: mergeSkillState(p['skillState'], d.skillState),
    quickPrompts: readQuickPrompts(p['quickPrompts']),
    quickPromptsSeeded: p['quickPromptsSeeded'] === true,
    quickPromptLimit: clampQuickPromptLimit(p['quickPromptLimit']),
    dismissedAutoEntries: readStringList(p['dismissedAutoEntries'], [])
  };
}

/**
 * `appearance` 逐字段校验而不是整段展开：这几个字段都是字面量联合，
 * 存储里的脏值（旧版本、手改的 localStorage）展开后会变成类型上不存在的档位。
 */
function mergeAppearance(raw: unknown, d: RuntimeAppearanceConfig): RuntimeAppearanceConfig {
  const p = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const stored = p['dictationLang'];
  return {
    theme: p['theme'] === 'light' || p['theme'] === 'dark' ? p['theme'] : d.theme,
    locale: p['locale'] === 'zh' || p['locale'] === 'en' ? p['locale'] : d.locale,
    renderer: (RUNTIME_RENDERER_IDS as readonly string[]).includes(p['renderer'] as string)
      ? (p['renderer'] as RuntimeRendererId)
      : d.renderer,
    dictationLang: typeof stored === 'string' ? stored.trim() : d.dictationLang
  };
}

function readStringList(raw: unknown, fallback: readonly string[]): string[] {
  if (!Array.isArray(raw)) return [...fallback];
  return raw.filter((item): item is string => typeof item === 'string');
}

/**
 * 快捷指令逐条校验：缺 `id` 或文案全语种皆空的条目**单条丢弃**，
 * 不因为一条脏数据把整段回退——用户其余的配置不该被连坐。
 * `icon` 取值不在枚举内时抹掉该字段（渲染侧按无图标处理）。
 */
function readQuickPrompts(raw: unknown): RuntimeQuickPrompt[] {
  if (!Array.isArray(raw)) return [];
  const out: RuntimeQuickPrompt[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const entry = item as Record<string, unknown>;
    const id = typeof entry['id'] === 'string' ? entry['id'].trim() : '';
    const rawText = entry['text'];
    if (id === '' || typeof rawText !== 'object' || rawText === null) continue;
    const text = normalizeLocalizedText(rawText);
    if (!hasLocalizedText(text)) continue;
    const icon = entry['icon'];
    const valid =
      typeof icon === 'string' && (QUICK_PROMPT_ICON_NAMES as readonly string[]).includes(icon)
        ? (icon as NonNullable<RuntimeQuickPrompt['icon']>)
        : undefined;
    out.push({
      id,
      text,
      ...(valid !== undefined ? { icon: valid } : {})
    });
  }
  return out;
}

/** 逐条校验用户配的数据源：`id` / `url` 缺失或非字符串即整条丢弃，一条脏数据不该连坐其余几条 */
function readDataSourceEntries(raw: unknown): RuntimeConfig['sandbox']['dataSources'] {
  if (!Array.isArray(raw)) return [];
  const out: RuntimeConfig['sandbox']['dataSources'][number][] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const entry = item as Record<string, unknown>;
    const id = typeof entry['id'] === 'string' ? entry['id'].trim() : '';
    const url = typeof entry['url'] === 'string' ? entry['url'].trim() : '';
    if (id === '' || url === '' || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      url,
      description: typeof entry['description'] === 'string' ? entry['description'] : ''
    });
  }
  return out;
}

/** 上限字段非正数时回退默认值：0 或负数会把整条通道变成永远拒收 */
function mergeMultimodal(raw: unknown, d: RuntimeConfig['multimodal']): RuntimeConfig['multimodal'] {
  const p = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const positive = (value: unknown, fallback: number) =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
  return {
    imageAttachments: typeof p['imageAttachments'] === 'boolean' ? p['imageAttachments'] : d.imageAttachments,
    pageImageCapture: typeof p['pageImageCapture'] === 'boolean' ? p['pageImageCapture'] : d.pageImageCapture,
    maxImageBytes: positive(p['maxImageBytes'], d.maxImageBytes),
    maxImagesPerMessage: positive(p['maxImagesPerMessage'], d.maxImagesPerMessage),
    minImageArea: nonNegative(p['minImageArea'], d.minImageArea)
  };
}

/** 非有限数 / 负数回退默认值，`0` 原样保留 */
function nonNegative(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}

/** CSP 白名单只收合法值；存储被污染时回退默认值，不能把非法值原样带进 CSP */
function mergeDocumentSurface(raw: unknown, d: RuntimeConfig['documentSurface']): RuntimeConfig['documentSurface'] {
  const p = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  return { enabled: typeof p['enabled'] === 'boolean' ? p['enabled'] : d.enabled };
}

/** 与 multimodal 同一套判据：非正数上限会让记录/注入通道恒空，回退默认值 */
function mergeUserProfile(raw: unknown, d: RuntimeConfig['userProfile']): RuntimeConfig['userProfile'] {
  const p = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const positive = (value: unknown, fallback: number) =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
  return {
    enabled: typeof p['enabled'] === 'boolean' ? p['enabled'] : d.enabled,
    injectMaxBytes: positive(p['injectMaxBytes'], d.injectMaxBytes),
    recordLimit: positive(p['recordLimit'], d.recordLimit),
    encrypted: typeof p['encrypted'] === 'boolean' ? p['encrypted'] : d.encrypted
  };
}

/** 与 multimodal 同一套判据：阈值非正整数会让隔离永不触发或立即触发，回退默认值 */
function mergeSkillState(raw: unknown, d: RuntimeConfig['skillState']): RuntimeConfig['skillState'] {
  const value = ((typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>)['quarantineThreshold'];
  return {
    quarantineThreshold:
      typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : d.quarantineThreshold
  };
}

/** 默认存储键；外观也在这份配置里，宿主不应再开第二个键存主题 */
export const DEFAULT_RUNTIME_CONFIG_STORAGE_KEY = 'webskill.runtime-config';

function resolveStorage(explicit?: Storage): Storage | undefined {
  if (explicit) return explicit;
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export interface LocalStorageRuntimeConfigStoreOptions {
  key?: string;
  storage?: Storage;
}

/**
 * localStorage 实现。跨标签页同步经 `storage` 事件——该事件只在**其他**标签页写入时触发，
 * 因此本标签页 `save()` 后需要自行通知订阅者。
 * 存储不可用（SSR、隐私模式、配额满）时退化为内存，不抛错：配置读写失败不该让宿主白屏。
 */
export function createLocalStorageRuntimeConfigStore(
  options?: LocalStorageRuntimeConfigStoreOptions
): RuntimeConfigStore {
  const key = options?.key ?? DEFAULT_RUNTIME_CONFIG_STORAGE_KEY;
  const storage = resolveStorage(options?.storage);
  const listeners = new Set<() => void>();
  let fallback: RuntimeConfig | undefined;
  const notify = () => {
    for (const listener of [...listeners]) listener();
  };
  return {
    load: async () => {
      if (!storage) return fallback ?? defaultRuntimeConfig();
      let raw: string | null;
      try {
        raw = storage.getItem(key);
      } catch {
        return fallback ?? defaultRuntimeConfig();
      }
      if (raw === null) return fallback ?? defaultRuntimeConfig();
      try {
        return mergeRuntimeConfigDefaults(JSON.parse(raw));
      } catch {
        return defaultRuntimeConfig();
      }
    },
    save: async (config) => {
      fallback = config;
      try {
        storage?.setItem(key, JSON.stringify(config));
      } catch {
        // 配额满等写入失败：内存 fallback 已更新，本会话内读到的是新值
      }
      notify();
    },
    reset: async () => {
      fallback = undefined;
      try {
        storage?.removeItem(key);
      } catch {
        // 同 save：忽略存储层失败
      }
      notify();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      const onStorage = (event: StorageEvent) => {
        if (event.key === null || event.key === key) listener();
      };
      globalThis.addEventListener?.('storage', onStorage);
      return () => {
        listeners.delete(listener);
        globalThis.removeEventListener?.('storage', onStorage);
      };
    }
  };
}

/** 内存实现：测试、SSR、以及宿主明确不想持久化时使用 */
export function createMemoryRuntimeConfigStore(initial?: Partial<RuntimeConfig>): RuntimeConfigStore {
  const seed = initial === undefined ? undefined : mergeRuntimeConfigDefaults(initial);
  let current = seed;
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of [...listeners]) listener();
  };
  return {
    load: async () => current ?? defaultRuntimeConfig(),
    save: async (config) => {
      current = config;
      notify();
    },
    reset: async () => {
      current = seed;
      notify();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }
  };
}

/**
 * 包住一个 load() 可能返回部分/旧版数据的 store，每次读取都经
 * mergeRuntimeConfigDefaults 归一，让所有消费方共享同一套补默认行为。
 * save/reset 原样透传。
 */
export function withRuntimeConfigDefaults(store: RuntimeConfigStore): RuntimeConfigStore {
  return {
    load: async () => mergeRuntimeConfigDefaults(await store.load()),
    save: (config) => store.save(config),
    reset: () => store.reset(),
    ...(store.subscribe ? { subscribe: (listener: () => void) => store.subscribe!(listener) } : {})
  };
}

/**
 * 同一 `RuntimeConfigStore` 上的配置写入串行化锁：设置与外观都是「改动即落盘」的
 * 读-改-写（load → merge → save），两个写入方并发时后写者可能以旧快照覆盖先写者。
 * 按 store 实例串行化任务；前一个任务的拒绝不影响后续任务。
 */
const configWriteLocks = new WeakMap<RuntimeConfigStore, Promise<void>>();

export function withConfigWriteLock<T>(store: RuntimeConfigStore, task: () => Promise<T>): Promise<T> {
  const run = (configWriteLocks.get(store) ?? Promise.resolve()).then(task, task);
  configWriteLocks.set(
    store,
    run.then(
      () => undefined,
      () => undefined
    )
  );
  return run;
}

/**
 * 外观配置的读写口。无 `store` 时退回受控行为：只跟随 `fallback`。
 * 有 `store` 时读取经默认值归一后的配置，并订阅变更；`update` 改完即写盘。
 */
export function useRuntimeAppearance(
  store: RuntimeConfigStore | undefined,
  fallback: RuntimeAppearanceConfig
): { appearance: RuntimeAppearanceConfig; update: (patch: Partial<RuntimeAppearanceConfig>) => void } {
  const [appearance, setAppearance] = useState<RuntimeAppearanceConfig>(fallback);
  const fallbackRef = useRef(fallback);
  fallbackRef.current = fallback;
  const latestRef = useRef(appearance);
  latestRef.current = appearance;

  useEffect(() => {
    if (store) return;
    setAppearance(fallbackRef.current);
  }, [store, fallback.theme, fallback.locale, fallback.renderer, fallback.dictationLang]);

  useEffect(() => {
    if (!store) return;
    const merged = withRuntimeConfigDefaults(store);
    let cancelled = false;
    const reload = () => {
      merged
        .load()
        .then((config) => {
          if (cancelled) return;
          setAppearance(config.appearance);
        })
        .catch(() => undefined);
    };
    reload();
    const unsubscribe = merged.subscribe?.(reload);
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [store]);

  // 写盘失败不破坏本地视觉；console.warn 保底可观测
  const persist = useCallback(
    (next: RuntimeAppearanceConfig): Promise<void> => {
      if (store === undefined) return Promise.resolve();
      return withConfigWriteLock(store, async () => {
        const merged = withRuntimeConfigDefaults(store);
        const config = await merged.load();
        await merged.save({
          ...config,
          appearance: {
            ...config.appearance,
            ...next
          }
        });
      }).catch((e) => {
        console.warn('[webskill] appearance persist failed:', e);
      });
    },
    [store]
  );

  return {
    appearance,
    update: useCallback(
      (patch: Partial<RuntimeAppearanceConfig>) => {
        const next = {
          ...latestRef.current,
          ...patch
        };
        latestRef.current = next;
        setAppearance(next);
        void persist(next);
      },
      [persist]
    )
  };
}

/**
 * 主题作用域容器。暗色下同时挂 `.dark` 与 `data-theme='dark'`：
 * 前者是 tailwind 变体的钩子，后者供不依赖 class 的消费方（图表、代码高亮）判定。
 * 宿主页面自身的类名不被改动：作用域只作用于自己的子树。
 */
export function ThemeScope({
  theme,
  className = '',
  children,
  ...props
}: {
  theme: 'light' | 'dark';
  className?: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <div
      {...props}
      className={`${theme === 'dark' ? 'dark ' : ''}${className}`}
      data-webskill-theme={theme}
      data-theme={theme}
    >
      {children}
    </div>
  );
}

/** 宽度阶梯 */
const DIALOG_WIDTHS = {
  sm: 'min(100% - 2rem, 24rem)',
  md: 'min(100% - 2rem, 32rem)',
  lg: 'min(100% - 2rem, 44rem)'
} as const;

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  footer?: ReactNode;
  hideCloseButton?: boolean;
  dismissOnOutsideClick?: boolean;
  className?: string;
  size?: keyof typeof DIALOG_WIDTHS;
  children?: ReactNode;
}

/**
 * 轻量对话框：Escape 关闭、遮罩点击关闭（可禁）、关闭后焦点还原到触发元素。
 * 原实现靠 Radix 做焦点陷阱；扩展侧只有「候选源确认」一处弹窗，不引入这层依赖。
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  footer,
  hideCloseButton = false,
  dismissOnOutsideClick = true,
  className = '',
  size,
  children
}: DialogProps): JSX.Element | null {
  const restoreFocusRef = useRef<Element | null>(null);
  if (open && restoreFocusRef.current === null && typeof document !== 'undefined') {
    restoreFocusRef.current = document.activeElement;
  }
  if (!open) restoreFocusRef.current = null;

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      const source = restoreFocusRef.current;
      if (source instanceof HTMLElement && source.isConnected) source.focus();
      restoreFocusRef.current = null;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-scrim"
        {...(dismissOnOutsideClick ? { onClick: onClose } : {})}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`fixed top-1/2 left-1/2 flex max-h-[calc(100dvh-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-card border border-border bg-surface shadow-card-vivid outline-none ${className}`}
        style={{ width: DIALOG_WIDTHS[size ?? 'md'] }}
      >
        <div
          className={
            children
              ? 'flex items-start justify-between gap-4 border-b border-border px-5 py-4'
              : 'flex items-start justify-between gap-4 px-5 py-4'
          }
        >
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ink">{title}</h2>
            {description ? <p className="mt-1 text-xs text-muted-foreground">{description}</p> : null}
          </div>
          {hideCloseButton ? null : (
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="rounded-sm px-1 text-muted-foreground outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-ring/20"
            >
              ✕
            </button>
          )}
        </div>
        {children ? <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div> : null}
        {footer ? <div className="flex justify-end gap-2 border-t border-border px-5 py-4">{footer}</div> : null}
      </div>
    </div>
  );
}

/**
 * `config.json` 的解析与映射——被 `writeBakedConfig.mjs`（生成烘焙常量）与
 * `vite.config.ts`（覆写 manifest 三项）共用的**单一事实源**。
 *
 * 校验一律**硬失败**：拼错一个字段名而脚本静默忽略，得到的是「看起来生效了其实没生效」
 * 的构建产物，症状出现在运行时且完全无从反推。
 *
 * 纯 JS 且无 SDK 依赖：它要在 vite 配置加载期跑，那时别名表还没生效。
 * 因此下面几张枚举表是 SDK 常量的**手抄副本**，一致性由 test/bakedConfig.test.ts 守护。
 */

/** 面向调用方的结构化错误：`path` 指向 config.json 里出问题的位置 */
export class ExtensionConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ExtensionConfigError';
  }
}

const LLM_PROVIDERS = ['openai-compatible', 'anthropic', 'google', 'chrome-builtin'];
const SANDBOX_EXECUTORS = ['auto', 'blob-worker', 'iframe-sandbox'];
const NETWORK_POLICIES = ['deny-all', 'allow-all'];
const ROUTER_STRATEGIES = ['progressive', 'full-disclosure'];
const MISSING_PARAMS = ['user', 'llm'];
const CONFIRMATIONS = ['required', 'auto-approve'];
const APPROVAL_SCOPES = ['once-per-run', 'every-call'];
const UNSIGNED_POLICIES = ['allow', 'warn', 'deny'];
const THEMES = ['light', 'dark'];
const LOCALES = ['en', 'zh'];
const RENDERERS = ['native', 'a2ui', 'openui', 'vercel'];
const CAPABILITY_KEYS = ['readReference', 'readAsset', 'writeArtifact', 'confirm', 'fetchData'];
const MAX_QUICK_PROMPT_LIMIT = 20;
const QUICK_PROMPT_ICONS = [
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
];

/** 供测试比对 SDK 常量，避免手抄副本漂移 */
export const MIRRORED_ENUMS = {
  llmProviders: LLM_PROVIDERS,
  sandboxExecutors: SANDBOX_EXECUTORS,
  routerStrategies: ROUTER_STRATEGIES,
  renderers: RENDERERS,
  quickPromptIcons: QUICK_PROMPT_ICONS,
  capabilityKeys: CAPABILITY_KEYS
};

function fail(message) {
  throw new ExtensionConfigError(message);
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function expectObject(value, path) {
  if (!isPlainObject(value)) fail(`${path} must be an object`);
  return value;
}

/** 未知键一律报错，并把合法键列出来——拼错字段是这套配置最容易犯也最难发现的错 */
function rejectUnknownKeys(value, allowed, path) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      fail(`${path}.${key} is not a recognized option (allowed: ${allowed.join(', ')})`);
    }
  }
}

function readBool(value, path) {
  if (typeof value !== 'boolean') fail(`${path} must be a boolean`);
  return value;
}

function readString(value, path, { allowEmpty = false } = {}) {
  if (typeof value !== 'string') fail(`${path} must be a string`);
  if (!allowEmpty && value.trim() === '') fail(`${path} must not be empty`);
  return value;
}

function readInt(value, path, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (typeof value !== 'number' || !Number.isInteger(value)) fail(`${path} must be an integer`);
  if (value < min || value > max) fail(`${path} must be between ${min} and ${max}`);
  return value;
}

function readEnum(value, path, allowed) {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    fail(`${path} must be one of: ${allowed.join(', ')}`);
  }
  return value;
}

/** `CapabilityMode` 是三态：布尔或 'require-approval' */
function readCapability(value, path) {
  if (typeof value === 'boolean') return value;
  if (value === 'require-approval') return value;
  fail(`${path} must be a boolean or "require-approval"`);
}

/** 只把 config.json 里**出现过**的键写进结果，缺席的键留给 SDK 默认值 */
function assign(target, source, key, read) {
  if (source[key] === undefined) return;
  target[key] = read(source[key]);
}

/** Chrome 的版本号：1–4 段十进制整数，每段 0–65535，且不得有前导零 */
function readManifestVersion(value, path) {
  const raw = readString(value, path);
  const parts = raw.split('.');
  if (parts.length < 1 || parts.length > 4) {
    fail(`${path} must have between 1 and 4 dot-separated parts`);
  }
  for (const part of parts) {
    if (!/^(0|[1-9]\d*)$/.test(part) || Number(part) > 65535) {
      fail(`${path} parts must be integers between 0 and 65535 without leading zeros`);
    }
  }
  return raw;
}

function parseManifest(raw) {
  const source = expectObject(raw, 'manifest');
  rejectUnknownKeys(source, ['name', 'version', 'description'], 'manifest');
  const out = {};
  assign(out, source, 'name', (v) => readString(v, 'manifest.name'));
  assign(out, source, 'version', (v) => readManifestVersion(v, 'manifest.version'));
  assign(out, source, 'description', (v) => readString(v, 'manifest.description'));
  return out;
}

/**
 * 模型条目与 SDK 的 `RuntimeLlmEntry` **同形**：不做字段改名，
 * 少一层映射就少一处长期漂移的来源。
 * `apiKey` 是唯一的例外——它被摘出去单独处理，不进烘焙的明文常量。
 */
function parseModels(raw, secrets) {
  if (!Array.isArray(raw)) fail('models must be an array');
  const entries = [];
  const seen = new Set();
  raw.forEach((item, index) => {
    const path = `models[${index}]`;
    const source = expectObject(item, path);
    rejectUnknownKeys(
      source,
      [
        'id',
        'label',
        'provider',
        'baseUrl',
        'apiKey',
        'model',
        'requestTimeoutMs',
        'capabilities',
        'thinkingBudgetTokens'
      ],
      path
    );
    const id = readString(source.id, `${path}.id`);
    if (seen.has(id)) fail(`${path}.id duplicates an earlier entry: ${id}`);
    seen.add(id);

    const provider = readEnum(source.provider, `${path}.provider`, LLM_PROVIDERS);
    const entry = {
      id,
      label: readString(source.label, `${path}.label`),
      provider,
      // chrome-builtin 走浏览器 Prompt API，没有模型名可填
      model: provider === 'chrome-builtin' ? (source.model ?? '') : readString(source.model, `${path}.model`)
    };
    assign(entry, source, 'baseUrl', (v) => readString(v, `${path}.baseUrl`));
    assign(entry, source, 'requestTimeoutMs', (v) => readInt(v, `${path}.requestTimeoutMs`, { min: 1 }));
    assign(entry, source, 'thinkingBudgetTokens', (v) => readInt(v, `${path}.thinkingBudgetTokens`));
    if (source.capabilities !== undefined) {
      const caps = expectObject(source.capabilities, `${path}.capabilities`);
      rejectUnknownKeys(caps, ['tools', 'image'], `${path}.capabilities`);
      entry.capabilities = {
        tools: caps.tools === undefined ? true : readBool(caps.tools, `${path}.capabilities.tools`),
        image: caps.image === undefined ? false : readBool(caps.image, `${path}.capabilities.image`)
      };
    }
    if (source.apiKey !== undefined) {
      const key = readString(source.apiKey, `${path}.apiKey`, { allowEmpty: true });
      if (key !== '') secrets[id] = key;
    }
    entries.push(entry);
  });
  return entries;
}

/** 读一个子分节：校验它是对象并拒绝未知键 */
function subsection(value, allowed, path) {
  const parsed = expectObject(value, path);
  rejectUnknownKeys(parsed, allowed, path);
  return parsed;
}

function parseLoop(raw) {
  const path = 'agentRuntime.loop';
  const source = subsection(
    raw,
    [
      'maxTurns',
      'maxHistoryMessages',
      'totalTimeoutMs',
      'toolTimeoutMs',
      'toolResultMaxBytes',
      'maxDocumentBytes',
      'maxDocumentTextBytes',
      'temperature'
    ],
    path
  );
  const loop = {};
  assign(loop, source, 'maxTurns', (v) => readInt(v, `${path}.maxTurns`, { min: 1, max: 9999 }));
  assign(loop, source, 'maxHistoryMessages', (v) => readInt(v, `${path}.maxHistoryMessages`, { min: 1 }));
  assign(loop, source, 'totalTimeoutMs', (v) => readInt(v, `${path}.totalTimeoutMs`, { min: 1000 }));
  assign(loop, source, 'toolTimeoutMs', (v) => readInt(v, `${path}.toolTimeoutMs`, { min: 1000 }));
  assign(loop, source, 'toolResultMaxBytes', (v) => readInt(v, `${path}.toolResultMaxBytes`, { min: 1024 }));
  assign(loop, source, 'maxDocumentBytes', (v) => readInt(v, `${path}.maxDocumentBytes`, { min: 1024 }));
  assign(loop, source, 'maxDocumentTextBytes', (v) => readInt(v, `${path}.maxDocumentTextBytes`, { min: 1024 }));
  if (source.temperature !== undefined) {
    const value = source.temperature;
    if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${path}.temperature must be a number`);
    if (value < 0 || value > 2) fail(`${path}.temperature must be between 0 and 2`);
    loop.temperature = value;
  }
  return loop;
}

function parseInteraction(raw) {
  const path = 'agentRuntime.interaction';
  const source = subsection(raw, ['missingParams', 'confirmations', 'approvalScope', 'interactionTimeoutMs'], path);
  const interaction = {};
  assign(interaction, source, 'missingParams', (v) => readEnum(v, `${path}.missingParams`, MISSING_PARAMS));
  assign(interaction, source, 'confirmations', (v) => readEnum(v, `${path}.confirmations`, CONFIRMATIONS));
  assign(interaction, source, 'approvalScope', (v) => readEnum(v, `${path}.approvalScope`, APPROVAL_SCOPES));
  assign(interaction, source, 'interactionTimeoutMs', (v) => readInt(v, `${path}.interactionTimeoutMs`, { min: 1000 }));
  return interaction;
}

function parseHooks(raw) {
  const path = 'agentRuntime.hooks';
  const source = subsection(raw, ['timeoutMs', 'failOnHookError'], path);
  const hooks = {};
  assign(hooks, source, 'timeoutMs', (v) => readInt(v, `${path}.timeoutMs`, { min: 100 }));
  assign(hooks, source, 'failOnHookError', (v) => readBool(v, `${path}.failOnHookError`));
  return hooks;
}

function parseAgentCapabilities(raw) {
  const path = 'agentRuntime.agentCapabilities';
  const source = subsection(raw, ['todo', 'generativeUi', 'skillGeneration', 'delegation', 'uiPresets'], path);
  const capabilities = {};
  assign(capabilities, source, 'todo', (v) => readBool(v, `${path}.todo`));
  assign(capabilities, source, 'generativeUi', (v) => readBool(v, `${path}.generativeUi`));
  assign(capabilities, source, 'skillGeneration', (v) => readBool(v, `${path}.skillGeneration`));
  assign(capabilities, source, 'delegation', (v) => readBool(v, `${path}.delegation`));
  if (source.uiPresets !== undefined) {
    if (!Array.isArray(source.uiPresets)) fail(`${path}.uiPresets must be an array`);
    capabilities.uiPresets = source.uiPresets.map((v, i) => readString(v, `${path}.uiPresets[${i}]`));
  }
  return capabilities;
}

function parseMultimodal(raw) {
  const path = 'agentRuntime.multimodal';
  const source = subsection(
    raw,
    ['imageAttachments', 'pageImageCapture', 'maxImagesPerMessage', 'maxImageBytes', 'minImageArea'],
    path
  );
  const multimodal = {};
  assign(multimodal, source, 'imageAttachments', (v) => readBool(v, `${path}.imageAttachments`));
  assign(multimodal, source, 'pageImageCapture', (v) => readBool(v, `${path}.pageImageCapture`));
  assign(multimodal, source, 'maxImagesPerMessage', (v) =>
    readInt(v, `${path}.maxImagesPerMessage`, { min: 1, max: 100 })
  );
  assign(multimodal, source, 'maxImageBytes', (v) => readInt(v, `${path}.maxImageBytes`, { min: 65536 }));
  assign(multimodal, source, 'minImageArea', (v) => readInt(v, `${path}.minImageArea`, { min: 0 }));
  return multimodal;
}

/**
 * 分节名与 Console「设置 / 智能体运行时」页的分组一一对应，字段名与 `RuntimeConfig` 同形，
 * 方便对着界面逐项核对。数值区间也照抄界面上对应输入框，避免烘焙出界面调不回来的值。
 */
function parseAgentRuntime(raw, out) {
  const source = expectObject(raw, 'agentRuntime');
  rejectUnknownKeys(
    source,
    [
      'loop',
      'skillState',
      'interaction',
      'router',
      'hooks',
      'agentCapabilities',
      'multimodal',
      'streaming',
      'renderResult'
    ],
    'agentRuntime'
  );

  assign(out, source, 'streaming', (v) => readBool(v, 'agentRuntime.streaming'));
  assign(out, source, 'renderResult', (v) => readBool(v, 'agentRuntime.renderResult'));

  if (source.router !== undefined) {
    out.router = { strategy: readEnum(source.router, 'agentRuntime.router', ROUTER_STRATEGIES) };
  }
  if (source.skillState !== undefined) {
    const path = 'agentRuntime.skillState';
    const skillState = subsection(source.skillState, ['quarantineThreshold'], path);
    const parsed = {};
    assign(parsed, skillState, 'quarantineThreshold', (v) =>
      readInt(v, `${path}.quarantineThreshold`, { min: 1, max: 20 })
    );
    if (Object.keys(parsed).length > 0) out.skillState = parsed;
  }

  for (const [key, parse] of [
    ['loop', parseLoop],
    ['interaction', parseInteraction],
    ['hooks', parseHooks],
    ['agentCapabilities', parseAgentCapabilities],
    ['multimodal', parseMultimodal]
  ]) {
    if (source[key] === undefined) continue;
    const parsed = parse(source[key]);
    if (Object.keys(parsed).length > 0) out[key] = parsed;
  }
}

function parseSandbox(raw, out) {
  const source = expectObject(raw, 'sandbox');
  rejectUnknownKeys(
    source,
    [
      'executor',
      'networkPolicy',
      'typescript',
      'downloadedFiles',
      'uploadFiles',
      'allowHttp',
      'allowPrivateHosts',
      'capabilities',
      'dataSources',
      'maxDataSourceBytes',
      'maxUploadFileBytes',
      'unsignedSkills',
      'documentSurface'
    ],
    'sandbox'
  );

  const sandbox = {};
  assign(sandbox, source, 'executor', (v) => readEnum(v, 'sandbox.executor', SANDBOX_EXECUTORS));
  assign(sandbox, source, 'downloadedFiles', (v) => readBool(v, 'sandbox.downloadedFiles'));
  assign(sandbox, source, 'uploadFiles', (v) => readBool(v, 'sandbox.uploadFiles'));
  assign(sandbox, source, 'maxDataSourceBytes', (v) => readInt(v, 'sandbox.maxDataSourceBytes', { min: 1024 }));
  assign(sandbox, source, 'maxUploadFileBytes', (v) => readInt(v, 'sandbox.maxUploadFileBytes', { min: 1024 }));

  // 白名单形态：{ "allow": ["https://example.com"] }
  if (source.networkPolicy !== undefined) {
    const value = source.networkPolicy;
    if (isPlainObject(value)) {
      rejectUnknownKeys(value, ['allow'], 'sandbox.networkPolicy');
      if (!Array.isArray(value.allow)) fail('sandbox.networkPolicy.allow must be an array');
      sandbox.networkPolicy = {
        allow: value.allow.map((v, i) => readString(v, `sandbox.networkPolicy.allow[${i}]`))
      };
    } else {
      sandbox.networkPolicy = readEnum(value, 'sandbox.networkPolicy', NETWORK_POLICIES);
    }
  }

  if (source.typescript !== undefined) {
    const value = source.typescript;
    if (isPlainObject(value)) {
      rejectUnknownKeys(value, ['enabled', 'esbuildUrl', 'wasmUrl'], 'sandbox.typescript');
      const typescript = { enabled: readBool(value.enabled, 'sandbox.typescript.enabled') };
      assign(typescript, value, 'esbuildUrl', (v) => readString(v, 'sandbox.typescript.esbuildUrl'));
      assign(typescript, value, 'wasmUrl', (v) => readString(v, 'sandbox.typescript.wasmUrl'));
      sandbox.typescript = typescript;
    } else {
      sandbox.typescript = { enabled: readBool(value, 'sandbox.typescript') };
    }
  }

  const remoteUrl = {};
  assign(remoteUrl, source, 'allowHttp', (v) => readBool(v, 'sandbox.allowHttp'));
  assign(remoteUrl, source, 'allowPrivateHosts', (v) => readBool(v, 'sandbox.allowPrivateHosts'));
  if (Object.keys(remoteUrl).length > 0) sandbox.remoteUrl = remoteUrl;

  if (source.capabilities !== undefined) {
    const caps = expectObject(source.capabilities, 'sandbox.capabilities');
    rejectUnknownKeys(caps, CAPABILITY_KEYS, 'sandbox.capabilities');
    const parsed = {};
    for (const key of CAPABILITY_KEYS) {
      assign(parsed, caps, key, (v) => readCapability(v, `sandbox.capabilities.${key}`));
    }
    sandbox.capabilities = parsed;
  }

  if (source.dataSources !== undefined) {
    if (!Array.isArray(source.dataSources)) fail('sandbox.dataSources must be an array');
    sandbox.dataSources = source.dataSources.map((item, index) => {
      const path = `sandbox.dataSources[${index}]`;
      const entry = expectObject(item, path);
      rejectUnknownKeys(entry, ['id', 'url', 'description'], path);
      return {
        id: readString(entry.id, `${path}.id`),
        url: readString(entry.url, `${path}.url`),
        description: readString(entry.description, `${path}.description`, { allowEmpty: true })
      };
    });
  }

  if (Object.keys(sandbox).length > 0) out.sandbox = sandbox;

  if (source.unsignedSkills !== undefined) {
    out.security = { unsignedSkills: readEnum(source.unsignedSkills, 'sandbox.unsignedSkills', UNSIGNED_POLICIES) };
  }
  if (source.documentSurface !== undefined) {
    out.documentSurface = { enabled: readBool(source.documentSurface, 'sandbox.documentSurface') };
  }
}

function parseQuickPrompts(raw, out) {
  const source = expectObject(raw, 'quickPrompts');
  rejectUnknownKeys(source, ['limit', 'items'], 'quickPrompts');
  if (source.limit !== undefined) {
    out.quickPromptLimit = readInt(source.limit, 'quickPrompts.limit', { min: 1, max: MAX_QUICK_PROMPT_LIMIT });
  }
  if (source.items === undefined) return;
  if (!Array.isArray(source.items)) fail('quickPrompts.items must be an array');
  const seen = new Set();
  out.quickPrompts = source.items.map((item, index) => {
    const path = `quickPrompts.items[${index}]`;
    const entry = expectObject(item, path);
    rejectUnknownKeys(entry, ['id', 'text', 'icon'], path);
    const id = readString(entry.id, `${path}.id`);
    if (seen.has(id)) fail(`${path}.id duplicates an earlier entry: ${id}`);
    seen.add(id);
    const text = expectObject(entry.text, `${path}.text`);
    rejectUnknownKeys(text, ['zh', 'en'], `${path}.text`);
    // 双语硬约束（AGENTS.md）：面向用户的文案两种语言都要有
    const parsed = {
      id,
      text: {
        zh: readString(text.zh, `${path}.text.zh`),
        en: readString(text.en, `${path}.text.en`)
      }
    };
    assign(parsed, entry, 'icon', (v) => readEnum(v, `${path}.icon`, QUICK_PROMPT_ICONS));
    return parsed;
  });
  // 种子标记必须一并写死：否则宿主的一次性种子会在首启时再注一遍（FR-21.6）
  out.quickPromptsSeeded = true;
}

function parsePrivacy(raw, out) {
  const source = expectObject(raw, 'privacy');
  rejectUnknownKeys(source, ['userProfile', 'encryptProfile', 'injectMaxBytes', 'recordLimit'], 'privacy');
  const profile = {};
  if (source.userProfile !== undefined) {
    profile.enabled = readBool(source.userProfile, 'privacy.userProfile');
  }
  if (source.encryptProfile !== undefined) {
    profile.encrypted = readBool(source.encryptProfile, 'privacy.encryptProfile');
  }
  assign(profile, source, 'injectMaxBytes', (v) => readInt(v, 'privacy.injectMaxBytes', { min: 1024 }));
  assign(profile, source, 'recordLimit', (v) => readInt(v, 'privacy.recordLimit', { min: 1 }));
  if (Object.keys(profile).length > 0) out.userProfile = profile;
}

function parseAppearance(raw, out) {
  const source = expectObject(raw, 'appearance');
  rejectUnknownKeys(source, ['theme', 'locale', 'renderer', 'dictationLang'], 'appearance');
  const appearance = {};
  assign(appearance, source, 'theme', (v) => readEnum(v, 'appearance.theme', THEMES));
  assign(appearance, source, 'locale', (v) => readEnum(v, 'appearance.locale', LOCALES));
  assign(appearance, source, 'renderer', (v) => readEnum(v, 'appearance.renderer', RENDERERS));
  assign(appearance, source, 'dictationLang', (v) => readString(v, 'appearance.dictationLang', { allowEmpty: true }));
  if (Object.keys(appearance).length > 0) out.appearance = appearance;
}

/**
 * @param {unknown} raw 解析后的 config.json 内容
 * @returns {{
 *   runtimeConfig: Record<string, any>,
 *   secrets: Record<string, string>,
 *   manifest: Record<string, string>
 * }}
 *   `runtimeConfig` 是逐段拼出来的 `DeepPartial<RuntimeConfig>`，这里无法从纯 JS 引用那个类型。
 *   `secrets` 是 entryId → 明文 apiKey；调用方负责决定它怎么进产物。
 */
export function parseExtensionConfig(raw) {
  const source = expectObject(raw, 'config');
  rejectUnknownKeys(
    source,
    ['manifest', 'models', 'defaultModel', 'agentRuntime', 'sandbox', 'quickPrompts', 'privacy', 'appearance'],
    'config'
  );

  const runtimeConfig = {};
  const secrets = {};
  const manifest = source.manifest === undefined ? {} : parseManifest(source.manifest);

  if (source.models !== undefined) {
    const entries = parseModels(source.models, secrets);
    const llm = { entries };
    if (source.defaultModel !== undefined) {
      const defaultId = readString(source.defaultModel, 'defaultModel');
      if (!entries.some((entry) => entry.id === defaultId)) {
        fail(`defaultModel must reference an id declared in models: ${defaultId}`);
      }
      llm.defaultId = defaultId;
    }
    runtimeConfig.llm = llm;
  } else if (source.defaultModel !== undefined) {
    fail('defaultModel requires models to be declared');
  }

  if (source.agentRuntime !== undefined) parseAgentRuntime(source.agentRuntime, runtimeConfig);
  if (source.sandbox !== undefined) parseSandbox(source.sandbox, runtimeConfig);
  if (source.quickPrompts !== undefined) parseQuickPrompts(source.quickPrompts, runtimeConfig);
  if (source.privacy !== undefined) parsePrivacy(source.privacy, runtimeConfig);
  if (source.appearance !== undefined) parseAppearance(source.appearance, runtimeConfig);

  return { runtimeConfig, secrets, manifest };
}

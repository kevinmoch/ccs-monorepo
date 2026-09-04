import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  defaultRuntimeConfig,
  MAX_QUICK_PROMPT_LIMIT,
  QUICK_PROMPT_ICON_NAMES,
  RUNTIME_RENDERER_IDS
} from '@webskill/ui-kit';
import { ExtensionConfigError, MIRRORED_ENUMS, parseExtensionConfig } from '../scripts/extensionConfig.mjs';

/** 生成文件不入库（含密钥材料），所以合并层的用例一律注入受控的假烘焙常量 */
const GENERATED = '../src/generated/bakedConfig';

async function loadMergeLayer(baked: {
  BAKED_CONFIG?: unknown;
  BAKED_SECRET_KEY?: string;
  BAKED_SECRETS?: Record<string, { iv: string; data: string }>;
}) {
  vi.resetModules();
  vi.doMock(GENERATED, () => ({
    BAKED_FINGERPRINT: 'test',
    BAKED_CONFIG: baked.BAKED_CONFIG ?? {},
    BAKED_MANIFEST: {},
    BAKED_SECRET_KEY: baked.BAKED_SECRET_KEY ?? '',
    BAKED_SECRETS: baked.BAKED_SECRETS ?? {}
  }));
  return import('../src/shared/bakedConfig');
}

const toBase64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64');

/** 用与 writeBakedConfig.mjs 相同的方式产出密文，避免用例自己另造一套格式 */
async function bakeSecret(id: string, plaintext: string) {
  const rawKey = crypto.getRandomValues(new Uint8Array(32));
  const key = await crypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext));
  return {
    BAKED_SECRET_KEY: toBase64(rawKey),
    BAKED_SECRETS: { [id]: { iv: toBase64(iv), data: toBase64(new Uint8Array(data)) } }
  };
}

const MODEL = {
  id: 'm1',
  label: 'DeepSeek',
  provider: 'openai-compatible',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-chat'
};

describe('parseExtensionConfig', () => {
  it('maps models onto RuntimeLlmEntry shape and lifts the default id', () => {
    const parsed = parseExtensionConfig({
      models: [{ ...MODEL, capabilities: { tools: true, image: true } }],
      defaultModel: 'm1'
    });
    expect(parsed.runtimeConfig.llm).toEqual({
      entries: [{ ...MODEL, capabilities: { tools: true, image: true } }],
      defaultId: 'm1'
    });
  });

  it('extracts api keys instead of baking them as plaintext config', () => {
    const parsed = parseExtensionConfig({ models: [{ ...MODEL, apiKey: 'sk-live-1' }] });
    expect(parsed.secrets).toEqual({ m1: 'sk-live-1' });
    expect(parsed.runtimeConfig.llm.entries[0]).not.toHaveProperty('apiKey');
  });

  it('rejects a defaultModel that no entry declares', () => {
    expect(() => parseExtensionConfig({ models: [MODEL], defaultModel: 'nope' })).toThrow(ExtensionConfigError);
  });

  it('rejects unknown option names instead of ignoring them', () => {
    expect(() => parseExtensionConfig({ agentRuntime: { streamming: true } })).toThrow(/not a recognized option/);
    expect(() => parseExtensionConfig({ nope: 1 })).toThrow(/not a recognized option/);
  });

  it('rejects values outside the SDK enums', () => {
    expect(() => parseExtensionConfig({ sandbox: { executor: 'in-process' } })).toThrow(/must be one of/);
    expect(() => parseExtensionConfig({ appearance: { theme: 'sepia' } })).toThrow(/must be one of/);
  });

  it('maps flat switches onto their nested runtime config paths', () => {
    const parsed = parseExtensionConfig({
      sandbox: { typescript: true, allowHttp: true, unsignedSkills: 'deny', documentSurface: true },
      privacy: { userProfile: true, encryptProfile: false },
      agentRuntime: {
        agentCapabilities: { todo: false },
        hooks: { timeoutMs: 9000 },
        multimodal: { pageImageCapture: true, imageAttachments: true }
      }
    });
    expect(parsed.runtimeConfig.sandbox).toEqual({ typescript: { enabled: true }, remoteUrl: { allowHttp: true } });
    expect(parsed.runtimeConfig.security).toEqual({ unsignedSkills: 'deny' });
    expect(parsed.runtimeConfig.documentSurface).toEqual({ enabled: true });
    expect(parsed.runtimeConfig.userProfile).toEqual({ enabled: true, encrypted: false });
    expect(parsed.runtimeConfig.multimodal).toEqual({ pageImageCapture: true, imageAttachments: true });
    expect(parsed.runtimeConfig.agentCapabilities).toEqual({ todo: false });
    expect(parsed.runtimeConfig.hooks).toEqual({ timeoutMs: 9000 });
  });

  it('accepts every control the console agent-runtime page exposes', () => {
    const parsed = parseExtensionConfig({
      agentRuntime: {
        loop: {
          maxTurns: 30,
          maxHistoryMessages: 60,
          totalTimeoutMs: 120000,
          toolTimeoutMs: 30000,
          toolResultMaxBytes: 131072,
          maxDocumentBytes: 524288,
          maxDocumentTextBytes: 131072,
          temperature: 0.3
        },
        skillState: { quarantineThreshold: 7 },
        multimodal: { maxImagesPerMessage: 6, maxImageBytes: 262144, minImageArea: 4096 }
      }
    });
    expect(parsed.runtimeConfig.loop).toEqual({
      maxTurns: 30,
      maxHistoryMessages: 60,
      totalTimeoutMs: 120000,
      toolTimeoutMs: 30000,
      toolResultMaxBytes: 131072,
      maxDocumentBytes: 524288,
      maxDocumentTextBytes: 131072,
      temperature: 0.3
    });
    expect(parsed.runtimeConfig.skillState).toEqual({ quarantineThreshold: 7 });
    expect(parsed.runtimeConfig.multimodal).toEqual({
      maxImagesPerMessage: 6,
      maxImageBytes: 262144,
      minImageArea: 4096
    });
  });

  it('rejects numbers the console UI could not produce', () => {
    expect(() => parseExtensionConfig({ agentRuntime: { loop: { temperature: 3 } } })).toThrow(/between 0 and 2/);
    expect(() => parseExtensionConfig({ agentRuntime: { loop: { maxTurns: 0 } } })).toThrow(/between 1 and 9999/);
    expect(() => parseExtensionConfig({ agentRuntime: { skillState: { quarantineThreshold: 21 } } })).toThrow(
      /between 1 and 20/
    );
  });

  it('accepts the network allow-list form of sandbox.networkPolicy', () => {
    const parsed = parseExtensionConfig({ sandbox: { networkPolicy: { allow: ['https://example.com'] } } });
    expect(parsed.runtimeConfig.sandbox.networkPolicy).toEqual({ allow: ['https://example.com'] });
  });

  describe('config.example.json', () => {
    const example = JSON.parse(readFileSync(resolve(import.meta.dirname, '../config.example.json'), 'utf8'));

    it('is accepted by the parser', () => {
      expect(() => parseExtensionConfig(example)).not.toThrow();
    });

    // 示例文件是宿主对着 Console 界面逐项核对的清单：漏一个字段就等于那一项「不可配」
    it('demonstrates every field the SDK ships a default for', () => {
      const { runtimeConfig } = parseExtensionConfig(example);
      const defaults = defaultRuntimeConfig() as unknown as Record<string, Record<string, unknown>>;
      const sections = [
        'loop',
        'interaction',
        'hooks',
        'agentCapabilities',
        'multimodal',
        'skillState',
        'appearance',
        'userProfile'
      ];
      const missing: string[] = [];
      for (const section of sections) {
        const sectionDefaults = defaults[section];
        // 分节名写错或 SDK 改了结构时，这条比「示例漏字段」更早暴露
        if (sectionDefaults === undefined) {
          missing.push(`${section} (no such section in defaultRuntimeConfig)`);
          continue;
        }
        for (const key of Object.keys(sectionDefaults)) {
          if (runtimeConfig[section]?.[key] === undefined) missing.push(`${section}.${key}`);
        }
      }
      expect(missing).toEqual([]);
    });
  });

  it('marks quick prompts as seeded so the host seed does not inject a second copy', () => {
    const parsed = parseExtensionConfig({
      quickPrompts: { limit: 4, items: [{ id: 'q1', text: { zh: '总结', en: 'Summarize' }, icon: 'page' }] }
    });
    expect(parsed.runtimeConfig.quickPromptsSeeded).toBe(true);
    expect(parsed.runtimeConfig.quickPromptLimit).toBe(4);
    expect(parsed.runtimeConfig.quickPrompts).toEqual([
      { id: 'q1', text: { zh: '总结', en: 'Summarize' }, icon: 'page' }
    ]);
  });

  it('requires both locales for quick prompt text', () => {
    expect(() => parseExtensionConfig({ quickPrompts: { items: [{ id: 'q1', text: { zh: '总结' } }] } })).toThrow(
      /text\.en must be a string/
    );
  });

  it('accepts only Chrome-compatible manifest versions', () => {
    expect(parseExtensionConfig({ manifest: { version: '1.2.3.4' } }).manifest.version).toBe('1.2.3.4');
    expect(() => parseExtensionConfig({ manifest: { version: '1.2.3.4.5' } })).toThrow(/1 and 4 dot-separated/);
    expect(() => parseExtensionConfig({ manifest: { version: '1.01' } })).toThrow(/leading zeros/);
    expect(() => parseExtensionConfig({ manifest: { version: '1.70000' } })).toThrow(/0 and 65535/);
  });
});

describe('mirrored enums', () => {
  it('stays in sync with the SDK constants the build script cannot import', () => {
    expect(MIRRORED_ENUMS.renderers).toEqual([...RUNTIME_RENDERER_IDS]);
    expect(MIRRORED_ENUMS.quickPromptIcons).toEqual([...QUICK_PROMPT_ICON_NAMES]);
  });

  it('caps the quick prompt limit at the SDK ceiling', () => {
    expect(() => parseExtensionConfig({ quickPrompts: { limit: MAX_QUICK_PROMPT_LIMIT + 1 } })).toThrow(
      /must be between 1 and 20/
    );
  });
});

describe('applyBakedDefaults', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('uses baked values when nothing was ever stored', async () => {
    const { applyBakedDefaults } = await loadMergeLayer({
      BAKED_CONFIG: { appearance: { theme: 'light' }, llm: { entries: [{ ...MODEL }], defaultId: 'm1' } }
    });
    const config = applyBakedDefaults(undefined);
    expect(config.appearance.theme).toBe('light');
    expect(config.llm.entries).toHaveLength(1);
  });

  it('lets stored user values win over baked defaults', async () => {
    const { applyBakedDefaults } = await loadMergeLayer({ BAKED_CONFIG: { appearance: { theme: 'light' } } });
    expect(applyBakedDefaults({ appearance: { theme: 'dark', locale: 'en' } }).appearance.theme).toBe('dark');
  });

  it('fills nested fields the stored config predates', async () => {
    const { applyBakedDefaults } = await loadMergeLayer({
      BAKED_CONFIG: { sandbox: { typescript: { enabled: true }, remoteUrl: { allowHttp: true } } }
    });
    // 存储里 sandbox 存在但没有 typescript 段：顶层 spread 会让整段烘焙值落空
    const config = applyBakedDefaults({ sandbox: { executor: 'blob-worker' } });
    expect(config.sandbox.executor).toBe('blob-worker');
    expect(config.sandbox.typescript.enabled).toBe(true);
    expect(config.sandbox.remoteUrl.allowHttp).toBe(true);
  });

  it('does not resurrect entries the user deleted', async () => {
    const { applyBakedDefaults } = await loadMergeLayer({
      BAKED_CONFIG: { llm: { entries: [{ ...MODEL }], defaultId: 'm1' } }
    });
    expect(applyBakedDefaults({ llm: { entries: [] } }).llm.entries).toEqual([]);
  });
});

describe('baked api keys', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('injects the decrypted key on load and keeps it out of what gets stored', async () => {
    const secrets = await bakeSecret('m1', 'sk-live-1');
    const { applyBakedDefaults, restoreBakedSecrets, stripBakedSecrets } = await loadMergeLayer({
      BAKED_CONFIG: { llm: { entries: [{ ...MODEL }], defaultId: 'm1' } },
      ...secrets
    });

    const loaded = await restoreBakedSecrets(applyBakedDefaults(undefined));
    expect(loaded.llm.entries[0]?.apiKey).toBe('sk-live-1');

    const stored = await stripBakedSecrets(loaded);
    expect(stored.llm.entries[0]?.apiKey).not.toBe('sk-live-1');
    // 落盘的占位串再读回来仍要还原成明文，否则用户配好的模型下次启动就调不通
    expect((await restoreBakedSecrets(applyBakedDefaults(stored))).llm.entries[0]?.apiKey).toBe('sk-live-1');
  });

  it('keeps a key the user typed instead of overwriting it with the baked one', async () => {
    const secrets = await bakeSecret('m1', 'sk-live-1');
    const { applyBakedDefaults, restoreBakedSecrets, stripBakedSecrets } = await loadMergeLayer({
      BAKED_CONFIG: { llm: { entries: [{ ...MODEL }], defaultId: 'm1' } },
      ...secrets
    });
    const stored = await stripBakedSecrets(applyBakedDefaults({ llm: { entries: [{ ...MODEL, apiKey: 'sk-mine' }] } }));
    expect(stored.llm.entries[0]?.apiKey).toBe('sk-mine');
    expect((await restoreBakedSecrets(stored)).llm.entries[0]?.apiKey).toBe('sk-mine');
  });

  it('treats an emptied key as an explicit removal', async () => {
    const secrets = await bakeSecret('m1', 'sk-live-1');
    const { applyBakedDefaults, restoreBakedSecrets } = await loadMergeLayer({
      BAKED_CONFIG: { llm: { entries: [{ ...MODEL }], defaultId: 'm1' } },
      ...secrets
    });
    const config = applyBakedDefaults({ llm: { entries: [{ ...MODEL, apiKey: '' }] } });
    expect((await restoreBakedSecrets(config)).llm.entries[0]?.apiKey).toBe('');
  });
});

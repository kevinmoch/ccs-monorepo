import { createRoot } from 'react-dom/client';
import { Console, createFsConsoleBackend, createFsTraceSource, createGovernanceFacade } from '@webskill/console';
import { BrowserSkillManager, createLlmClient } from '@webskill/browser';
import { WebSkillRuntime } from '@webskill/runtime';
import type { LlmClient } from '@webskill/runtime';
import { sandboxExecutorDeps } from '@webskill/chatbot';
import type { SettingsSectionId } from '@webskill/chatbot';
import {
  CHAT_ROOT,
  MANAGED_ROOT,
  SKILL_ROOTS,
  createExtensionExecutor,
  createExtensionFs,
  createExtensionRuntimeConfigStore,
  hostDataSources,
  notifySkillsChanged,
  seedExtensionSkills
} from '../shared/assembly';
import { createExtensionConnect } from '../shared/connectFacade';
import { configureLocalMonaco } from './monaco';
import '../tailwind.css';
import '@webskill/ui-kit/ui-kit.css';
import '@webskill/console/console.css';

/**
 * options 页 = console（含模型配置）。与 side panel 同源，因此**同一个 localStorage 键**：
 * 这里配好的模型 side panel 不需要任何同步代码就能读到（FR-14.9）。
 */
const fs = createExtensionFs();
// 用户可能先开 console 再开侧栏：两边都播一次，戳存在就是空跑
seedExtensionSkills(fs);
// 装/卸/发布都走这个 manager；side panel 常驻，不广播就看不见新技能
const manager = new BrowserSkillManager({
  fs,
  managedRoot: MANAGED_ROOT,
  skillRoots: SKILL_ROOTS,
  onChanged: notifySkillsChanged
});

/**
 * 治理门面要的 LLM 与评估 runtime 得在渲染前就位，所以这里先把配置读出来。
 *
 * 走 store 的 `load()` 而不是自己同步读 localStorage：打包期烘焙的 apiKey 是密文，
 * 解密要 WebCrypto（异步）。顺带也消除了「两处读同一份配置却走不同路径」的漂移面。
 */
const runtimeConfigStore = createExtensionRuntimeConfigStore();
const config = await runtimeConfigStore.load();

/** 治理侧（评估 / 候选生成）用的 LLM：取用户设为默认的那条模型配置 */
const governanceLlm = ((): LlmClient | undefined => {
  const active = config.llm.entries.find((entry) => entry.id === config.llm.defaultId) ?? config.llm.entries[0];
  // 内置模型不需要 baseUrl；其余三档没配地址就等于没配模型，构造出来只会在第一次调用时报错
  if (active === undefined) return undefined;
  if (active.provider !== 'chrome-builtin' && (active.baseUrl ?? '').trim() === '') return undefined;
  return createLlmClient(active);
})();

/**
 * 演进工作室的门面。`governanceRoot` 与 side panel 的候选收货端同为 `MANAGED_ROOT`：
 * chatbot 里生成的技能候选因此直接落进这里的审核队列。
 */
const governance = createGovernanceFacade({
  fs,
  manager,
  governanceRoot: MANAGED_ROOT,
  chatRoot: CHAT_ROOT,
  failureThreshold: config.skillState.quarantineThreshold,
  ...(governanceLlm !== undefined
    ? {
        llm: governanceLlm,
        // 与主链路同一条装配路径：只传 fs 的话，评估里的技能不受沙箱与网络策略约束
        evaluationRuntime: new WebSkillRuntime({
          fs,
          roots: SKILL_ROOTS,
          llm: governanceLlm,
          executor: createExtensionExecutor(sandboxExecutorDeps(fs, config))
        })
      }
    : {})
});

/** chatbot 的「查看候选」带 `?candidate=<id>` 打开这里（assembly 的 `openConsoleCandidate`） */
const focusCandidateId = new URLSearchParams(location.search).get('candidate');

/**
 * chatbot 各处「打开设置」带 `?page=<leaf>` 打开这里（assembly 的 `openConsolePage`）。
 * 白名单挡住任意取值：console 对非法值会静默落到技能库，那与「跳错页」看起来一模一样。
 */
const SETTINGS_PAGES = [
  'connections.models',
  'connections.mcp',
  'connections.webmcp',
  'connections.page',
  'settings.runtime',
  'settings.sandbox',
  'settings.genui',
  'settings.prompts',
  'settings.trust',
  'settings.privacy',
  'settings.appearance'
] as const satisfies readonly SettingsSectionId[];

const requestedPage = new URLSearchParams(location.search).get('page');
const initialPage = SETTINGS_PAGES.find((page) => page === requestedPage);

// 渲染前完成：晚于 console 首次挂载编辑器就来不及了，本次会话会退回被 CSP 拦掉的 CDN
configureLocalMonaco();

createRoot(document.getElementById('root')!).render(
  <Console
    backend={{
      ...createFsConsoleBackend({
        fs,
        roots: SKILL_ROOTS,
        traces: createFsTraceSource(fs, CHAT_ROOT),
        manager,
        versionStoreRoot: MANAGED_ROOT,
        chatRoot: CHAT_ROOT
      }),
      // 导入预检因此能在装之前就说出「这个技能要的 bugs 本宿主没有」（0.14.0 分册 19）
      dataSources: () => Promise.resolve(hostDataSources())
    }}
    governance={governance}
    connect={createExtensionConnect()}
    runtimeConfig={runtimeConfigStore}
    {...(focusCandidateId !== null ? { focusCandidateId, initialPage: 'governance.review' as const } : {})}
    {...(focusCandidateId === null && initialPage !== undefined ? { initialPage } : {})}
  />
);

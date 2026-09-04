import { createRoot } from 'react-dom/client';
import { Chatbot } from '@webskill/chatbot';
import type { ChatEngine } from '@webskill/chatbot';
import type { RuntimeAppearanceConfig } from '@webskill/ui-kit';
import { createSidePanelHost, loadRuntimeConfigSync, onSkillsChanged, CHAT_ROOT } from '../shared/assembly';
import { SidePanelShell } from './SidePanelShell';
import '../tailwind.css';
import '@webskill/ui-kit/ui-kit.css';
import '@webskill/chatbot/chatbot.css';

/**
 * side panel 的挂载文件。**这里不出现 `chrome.`**（AC-14.18）：
 * 扩展的全部能力都已经在 `shared/assembly.ts` 里封成普通对象，从 `adapter` 进去。
 *
 * 这条约束的作用是可机械检验的「这份 UI 能不能搬去别的宿主」——
 * 一旦这里出现一个 `chrome.tabs`，把它嵌进网页就要先动 UI。
 */
const host = createSidePanelHost();
void host.binding.bindActiveTab();

/** 首帧兜底：`useRuntimeAppearance` 读盘是异步的，不给这一份面板会先闪一下缺省主题 */
const APPEARANCE_FALLBACK: RuntimeAppearanceConfig = loadRuntimeConfigSync().appearance;

// options 页装完技能会广播过来；引擎在 onEngineReady 之后才存在，所以订阅指向一个可变引用
let engine: ChatEngine | undefined;
onSkillsChanged(() => engine?.invalidateSkills());

/**
 * 扩展 e2e 的驱动口（`sidepanel.html?e2e=1`）。
 *
 * 那套 e2e 要验的是「感知 → 确认卡 → 记住 → 撤销」这条链路，
 * 而链路的起点在真实使用中是模型的一次工具调用。为此接一个真模型会让
 * 判定依赖模型这次愿不愿意调工具——那验的就不是这条链路了。
 *
 * 挂在 window 上不放大攻击面：这是扩展自己的页面，网页脚本够不着它，
 * 能打开这个页面的人本来就能做这里的每一件事。同款先例见 playground 的 `?hostPage=1`。
 */
if (new URLSearchParams(location.search).get('e2e') === '1') {
  (globalThis as unknown as Record<string, unknown>)['__webskillExtensionHost'] = host;
}

// 面板里只有对话：绑定跟着浏览器的活动标签页走，没有需要用户操作的绑定条了
createRoot(document.getElementById('root')!).render(
  <SidePanelShell
    runtimeConfig={host.runtimeConfig}
    candidates={host.candidates}
    agentFocus={host.agentFocus}
    fallback={APPEARANCE_FALLBACK}
  >
    <Chatbot
      adapter={host.adapter}
      config={{
        chatRoot: CHAT_ROOT,
        runtimeConfig: host.runtimeConfig,
        skillCandidates: host.skillCandidates,
        // 注入才有 context.fetchData；能力开关另在设置 › 沙箱里，缺省仍关
        fetchData: host.fetchData,
        // 缺源时激活回执里会直说缺哪个，模型不再拿一句 DATA_SOURCE_NOT_FOUND 自己编
        dataSources: host.dataSources,
        executorFactory: host.executorFactory
      }}
      // 「打开设置」与扩展菜单里的「选项」落到同一个页面（D-14-6）；
      // 分区要一路带过去，否则「配置大模型」会停在 console 的缺省页（技能库）
      onOpenSettings={(section) => host.openConsolePage(section)}
      // 侧栏页弹不出权限框，把用户带到能弹的地方去（FR-10.2 / FR-14.7）
      onDictationPermissionDenied={() => host.openMicrophonePermissionPage()}
      onCameraPermissionDenied={() => host.openCameraPermissionPage()}
      onEngineReady={(ready) => {
        engine = ready;
        // 页面操作的确认卡走引擎的交互桥，与技能能力授权同一套观感
        host.pageActionUi.current = ready.bridge;
      }}
    />
  </SidePanelShell>
);

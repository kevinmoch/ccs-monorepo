import type { JSX, ReactNode } from 'react';
import { ThemeScope, useRuntimeAppearance } from '@webskill/ui-kit';
import type { RuntimeAppearanceConfig, RuntimeConfigStore } from '@webskill/ui-kit';
import { DataSourceCandidates } from './DataSourceCandidates';
import { AgentFocusNotice } from './AgentFocusNotice';
import type { AgentFocusPort, DataSourceCandidatesPort } from '../shared/assembly';

export interface SidePanelShellProps {
  runtimeConfig: RuntimeConfigStore;
  candidates: DataSourceCandidatesPort;
  /** 模型焦点与用户视线不一致时的提示条（0.16.0 FR-11.7） */
  agentFocus: AgentFocusPort;
  /** 首帧兜底：读盘是异步的，没有它面板会先闪一下缺省主题 */
  fallback: RuntimeAppearanceConfig;
  children: ReactNode;
}

/**
 * 面板外壳。存在的理由只有一个：候选源区块是挂在 `Chatbot` **旁边**的自绘区块，
 * 而语义色 token 靠祖先链上的 `.dark` 取值——`Chatbot` 自带的那层 `ThemeScope`
 * 罩不到它，不另外套一层它在暗色下就是一块白斑。
 *
 * 主题与语言都从同一份运行时配置里读，用户在控制台里一改这里立刻跟着变；
 * 装配期读一次固化下来的话，切语言要重开面板才生效。
 */
export function SidePanelShell({
  runtimeConfig,
  candidates,
  agentFocus,
  fallback,
  children
}: SidePanelShellProps): JSX.Element {
  const { appearance } = useRuntimeAppearance(runtimeConfig, fallback);
  return (
    <ThemeScope theme={appearance.theme} className="flex h-full flex-col bg-background text-foreground">
      <AgentFocusNotice port={agentFocus} locale={appearance.locale} />
      <DataSourceCandidates port={candidates} locale={appearance.locale} />
      <div className="min-h-0 flex-1">{children}</div>
    </ThemeScope>
  );
}

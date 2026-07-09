import { requestShellMenuNavigate } from '@ccs/shared';
import type { Language } from '@ccs/shared';

/**
 * 通过宿主框架(ccs-framework) Store Broker 广播的 menu1~menu7 节点结构。
 * 与 apps/ccs-framework/src/lib/menu-utils.ts 的 SerializableMenuNode 保持一致（不含 icon 等不可序列化字段）。
 */
export interface ShellMenuNode {
  id: string;
  title: { zh: string; en: string };
  url?: string;
  disabled?: boolean;
  seperateLine?: string[];
  children?: ShellMenuNode[];
  submenu?: ShellMenuNode[];
}

/** 按 seperateLine 中出现的 id，将 items 切分为左右两段（复刻宿主 menu-utils.ts 的 getSplitItems）。 */
export function splitBySeperateLine(items: ShellMenuNode[] = [], seperateLine?: string[]) {
  if (!seperateLine || seperateLine.length === 0) return { leftItems: items, rightItems: [] as ShellMenuNode[] };
  const splitIndex = items.findIndex((item) => seperateLine.includes(item.id));
  if (splitIndex === -1) return { leftItems: items, rightItems: [] as ShellMenuNode[] };
  return { leftItems: items.slice(0, splitIndex), rightItems: items.slice(splitIndex) };
}

/** 根据当前语言取出节点的本地化标题。 */
export function pickTitle(node: Pick<ShellMenuNode, 'title'>, language: Language): string {
  return language === 'en-US' ? node.title.en : node.title.zh;
}

/** 在宿主 menu1~menu7 树中按 id 查找节点。 */
export function findMenuNode(nodes: ShellMenuNode[] = [], id: string): ShellMenuNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.children) {
      const found = findMenuNode(node.children, id);
      if (found) return found;
    }
    if (node.submenu) {
      const found = findMenuNode(node.submenu, id);
      if (found) return found;
    }
  }
  return undefined;
}

export const MENU_ITEM_WRAP_COUNT = 7; // 超过多少个子节点时，PortalArchitectureCard 的卡片布局会变为多列显示

/**
 * 点击菜单链接：请求宿主框架(ccs-framework)进行菜单级导航。
 * 效果等同于用户点击了左侧/右侧侧边栏中对应的菜单链接。
 */
export function handleNavigate(leaf: ShellMenuNode) {
  if (!leaf.url || leaf.disabled) return;
  requestShellMenuNavigate({ id: leaf.id, url: leaf.url });
}

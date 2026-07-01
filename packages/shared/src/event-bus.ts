export const CCS_EVENTS = { THEME_CHANGE: 'ccs:theme-change', LANGUAGE_CHANGE: 'ccs:language-change', NAVIGATE: 'ccs:navigate' } as const;

/** 内嵌模块向宿主框架(ccs-framework)请求菜单级导航时使用的 postMessage 类型。 */
export const CCS_SHELL_MENU_NAVIGATE_MESSAGE = 'CCS_MENU_NAVIGATE';

export interface CcsMenuNavigateTarget {
  /** 菜单节点 id，需与宿主 menuData（menu1~menu7）中的 id 保持一致，用于同步侧边栏展开/高亮状态。 */
  id: string;
  /** 目标路由地址，例如 'ccs-module-test/sample'。 */
  url: string;
}

/**
 * 从内嵌模块内部请求宿主框架进行菜单级导航。
 *
 * 效果等同于用户直接点击了宿主左侧/右侧侧边栏中对应的菜单链接：宿主会切换主内容区域，
 * 并同步侧边栏的展开状态与高亮项。仅在当前窗口确实运行于 iframe 中时才会发送消息。
 */
export function requestShellMenuNavigate(target: CcsMenuNavigateTarget): void {
  if (typeof window === 'undefined' || window.top === window.self) return;
  try {
    window.top?.postMessage({ type: CCS_SHELL_MENU_NAVIGATE_MESSAGE, menuId: target.id, url: target.url }, '*');
  } catch {
    // 忽略跨域/不可用场景
  }
}

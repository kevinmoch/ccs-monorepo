import type { PageActionScopeInput } from '@webskill/sdk/agent';

/**
 * 帧内声明的**可操作**范围。
 *
 * 由帧内声明而不是随请求传入：从请求里读它等于让发请求的一方自行宣称自己能操作什么，
 * 那是权限提升而不是配置。外壳侧 `pageAccess.ts` 另有一份同口径的声明喂给策略层，
 * 两份是**各自独立的闸门**，不是一份配置的两个副本——外壳那份被绕过时这份仍然生效。
 *
 * 可感知范围仍随请求传入（那是 SDK 的 `PageAgentRequest` 契约），
 * 因为「读什么」由外壳的白名单决定，而外壳是本扩展唯一认可的请求方（service worker 校验）。
 */
export const ERP_ACTION_SCOPE: PageActionScopeInput = {
  include: ['body'],
  exclude: ['input[type=password]', 'input[type=hidden]', '[autocomplete^="cc-"]', '[data-ccs-no-ai]']
};

/**
 * 角色提升逃生舱。
 *
 * SDK 的 `promoteRoles` 内置通用可交互信号（click 监听器、cursor: pointer、tabindex、
 * title、class/id 里的交互语义词根），常见的可点 div、图片链接不需要在这里枚举 class
 * ——枚举打不完变体。只有当某个元素所有内置信号都不带时才在这里显式声明。
 * 改动它即改动模型的可操作面。
 */
export const ERP_ROLE_HINTS: readonly { role: string; selectors: readonly string[] }[] = [];

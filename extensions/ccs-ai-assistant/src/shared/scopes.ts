import type { PageActionScopeInput, PerceptionScopeInput } from '@webskill/agent';

/**
 * 兜底剪除名单（FR-14.5）。示例作用于任意站点，事先不知道页面长什么样，
 * 所以这份名单按**语义**而不是按站点写：凡是浏览器自己就标成凭据 / 支付的控件，
 * 一律先剪掉。它不是安全边界（真正的边界是 `secret` 判定与确认卡），
 * 而是"别把不该进上下文的东西喂给模型"的第一道闸。
 *
 * **不按 `autocomplete="new-password"` / `"current-password"` 剪。**
 * Chrome 忽略 `autocomplete="off"`，于是大量企业组件库（金蝶苍穹、Ant Design 之流）
 * 改用这两个值来关掉自动填充，并把它们挂在**普通文本框**上——照它剪，整张表单
 * 在模型眼里就消失了（苍穹一页 25 个控件，13 个是这么没的）。
 * 真密码框一定是 `type="password"`，已被第一条覆盖；明文 type 的框不可能是密码。
 * `one-time-code` 不同：验证码框本就是明文 type，除了 autocomplete 没别的凭据可认。
 */
export const SENSITIVE_EXCLUDE: readonly string[] = [
  'input[type="password"]',
  'input[autocomplete="one-time-code"]',
  '[autocomplete^="cc-"]',
  'input[name*="cvc" i]',
  'input[name*="cvv" i]',
  'input[name*="cardnumber" i]',
  '[data-webskill-private]'
];

/**
 * 感知范围。`include: ['body']` 而不是 `'*'`：每个 include 命中都是一条**独立的遍历根**，
 * `'*'` 会让同一棵子树按祖先深度重复出现。
 */
export const PERCEPTION_SCOPE: PerceptionScopeInput = {
  include: ['body'],
  exclude: [...SENSITIVE_EXCLUDE]
};

/**
 * 操作范围。与感知范围**分开声明**，不是同一个对象引用（AC-14.7）。
 *
 * 这两份现在恰好长得一样，但它们回答的是两个问题：能读什么、能动什么。
 * 合成一处会让下一个抄这份示例的人以为"可读即可操作"，
 * 而这正是 `PageActionScope` 存在的原因。
 */
export const ACTION_SCOPE: PageActionScopeInput = {
  include: ['body'],
  exclude: [...SENSITIVE_EXCLUDE]
};

/**
 * 一次页面操作之后，最多等多久看有没有下载落盘（0.15.0 分册 15 · FR-15.3）。
 *
 * 由**宿主**定而不是模型定：这是一段真实的墙钟等待，让模型能指定就等于给了它
 * 一个免费的定时器。SDK 侧还会把它夹在 `[DOWNLOAD_WAIT_MIN_MS, DOWNLOAD_WAIT_MAX_MS]` 内。
 */
export const DOWNLOAD_WAIT_MS = 1500;

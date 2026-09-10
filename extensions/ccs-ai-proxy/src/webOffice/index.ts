/**
 * MAIN world 的 WebOffice 入口（产物 `content/web-office.js`）。
 *
 * 整份产物跑在页面自己的 JS 世界里，因此不许出现任何 SDK 运行时值——
 * 类型可以（`import type` 会被擦掉），值不行。`vite.config.mjs` 里这一路
 * 不配任何别名，靠的就是这一点。
 *
 * 与 `dom-agent.js` 分开成两个脚本，是因为那一份带着整个 `@webskill/browser`，
 * 而 hook 必须在页面脚本之前就位、且零依赖。两者都在 `document_start`。
 *
 * 顺序无所谓：ESM 的 import 会被提升，两者又互不相干（包 SDK 工厂 / 包 fetch）。
 */

import { installWebOfficeHook } from './hook';
import { installWebOfficePdfSniffer } from './pdfSniffer';

installWebOfficeHook();
installWebOfficePdfSniffer();

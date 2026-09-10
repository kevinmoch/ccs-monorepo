/**
 * MAIN world 脚本的唯一入口（`probe.js`）。
 *
 * 这个包里的每一份代码都跑在**页面自己的 JS 世界**里，因此整份产物
 * 不许出现任何 SDK 运行时值——类型可以（`import type` 会被擦掉），值不行。
 * `vite.probe.config.ts` 刻意不配 SDK 别名，仓库根 `test/webOfficeMirrors.test.ts` 另有守卫。
 *
 * 这里不安排「谁先谁后」：ESM 的 import 会被提升，写在下面的 import 一样先执行，
 * 靠语句顺序表达优先级只会得到一个看起来有意义、实际无效的注释。
 * 三者互不相干（改原型 / 占全局属性 / 包 fetch），本脚本又整体跑在 `document_start`，
 * 页面脚本还没开始，先后无所谓。
 */

// click 探针与页面宿主锚点：模块级副作用，import 即安装（原样保留 0.14.0 的形态）
import './clickProbe';
import { installWebOfficeHook } from './webOfficeHook';
import { installWebOfficePdfSniffer } from './webOfficePdfSniffer';

declare const __WEBSKILL_WEBOFFICE_PROBE__: boolean;

installWebOfficeHook();
installWebOfficePdfSniffer();

// 前置探明脚本（FR-12.5a）。用**动态** import：静态 import 会被提升到分支之外，
// 能不能摧掉就变成一个只能事后验证的副作用；`if (false)` 包住动态 import 则是确定的消除。
if (__WEBSKILL_WEBOFFICE_PROBE__) {
  void import('./webOfficeProbeReport').then(({ installWebOfficeProbeReport }) => {
    installWebOfficeProbeReport();
  });
}

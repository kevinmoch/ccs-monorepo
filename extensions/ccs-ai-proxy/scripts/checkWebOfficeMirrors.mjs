/**
 * MAIN 侧镜像与 SDK 真源的逐条比对。
 *
 * `src/webOffice/bridge.ts` 里那两份常量是 SDK 声明的副本——MAIN 侧的桥
 * `document_start` 注入到每一帧，把 `@webskill/browser` 的类型图拖进去等于
 * 让每次导航都多下载一份用不上的代码，所以只能抄。
 *
 * 抄来的东西不靠自觉同步：本脚本读的是**两处独立声明**，任何一侧改了另一侧不跟就非零退出。
 * SDK 那边（web-skill-sdk 仓）有同名守卫盯着 `browser-extension`；本仓这一份盯的是自己。
 */

import { WEB_OFFICE_OFFICE_TYPES, WEB_OFFICE_READ_METHODS } from '@webskill/sdk/browser';
import { WEB_OFFICE_OFFICE_TYPE_MIRROR, WEB_OFFICE_READ_METHOD_MIRROR } from '../src/webOffice/bridge.ts';

const problems = [];

const truthMethods = [...Object.values(WEB_OFFICE_READ_METHODS)].sort();
const mirrorMethods = [...WEB_OFFICE_READ_METHOD_MIRROR].sort();
if (JSON.stringify(truthMethods) !== JSON.stringify(mirrorMethods)) {
  problems.push(
    `WEB_OFFICE_READ_METHOD_MIRROR is out of sync with the SDK read-method whitelist.\n` +
      `  missing in mirror: ${JSON.stringify(truthMethods.filter((m) => !mirrorMethods.includes(m)))}\n` +
      `  extra in mirror:   ${JSON.stringify(mirrorMethods.filter((m) => !truthMethods.includes(m)))}`
  );
}

const truthTypes = JSON.stringify(WEB_OFFICE_OFFICE_TYPES, Object.keys(WEB_OFFICE_OFFICE_TYPES).sort());
const mirrorTypes = JSON.stringify(WEB_OFFICE_OFFICE_TYPE_MIRROR, Object.keys(WEB_OFFICE_OFFICE_TYPE_MIRROR).sort());
if (truthTypes !== mirrorTypes) {
  problems.push(
    `WEB_OFFICE_OFFICE_TYPE_MIRROR is out of sync with the SDK OfficeType enum.\n` +
      `  sdk:    ${truthTypes}\n  mirror: ${mirrorTypes}`
  );
}

if (problems.length > 0) {
  console.error(`WebOffice mirror check failed (${problems.length}):\n\n${problems.join('\n\n')}`);
  process.exit(1);
}

console.log(
  `WebOffice mirrors match the SDK: ${mirrorMethods.length} read methods, ${Object.keys(WEB_OFFICE_OFFICE_TYPE_MIRROR).length} office types.`
);

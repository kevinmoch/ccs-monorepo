/**
 * 把 `SANDBOX_PAGE_SCRIPT_SOURCE`（分册 12 FR-12.3）落成扩展里的一个真实文件。
 *
 * 不手写副本：沙箱页脚本是**协议的一半**（信封名、channelId 闩锁、
 * `sandbox-init` 的字段名都要与 `createIframeWorker` 对得上），
 * 手抄一份就是等着它与包里那份漂移，而漂移的症状是"沙箱一直不 ready"，
 * 极难反推到"两边的常量不一样了"。
 *
 * 产物**入库**：AC-14.3 的一致性校验跑在 CI 单测里，那里不执行本脚本。
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SANDBOX_PAGE_SCRIPT_SOURCE } from '@webskill/sdk/browser';

const here = dirname(fileURLToPath(import.meta.url));
const target = resolve(here, '../src/sandbox/sandbox.js');

// 不加任何 banner：AC-14.3 要求盘上这份与常量**逐字**相等，
// 一行 "DO NOT EDIT" 注释就会让那条判据失效。防手改靠的是那条守卫测试本身。
let current = '';
try {
  current = readFileSync(target, 'utf8');
} catch {
  // 首次生成
}
if (current === SANDBOX_PAGE_SCRIPT_SOURCE) {
  console.log(`sandbox.js already up to date: ${target}`);
} else {
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, SANDBOX_PAGE_SCRIPT_SOURCE);
  console.log(`sandbox.js written: ${target}`);
}

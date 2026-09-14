/**
 * 把投放面的 `img-src` 结论写进扩展 manifest 的 sandbox CSP（0.22.0 分册 13 FR-13.9）。
 *
 * 为什么要生成而不是手写：扩展的 sandbox CSP 此前**整条 `img-src` 都不存在**，
 * 也没有 `default-src` 兜底，等于默认放行一切；而纯 Web 宿主那侧写死的是 `${host} data:`。
 * 两套宿主对「投放面能加载哪些图」给出了完全不同的答案，却从来没有人把它们放在一起看过。
 * 生成让它们出自同一份常量，`test/browserExtension.test.ts` 的守卫再读**两侧的实际值**比对
 * （AC-13.8）——只断言常量等于字面量的守卫在 0.21.0 分册 15 的漂移事故里是绿的。
 *
 * 只重写 `img-src` 这一条指令，其余照旧：sandbox token 是宿主自己的决定
 * （`allow-forms` / `allow-popups` 就是扩展特有的），一并生成等于替宿主拿主意。
 *
 * 取值来自**已发布**的 `@webskill/sdk/browser`（与 `writeSandboxScript.mjs` 同一条路子）：
 * 本工程编译的就是那个包，读别处等于给自己造一个与实际产物无关的答案。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VIEWER_IMG_SRC_BASE, VIEWER_IMG_SRC_REMOTE } from '@webskill/sdk/browser';

const here = dirname(fileURLToPath(import.meta.url));
const target = resolve(here, '../manifest.json');

/**
 * 扩展侧的 `img-src`。`'self'` 是扩展自身的 origin——sandbox 页在 MV3 下
 * 仍按扩展 URL 解析 `'self'`，与站点那侧「opaque origin 匹配不上 `'self'`」的坑不同。
 * 降级形态（抓不到字节时留外链，FR-13.6）需要 `VIEWER_IMG_SRC_REMOTE`。
 */
const IMG_SRC = `img-src 'self' ${[...VIEWER_IMG_SRC_BASE, ...VIEWER_IMG_SRC_REMOTE].join(' ')}`;

const source = readFileSync(target, 'utf8');
const manifest = JSON.parse(source);
const csp = manifest.content_security_policy?.sandbox;
if (typeof csp !== 'string') {
  console.error(`manifest.json has no content_security_policy.sandbox: ${target}`);
  process.exit(1);
}

const directives = csp
  .split(';')
  .map((part) => part.trim())
  .filter((part) => part !== '');
const index = directives.findIndex((part) => part === 'img-src' || part.startsWith('img-src '));
if (index === -1) directives.push(IMG_SRC);
else directives[index] = IMG_SRC;

const next = `${directives.join('; ')};`;
if (next === csp) {
  console.log(`manifest img-src already up to date: ${target}`);
  process.exit(0);
}

manifest.content_security_policy.sandbox = next;
// 只换 CSP 那一个字符串字面量，不重新序列化整份 JSON：
// JSON.stringify 会把 prettier 排成一行的数组全部展开，制造一次与本次改动无关的全文件 diff
writeFileSync(target, source.replace(JSON.stringify(csp), JSON.stringify(next)));
console.log(`manifest img-src written: ${next}`);

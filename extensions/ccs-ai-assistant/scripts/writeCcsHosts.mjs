/**
 * 把 monorepo 根 `.env` 里的 CCS 站点地址落成扩展里的一份常量。
 *
 * 单一事实源是 `.env`：那里改了域名，扩展跟着变，不必再去源码里找第二处。
 * 产物**入库**，因为 `.env` 不入库——别人 clone 下来没有它，构建也不能因此
 * 把域名清单清空（那会让水印隐藏悄无声息地失效）。所以 `.env` 缺失时保留盘上那份。
 *
 * `.env` 里同一个键出现多次（内网一份、生产一份），dotenv 那套「后者覆盖前者」
 * 会丢掉内网那份，所以这里自己逐行扫，把**所有**取值都收进来。
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(here, '../../../.env');
const target = resolve(here, '../src/shared/ccsHosts.ts');
const KEYS = ['CCS_BASE_URL', 'CCS_TENANT_URL'];

let env = '';
try {
  env = readFileSync(envPath, 'utf8');
} catch {
  console.log(`ccsHosts.ts left as is: ${envPath} not found`);
  process.exit(0);
}

const hosts = new Set();
for (const line of env.split('\n')) {
  const match = /^\s*([A-Z_]+)\s*=\s*(\S+)\s*$/.exec(line);
  if (match === null || !KEYS.includes(match[1])) continue;
  try {
    hosts.add(new URL(match[2]).host);
  } catch {
    console.warn(`Skipped unparsable ${match[1]}: ${match[2]}`);
  }
}

const list = [...hosts].sort();
const body = list.length === 0 ? '[]' : `[\n${list.map((h) => `  '${h}'`).join(',\n')}\n]`;
const source = `// 由 scripts/writeCcsHosts.mjs 从 monorepo 根 .env 生成，勿手改。
// 来源键：${KEYS.join('、')}

/** CCS 自家站点的 host（含端口）。内网与生产都算 */
export const CCS_HOSTS: readonly string[] = ${body};
`;

let current = '';
try {
  current = readFileSync(target, 'utf8');
} catch {
  // 首次生成
}
if (current === source) {
  console.log(`ccsHosts.ts already up to date: ${list.length} host(s)`);
} else {
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, source);
  console.log(`ccsHosts.ts written: ${list.join(', ')}`);
}

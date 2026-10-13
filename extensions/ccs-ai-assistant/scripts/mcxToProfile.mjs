/**
 * 跨平台启动 vendored 的 `mcxToProfile.py`。
 *
 * 为什么不能直接写 `./mcxToProfile.py`：那个文件的 shebang 写死 `/opt/homebrew/bin/python3`，靠可执行位运行，
 * 只有 macOS 认。Windows 既不认 shebang 也没有可执行位，cmd.exe 会把 `./mcxToProfile.py` 判成
 * 「'.' 不是内部或外部命令」，`pnpm mobileconfig` 直接失败。
 *
 * 本脚本按 python3 → `/opt/homebrew/bin/python3`（原 shebang） → `py -3` → python 的顺序探测一个 Python 3
 * 解释器再显式调用它，两端走同一条路径。
 * `--plist` 模式只用标准库（`plistlib`），不需要 PyObjC，所以探测只看版本号。
 * 环境变量 `WEBSKILL_PYTHON` 可指定解释器（路径或命令名），优先级最高。
 */
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const script = resolve(root, 'mcxToProfile.py');

// 每一项是 [命令, 前置参数]；`py -3` 是 Windows 官方 launcher，显式落到 Python 3。
// 排在裸 `python` 之前：某些 Windows 机器上 `python` 是应用商店的占位别名。
// `/opt/homebrew/bin/python3` 是 mcxToProfile.py 原来 shebang 写死的解释器，留作兜底，
// 免得 PATH 里没有 python3 的 macOS 环境因为换掉 shebang 反而退步。
const candidates = [
  [process.env.WEBSKILL_PYTHON, []],
  ['python3', []],
  ['/opt/homebrew/bin/python3', []],
  ['py', ['-3']],
  ['python', []]
].filter(([command]) => typeof command === 'string' && command.trim() !== '');

const probe = 'import sys; raise SystemExit(0 if sys.version_info[0] >= 3 else 1)';

let interpreter;
for (const [command, prefix] of candidates) {
  const found = spawnSync(command, [...prefix, '-c', probe], { stdio: 'ignore' });
  if (found.status === 0) {
    interpreter = [command, prefix];
    break;
  }
}

if (interpreter === undefined) {
  const tried = candidates.map(([command]) => command).join(', ');
  console.error(
    `No Python 3 interpreter found (tried: ${tried}).\n` +
      'Install Python 3, or point WEBSKILL_PYTHON at one, then re-run: pnpm mobileconfig'
  );
  process.exit(1);
}

const [command, prefix] = interpreter;
const run = spawnSync(command, [...prefix, script, ...process.argv.slice(2)], { stdio: 'inherit' });
process.exit(run.status ?? 1);

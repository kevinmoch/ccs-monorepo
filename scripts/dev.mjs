import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 跨平台取仓库根目录：dirname 是 scripts/，再向上一级即为 repoRoot。
// 不要用 replace(/\/scripts$/)，Windows 下 fileURLToPath 返回反斜杠路径会匹配失败。
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function startDev({ ssl = false, sslModules = false, sdk = false, args = [] } = {}) {
  const isWindows = process.platform === 'win32';
  const spawnArgs = ['exec', 'turbo', 'run', 'dev', '--filter=ccs-framework', '--filter=ccs-module-*', ...args];

  const env = { ...process.env };
  if (ssl) {
    env.CCS_DEV_SSL = 'true';
  }
  if (sslModules) {
    env.CCS_DEV_SSL_MODULES = 'true';
  }
  if (sdk) {
    // webskill SDK 源码联调：指向本地 SDK 仓库（默认与 monorepo 平级的 ../web-skill-sdk，
    // 可用 WEBSKILL_SRC 环境变量覆盖）。不传这个 flag 时 @webskill/* 走 node_modules 发布版。
    // 必须给绝对路径——vite 在子应用目录里求值相对路径会错位。
    const sdkPath = path.resolve(repoRoot, process.env.WEBSKILL_SRC ?? '../web-skill-sdk');
    if (!existsSync(sdkPath)) {
      console.error(
        `[ccs] --sdk 需要本地 webskill SDK 仓库，未找到：${sdkPath}\n      可用 WEBSKILL_SRC=<SDK 路径> 指定。`
      );
      process.exit(1);
    }
    env.WEBSKILL_SRC = sdkPath;
  }

  const child = spawn('pnpm', spawnArgs, {
    stdio: 'inherit',
    shell: isWindows,
    env
  });

  const forwardSignal = (signal) => {
    if (!child.killed) child.kill(signal);
  };

  process.on('SIGINT', forwardSignal);
  process.on('SIGTERM', forwardSignal);

  child.on('error', (error) => {
    console.error('[ccs] failed to start dev servers:', error);
    process.exit(1);
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}

const extraArgs = process.argv.slice(2);
const useSsl = extraArgs.includes('--ssl');
const useSslAll = extraArgs.includes('--ssl-all');
const useSdk = extraArgs.includes('--sdk');
// --ssl-all implies --ssl for ccs-framework
const effectiveSsl = useSsl || useSslAll;
const turboArgs = extraArgs.filter((a) => a !== '--ssl' && a !== '--ssl-all' && a !== '--sdk');
startDev({ ssl: effectiveSsl, sslModules: useSslAll, sdk: useSdk, args: turboArgs });

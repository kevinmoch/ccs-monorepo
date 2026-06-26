import { spawn } from 'node:child_process';

function startDev({ ssl = false, sslModules = false, args = [] } = {}) {
  const isWindows = process.platform === 'win32';
  const spawnArgs = ['exec', 'turbo', 'run', 'dev', '--filter=ccs-framework', '--filter=ccs-module-*', ...args];

  const env = { ...process.env };
  env.CCS_MONOREPO = 'true';
  if (ssl) {
    env.CCS_DEV_SSL = 'true';
  }
  if (sslModules) {
    env.CCS_DEV_SSL_MODULES = 'true';
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
// --ssl-all implies --ssl for ccs-framework
const effectiveSsl = useSsl || useSslAll;
const turboArgs = extraArgs.filter((a) => a !== '--ssl' && a !== '--ssl-all');
startDev({ ssl: effectiveSsl, sslModules: useSslAll, args: turboArgs });

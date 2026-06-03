import { spawn } from 'node:child_process';

function startDev({ ssl = false, args = [] } = {}) {
  const isWindows = process.platform === 'win32';
  const spawnArgs = [
    'exec',
    'turbo',
    'run',
    'dev',
    '--filter=ccs-framework',
    '--filter=ccs-module-*',
    ...args,
  ];

  const env = { ...process.env };
  if (ssl) {
    env.CCS_DEV_SSL = 'true';
  }

  const child = spawn('pnpm', spawnArgs, {
    stdio: 'inherit',
    shell: isWindows,
    env,
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
const turboArgs = extraArgs.filter((a) => a !== '--ssl');
startDev({ ssl: useSsl, args: turboArgs });
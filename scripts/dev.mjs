import { spawn } from 'node:child_process';

const isWindows = process.platform === 'win32';
const args = [
  'exec',
  'turbo',
  'run',
  'dev',
  '--filter=ccs-framework',
  '--filter=ccs-module-*',
  ...process.argv.slice(2),
];

const child = spawn('pnpm', args, {
  stdio: 'inherit',
  shell: isWindows,
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
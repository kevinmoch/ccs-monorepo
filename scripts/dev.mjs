import { spawn } from 'node:child_process';

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const args = [
  'exec',
  'turbo',
  'run',
  'dev',
  '--filter=ccs-framework',
  '--filter=ccs-module-*',
  ...process.argv.slice(2),
];

const child = spawn(pnpm, args, {
  stdio: 'inherit',
  shell: false,
});

const forwardSignal = (signal) => {
  if (!child.killed) child.kill(signal);
};

process.on('SIGINT', forwardSignal);
process.on('SIGTERM', forwardSignal);

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
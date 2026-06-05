import { spawnSync } from 'node:child_process';

const root = process.cwd();

// 注入模拟器文档服务器地址，Vite 构建时通过 loadEnv → define 写入客户端代码
const env = {
  ...process.env,
  OFFLINE_DOCS_ANDROID: 'https://10.0.2.2:8080',
};

const result = spawnSync('node', ['scripts/build-android.mjs'], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env,
});

process.exit(result.status ?? 1);

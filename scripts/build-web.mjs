import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const appsDir = join(process.cwd(), 'apps');
const filters = ['ccs-framework'];

for (const dir of readdirSync(appsDir)) {
  if (!dir.startsWith('ccs-module-')) continue;
  const packageFile = join(appsDir, dir, 'package.json');
  if (!existsSync(packageFile)) continue;
  const pkg = JSON.parse(readFileSync(packageFile, 'utf8'));
  filters.push(pkg.name ?? dir);
}

const result = spawnSync('pnpm', [...filters.flatMap((name) => ['--filter', name]), 'build'], { stdio: 'inherit', shell: process.platform === 'win32' });
process.exit(result.status ?? 1);

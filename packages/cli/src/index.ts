#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Command } from 'commander';
import { copyTemplate, displayPath, findRepoRoot, insertBeforeMarker } from './fs.js';
import { moduleBaseRoute, titleFromName, toKebabCase, toPascalCase } from './utils.js';

const program = new Command();

program.name('ccs').description('CCS monorepo engineering CLI').version('0.1.0');

const create = program.command('create').description('create modules, pages and cards');

create
  .command('module')
  .argument('<name>', 'module package name, e.g. ccs-module-order')
  .option('-p, --port <port>', 'dev server port', '5175')
  .option('-t, --title <title>', 'module title')
  .action((name: string, options: { port: string; title?: string }) => {
    const root = findRepoRoot();
    const kebab = toKebabCase(name);
    const title = options.title ?? titleFromName(kebab.replace(/^ccs-module-/, ''));
    const baseRoute = moduleBaseRoute(kebab);
    const port = Number(options.port);
    const target = join(root, 'apps', kebab);

    if (existsSync(target)) throw new Error(`${displayPath(target, root)} already exists`);

    copyTemplate(join(root, 'templates', 'module-vue'), target, {
      __MODULE_NAME__: kebab,
      __MODULE_TITLE__: title,
      __MODULE_BASE_ROUTE__: baseRoute,
      __MODULE_DEV_PORT__: String(port)
    });

    insertBeforeMarker(
      join(root, 'apps', 'ccs-framework', 'src', 'modules', 'registry.ts'),
      '// ccs-cli:module',
      `  createVueModuleManifest({
    name: '${kebab}',
    title: '${title}',
    url: import.meta.env.DEV ? 'http://localhost:${port}' : '/${kebab}/',
    baseRoute: '${baseRoute}',
    devPort: ${port}
  }),`
    );

    console.log(`Created module ${kebab}`);
  });

create
  .command('page')
  .argument('<name>', 'page name, e.g. dashboard')
  .option('-m, --module <module>', 'target module package', 'ccs-module-demo')
  .option('-t, --title <title>', 'page title')
  .action((name: string, options: { module: string; title?: string }) => {
    const root = findRepoRoot();
    const moduleName = toKebabCase(options.module);
    const pageName = toKebabCase(name);
    const pascal = toPascalCase(pageName);
    const title = options.title ?? titleFromName(pageName);
    const targetDir = join(root, 'apps', moduleName, 'src', 'pages', pageName);

    if (existsSync(targetDir)) {
      console.log(`Page ${pageName} already exists in ${moduleName}, skipped.`);
      return;
    }

    copyTemplate(join(root, 'templates', 'page'), targetDir, {
      __PAGE_NAME__: pageName,
      __PAGE_PASCAL__: pascal,
      __PAGE_TITLE__: title
    });

    insertBeforeMarker(
      join(root, 'apps', moduleName, 'src', 'router', 'index.ts'),
      '// ccs-cli:route',
      `    {
      path: '/${pageName}',
      name: '${pascal}',
      component: () => import('../pages/${pageName}/${pascal}Page.vue')
    },`
    );

    console.log(`Created page ${pageName} in ${moduleName}`);
  });

create
  .command('card')
  .argument('<name>', 'card name, e.g. user-stat')
  .option('-m, --module <module>', 'target module package', 'ccs-module-demo')
  .option('-t, --title <title>', 'card title')
  .action((name: string, options: { module: string; title?: string }) => {
    const root = findRepoRoot();
    const moduleName = toKebabCase(options.module);
    const cardName = toKebabCase(name);
    const pascal = toPascalCase(cardName);
    const title = options.title ?? titleFromName(cardName);
    const cardsDir = join(root, 'apps', moduleName, 'src', 'cards');
    const target = join(cardsDir, `${pascal}Card.vue`);

    if (existsSync(target)) throw new Error(`${displayPath(target, root)} already exists`);

    copyTemplate(join(root, 'templates', 'card'), cardsDir, {
      __CARD_NAME__: cardName,
      __CARD_PASCAL__: pascal,
      __CARD_TITLE__: title
    });

    insertBeforeMarker(join(cardsDir, 'index.ts'), '// ccs-cli:card-import', `import ${pascal}Card from './${pascal}Card.vue';`);
    insertBeforeMarker(join(cardsDir, 'index.ts'), '// ccs-cli:card-register', `  '${cardName}': ${pascal}Card,`);

    console.log(`Created card ${cardName} in ${moduleName}`);
  });

const build = program.command('build').description('build web, electron, uni-app and card bundles');

build
  .command('cards')
  .argument('<cards>', 'comma separated card names')
  .option('-m, --module <module>', 'target module package', 'ccs-module-demo')
  .action((cards: string, options: { module: string }) => {
    ensureWorkspaceInstall();
    runPnpm(['--filter', toKebabCase(options.module), 'build:cards', '--', '--cards', cards]);
  });

build.argument('<target>', 'web | electron | uniapp-weixin | uniapp-ios | uniapp-android | uniapp-harmony').action((target: string) => {
  const root = findRepoRoot();
  const script = `build:${target}`;
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  if (!pkg.scripts?.[script]) throw new Error(`Unknown build target: ${target}`);
  ensureWorkspaceInstall();
  runPnpm([script]);
});

program.parse();

function runPnpm(args: string[]) {
  const root = findRepoRoot();
  const result = spawnSync('pnpm', args, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });
  process.exit(result.status ?? 1);
}

function ensureWorkspaceInstall() {
  const root = findRepoRoot();
  const result = spawnSync('pnpm', ['install'], {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

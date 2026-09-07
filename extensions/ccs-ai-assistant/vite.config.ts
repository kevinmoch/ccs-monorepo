import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type Plugin } from 'vite';
import { webskillConfig } from '@webskill/chatbot/vite';
import type { WebSkillConfigDefaults } from '@webskill/chatbot/config';
// @ts-expect-error -- 纯 JS 单一事实源，无需为构建脚本引入 d.ts
import { nodeShimAliasList, sdkAliasList } from './scripts/sdkAliases.mjs';
import { parseManifestOverrides } from './scripts/extensionConfig.mjs';

const fromHere = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/** config.json 里的 manifest 覆写；文件缺席即无覆写，非法内容让构建直接失败 */
function manifestOverrides(): Record<string, string> {
  let raw: string;
  try {
    raw = readFileSync(fromHere('config.json'), 'utf8');
  } catch {
    return {};
  }
  return parseManifestOverrides(JSON.parse(raw));
}

/**
 * 出厂设置在**入库的** config.json 里；模型定义与明文 apiKey 单独放 models.json（gitignored）。
 *
 * 分开的理由不是洁癖：两者合在一个文件里时，一旦把它加进 .gitignore，
 * 快捷指令、闸门开关这些**应该随仓库发布**的出厂设置也一并消失了；
 * 而插件对读不到的配置文件是**静默降级**（当空配置处理，构建照样成功），
 * 所以这种丢失在 CI 里不会报错，只会静悄悄地出一个功能缺失的产物。
 *
 * models.json 缺席（CI、新克隆）时只用 config.json：没有模型定义，但快捷指令与各项设置都在。
 * 插件只认路径，所以合并结果得先落盘。
 */
function webskillConfigFile(): string {
  const base = fromHere('config.json');
  const models = fromHere('models.json');
  if (!existsSync(models)) return base;
  const merged = {
    ...(JSON.parse(readFileSync(base, 'utf8')) as Record<string, unknown>),
    ...(JSON.parse(readFileSync(models, 'utf8')) as Record<string, unknown>)
  };
  const outDir = fromHere('node_modules/.webskill');
  mkdirSync(outDir, { recursive: true });
  const out = `${outDir}/config.merged.json`;
  writeFileSync(out, JSON.stringify(merged));
  return out;
}

/**
 * SDK 缺省为「关」的闸门（新增攻击面一律默认关）。它们在 config.json 里被打开
 * 本身是合法的，但必须是**有意识的决定**——构建日志里出声，避免一份抄来的
 * config.json 悄悄放宽了权限。这是宿主策略，SDK 不替宿主做主，所以走 `onParsed`。
 */
function warnOnOpenedGates(defaults: WebSkillConfigDefaults): void {
  const gates: [string, boolean | undefined][] = [
    ['sandbox.allowHttp', defaults.sandbox?.remoteUrl?.allowHttp],
    ['sandbox.allowPrivateHosts', defaults.sandbox?.remoteUrl?.allowPrivateHosts],
    ['sandbox.capabilities.fetchData', defaults.sandbox?.capabilities?.fetchData === true],
    ['privacy.userProfile', defaults.userProfile?.enabled],
    ['agentRuntime.multimodal.imageAttachments', defaults.multimodal?.imageAttachments],
    ['agentRuntime.multimodal.pageImageCapture', defaults.multimodal?.pageImageCapture]
  ];
  for (const [path, value] of gates) {
    if (value === true) console.warn(`WARNING: config.json opens a default-off gate: ${path}`);
  }
}

/**
 * 三份文件**原样拷贝**，不进 rollup 图。
 *
 * `sandbox.js` 必须逐字等于 `SANDBOX_PAGE_SCRIPT_SOURCE`（AC-14.3），
 * 让打包器碰它就等于放弃这条判据——注入的 helper、改写的字符串、加的 hash 文件名
 * 全都会让"盘上这份就是包里那份"不再成立。
 * `sandbox.html` 同理：它只有一行 `<script src>`，交给 vite 会被改写成带哈希的路径。
 *
 * `manifest.json` 是唯一的例外：name/version/description 三项可由 config.json 覆写，
 * 所以它是读入 → 合并 → 写出。其余字段（尤其写死的 `background.js`、`icons/` 路径）逐字保留。
 */
function copyExtensionAssets(): Plugin {
  return {
    name: 'webskill-copy-extension-assets',
    closeBundle() {
      const outDir = fromHere('dist');
      mkdirSync(outDir, { recursive: true });
      const manifest = JSON.parse(readFileSync(fromHere('manifest.json'), 'utf8')) as Record<string, unknown>;
      writeFileSync(`${outDir}/manifest.json`, `${JSON.stringify({ ...manifest, ...manifestOverrides() }, null, 2)}\n`);
      copyFileSync(fromHere('sandbox.html'), `${outDir}/sandbox.html`);
      copyFileSync(fromHere('src/sandbox/sandbox.js'), `${outDir}/sandbox.js`);
      // manifest 里的 icons 路径写死了 `icons/`，结构得原样搬过去
      mkdirSync(`${outDir}/icons`, { recursive: true });
      for (const size of [16, 32, 48, 128]) {
        copyFileSync(fromHere(`icons/icon-${size}.png`), `${outDir}/icons/icon-${size}.png`);
      }
      // 内置技能：`src/shared/seedSkills.ts` 首启时按扩展内地址 fetch 它们写进 OPFS。
      // 目录结构必须逐字保留——那份清单写的就是这些相对路径
      cpSync(fromHere('skills'), `${outDir}/skills`, { recursive: true });
    }
  };
}

export default defineConfig({
  base: './',
  plugins: [
    tailwindcss(),
    // 私有分发面（自己装 dist/ 的未打包扩展），因此显式选 'bake'：
    // 凭据进产物是混淆不是加密，只在分发面可控时才该这么选
    webskillConfig({
      file: webskillConfigFile(),
      secrets: 'bake',
      hostSections: ['manifest'],
      onParsed: ({ defaults }) => warnOnOpenedGates(defaults)
    }),
    copyExtensionAssets()
  ],
  resolve: {
    alias: [
      // `@webskill/chatbot/chatbot.css` 与 `@webskill/console/console.css` 由发布包的
      // exports 字段原生提供，不需要别名；`@webskill/ui-kit/ui-kit.css` 在共享表里指向本地垫片。
      // @webskill/node 在扩展里永不可用：SDK 发布产物里它只被 node 子路径引用，
      // 拦截留作保险——源码态依赖一旦混进图里，env.ts import node:fs 进浏览器即崩
      { find: '@webskill/sdk/node', replacement: fromHere('src/shared/nodeStub.ts') },
      { find: '@webskill/node/testing', replacement: fromHere('src/shared/nodeStub.ts') },
      { find: '@webskill/node', replacement: fromHere('src/shared/nodeStub.ts') },
      // 发布产物按 node 条件打包，浏览器侧得把 node 内建模块换成实现；详见 scripts/sdkAliases.mjs
      ...nodeShimAliasList(fromHere),
      // 其余别名来自 scripts/sdkAliases.mjs 单一事实源，表里的值是扩展目录相对路径
      ...sdkAliasList(fromHere)
    ]
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        sidepanel: fromHere('sidepanel.html'),
        options: fromHere('options.html'),
        // 文档投放面的受信外壳（0.15.0 分册 13）。它与 `sandbox.html` 不同：
        // 没有「盘上这份逐字等于包里那份」的判据，交给 rollup 打包是对的
        view: fromHere('view.html'),
        // 麦克风授权页（0.17.0 分册 10）：侧栏弹不出权限框，只能开在普通标签页里
        microphone: fromHere('microphone.html'),
        // 摄像头授权页（0.17.0 分册 14）：与麦克风同因同解
        camera: fromHere('camera.html'),
        // MV3 的 service worker 可以是 module；内容脚本不行，它在 vite.content.config.ts 单独构建
        background: fromHere('src/background/service-worker.ts')
      },
      output: {
        // manifest 里写死了 background.js，入口名不能带哈希
        entryFileNames: (chunk) => (chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js'),
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]'
      }
    }
  }
});

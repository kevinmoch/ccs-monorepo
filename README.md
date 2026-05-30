# CCS MonoRepo

企业级微前端 MonoRepo：React 主应用作为 Portal，Vue3 子应用作为业务模块，Wujie 负责微前端调度，`ccs` CLI 负责模块、页面、卡片生成与多端构建。

## 快速开始

```bash
pnpm install
pnpm dev
pnpm build
```

常用命令：

```bash
pnpm ccs create module ccs-module-order
pnpm ccs create page dashboard --module ccs-module-demo
pnpm ccs create card user-stat --module ccs-module-demo
pnpm ccs build cards user-stat,order-chart --module ccs-module-demo
pnpm ccs build web
pnpm ccs build electron
pnpm ccs build android
pnpm ccs build uniapp-weixin
```

Android APK 构建使用 DCloud 官方 Android 离线 SDK 工程，依赖 JDK、Android SDK、官方离线工程、DCloud 离线打包 AppKey 和签名证书：

```bash
export ANDROID_HOME=/path/to/android-sdk
export CCS_DCLOUD_ANDROID_PROJECT_DIR=/path/to/HBuilder-Integrate-AS/simpleDemo
export CCS_ANDROID_APPLICATION_ID=com.example.ccs
export CCS_ANDROID_APP_KEY=your-dcloud-android-app-key
export CCS_ANDROID_KEYSTORE_FILE=/path/to/release.keystore
export CCS_ANDROID_KEYSTORE_ALIAS=your-alias
export CCS_ANDROID_KEYSTORE_PASSWORD=your-password
pnpm ccs build android
```

`apps/ccs-uniapp/manifest.json` 和 `apps/ccs-uniapp/src/manifest.json` 里的 `appid` 需要替换为 DCloud 后台真实应用 ID；`CCS_ANDROID_APP_KEY` 必须和该 appid、Android 包名以及签名证书匹配。

默认端口：

- React Portal: http://localhost:3000
- Vue 示例子应用: http://localhost:5174

开发调试时，可以同时启动框架和子模块：

```bash
pnpm dev
```

该命令会同时启动框架和 `apps/ccs-module-*` 子模块。框架 dev server 会读取 `apps/ccs-module-*` 的 `package.json` 中 `dev` 脚本端口，并把 `/ccs-module-*` 同源代理到对应子模块 dev server；菜单 URL 如 `ccs-module-demo/orders` 会在 iframe 中加载子模块调试页面，并通过 iframe 路由参数进入 `/orders` 页面。构建后的 `pnpm build:web` 仍然使用 `dist/web/ccs-module-*` 下的同源产物。

`pnpm ccs create module <name>` 会从 5175 起自动分配未占用的子模块 dev 端口。也可以显式传入端口：

```bash
pnpm ccs create module ccs-module-abc --port 5176
```

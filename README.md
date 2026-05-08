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

- React Portal: http://localhost:5173
- Vue 示例子应用: http://localhost:5174

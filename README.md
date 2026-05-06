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
pnpm ccs build uniapp-weixin
```

默认端口：

- React Portal: http://localhost:5173
- Vue 示例子应用: http://localhost:5174

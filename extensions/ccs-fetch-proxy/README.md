# CCS Fetch Proxy — Chrome 扩展

为 CCS 外壳（ccs-framework，`https://localhost:3000`）定制的能力扩展，提供两个功能：

1. **跨域取数代理**：在外壳顶层窗口注入 `window.ccsExtFetch(input, init)`，接口与标准 `fetch` 完全一致；调用后请求会被路由到当前已打开的内嵌子网站 iframe（如 ERP 待办任务页面）中执行——同 origin、携带该页面的 cookie/登录态，从而绕过跨域限制，供 AI 对话框等外壳代码获取子网站后台数据。
2. **新窗口拦截**：外壳内嵌的**跨域**子网站页面（origin 与外壳不同）中，所有会弹出新窗口/新标签的跳转（`a[target=_blank]`、`form[target]`、`window.open`）都被强制改为在当前 iframe 内导航，不再跳出外壳。

> 要求 Chrome 111+（MAIN world content script 支持）。纯原生 JS，无构建步骤、无第三方依赖。

## 安装（Load unpacked）

1. 打开 `chrome://extensions`，右上角开启 **开发者模式**；
2. 点击 **加载已解压的扩展程序**，选择本目录（`extensions/ccs-fetch-proxy/`）；
3. 安装后无需重启浏览器；如修改了扩展代码，回到 `chrome://extensions` 点击该扩展卡片上的刷新图标，并刷新已打开的外壳页面。

## 配置：外壳白名单

扩展只对"顶层页面命中白名单"的标签页生效（默认 `https://localhost:3000`）。

- 打开 `chrome://extensions` → CCS Fetch Proxy → **详情/扩展程序选项**（或在扩展卡片点"扩展程序选项"）；
- 每行填写一个完整 origin（协议 + 域名 + 端口），保存后 **刷新外壳页面** 生效。

匹配是宽松的（URL 解析后按 origin 比较）：条目带不带尾斜杠、带路径/查询串/锚点（如 `https://localhost:3000/?login=tenant`）都能匹配到 `https://localhost:3000`；大小写不敏感。

白名单未命中时：不注入 `window.ccsExtFetch`，也不激活任何拦截——扩展对外壳以外的网站完全无感。

## 用法

### 1. 在外壳代码中调用（AI 对话框即此用法）

```ts
// 优先扩展，自动降级：window.fetchProxy（proxy.html 中继）→ window.fetch
import { getCcsApiFetch, resolveCcsApiUrl, waitForCcsExtFetch } from './lib/ccs-api-fetch';

// 可选：启动时探测扩展是否就绪（content script 异步安装，页面刚加载时可能尚未注入）
const ready = await waitForCcsExtFetch(3000);

const fetchFn = getCcsApiFetch();
const res = await fetchFn(resolveCcsApiUrl('/ierp/kapi/app/MaterialTemplate/call'), {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ className: '...', methodName: '...', ismobile: '1' })
});
const data = await res.json(); // 标准 Response 对象，用法与 fetch 相同
```

约束：

- **必须传入指向子网站的绝对 URL**（或先用 `resolveCcsApiUrl()` 解析相对路径）。相对路径会按 fetch 语义解析到外壳自身 origin——若外壳下恰好有已打开的同源模块 iframe（如 ccs-module-common），请求会被路由到那里执行、打到 preview 服务器自己的接口上，通常返回 404；
- **目标页面必须已在外壳中打开**（如先点击"待办任务"菜单）。扩展按请求 URL 的 origin 匹配当前标签页内已打开的子网站 iframe；找不到时返回明确错误提示；
- 请求 URL 的 origin 必须与目标 iframe 页面 origin 一致（防 SSRF，执行器强制校验）；
- 始终携带 cookie（`credentials: 'include'`，由执行器强制，调用方不可关闭）；
- `init` 仅支持可序列化部分（method / headers / string body）；响应体一次性缓冲返回（非流式），二进制以 base64 透传。

### 2. 在 DevTools Console 中快速验证

```js
// 0) 解析 ERP 基地址（与框架内 resolveCcsApiUrl 逻辑一致：优先运行时覆盖，其次 .env 的 CCS_BASE_URL）
const base = (sessionStorage.getItem('ccs-base-url-override') || 'https://jijian.huawei.com').replace(/\/+$/, '');

// 1) 确认 API 已注入（true）
typeof window.ccsExtFetch === 'function';

// 2) 发起一次真实请求（必须用指向子网站的绝对 URL，需已打开目标子网站页面）
const r = await window.ccsExtFetch(`${base}/ierp/kapi/app/MaterialTemplate/call`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ className: 'kd.ecc.index.webapi.ECCIndexIerpApi', methodName: 'getCarousel', ismobile: '1' })
});
console.log(r.status, await r.text());
```

注意：Console 中直接写相对路径（如 `/ierp/kapi/...`）会解析到外壳自身 origin 并被路由到同源模块 iframe 执行，拿到的是 preview 服务器的 404——这正是必须传绝对 URL 的原因。

### 3. 新窗口拦截（自动生效，无需调用）

白名单外壳内的跨域子网站页面加载后自动激活：`target=_blank` 链接、动态新增链接、`window.open` 均改为当前 iframe 内跳转。同源模块 iframe（ccs-module-common 等）不受扩展干预，由工程内 IframeCard.vue 的既有逻辑处理。

## 工作原理（消息链路）

```
window.ccsExtFetch(url, init)                     顶层窗口 MAIN world
  → postMessage（同 frame）                       顶层 ISOLATED content script
  → chrome.runtime.sendMessage                    Service Worker
      · 校验本 tab 顶层 origin 命中外壳白名单
      · 按请求 URL 的 origin 匹配 frame 注册表（document_start 各 frame 自报），路由到具体 frameId
      · 注册表未命中时广播 frame-ping，各存活 frame 即时重新注册后重试路由（SW 重启自愈）
  → chrome.tabs.sendMessage(frameId)              目标 iframe ISOLATED script
  → postMessage（同 frame）                       目标 iframe MAIN world
      · SSRF 校验（URL origin === 页面 origin）
      · fetch(url, { ..., credentials: 'include' })
  → { status, statusText, headers, bodyBase64 } 原路回传
  → new Response(...) resolve（HTTP 错误也 resolve，对齐 fetch 语义）
```

安全要点：postMessage 仅接受同 frame 同源消息（`event.source === window`）；统一信封 `{ __ccsExt: true, proto: 'ccs-fetch-proxy' }`；扩展不申请 `tabs` 等敏感权限，白名单校验依据 content script 自报的 `location.origin`。

生命周期说明：MV3 Service Worker 空闲约 30 秒会被 Chrome 终止，内存中的 frame 注册表随之清空；已加载的静态 iframe 不会再次触发 `document_start` 注册。为此 SW 在路由未命中时会向该 tab 所有 frame 广播 `frame-ping`，各 frame 的 ISOLATED 脚本收到后立即重新注册，随后重试路由——页面保持打开即可，无需刷新。

## 目录结构

```
ccs-fetch-proxy/
├── manifest.json                  MV3 清单（storage 权限、双 content script、SW、options）
├── content/main-world.js          MAIN world：顶层 API 安装 / 子 frame 执行器 + 新窗口拦截
├── content/isolated.js            ISOLATED world：frame 注册、shell/lockdown 查询、MAIN ↔ SW 桥接
├── background/service-worker.js   白名单校验、frame 注册表、按 origin 路由
└── options/
    ├── options.html               外壳白名单配置页
    └── options.js
```

## 常见问题

| 现象                                                      | 原因与处理                                                                                                                  |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Console 直接调 `window.ccsExtFetch('/ierp/...')` 返回 404 | 相对路径解析到了外壳自身 origin，请求被路由到同源模块 iframe、打到了 preview 服务器。改传指向子网站的绝对 URL（见上文用法） |
| `window.ccsExtFetch` 不存在                               | 扩展未安装/未启用；外壳 origin 不在白名单（改 options 后需刷新页面）；Chrome < 111                                          |
| 报"未找到已打开的目标子网站页面"                          | 先确认对应子网站页面已在外壳中打开（如待办任务）再发起请求；SW 重启导致的注册丢失会自动广播重建，无需刷新页面               |
| 请求 401/302 到登录页                                     | 子网站登录态失效，重新走一遍登录或在主窗口重新打开该页面                                                                    |
| 报"目标页面已失效"                                        | iframe 已跳转/关闭导致注册失效，重新打开对应页面即恢复                                                                      |
| 修改代码后不生效                                          | `chrome://extensions` 刷新扩展 + 刷新外壳页面                                                                               |

## 相关文件（主仓库）

- 框架侧接入：`apps/ccs-framework/src/lib/ccs-api-fetch.ts`（降级链 + 端点常量）、`apps/ccs-framework/src/skill/context/DataContext.tsx`（"分析待办任务"技能）
- 降级方案参考：`apps/ccs-framework/src/lib/fetch-proxy.ts` + `apps/ccs-framework/public/ierp/monorepo/proxy.html`

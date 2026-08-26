# CCS Fetch Proxy — Chrome 扩展

为 CCS 外壳（ccs-framework，`https://localhost:3000`）定制的能力扩展，提供两个功能：

1. **跨域取数代理**：在外壳顶层窗口注入 `window.ccsExtFetch(input, init)`，接口与标准 `fetch` 完全一致；调用后请求会被路由到当前已打开的内嵌子网站 iframe（如 ERP 待办任务页面）中执行——同 origin、携带该页面的 cookie/登录态，从而绕过跨域限制，供 AI 对话框等外壳代码获取子网站后台数据。
2. **新窗口拦截**：外壳内嵌的**跨域**子网站页面（origin 与外壳不同）中，所有会弹出新窗口/新标签的跳转（`a[target=_blank]`、`form[target]`、`window.open`）都被强制改为在当前 iframe 内导航，不再跳出外壳。

> 要求 Chrome 111+（MAIN world content script 支持）。
>
> 页面感知/操作层（`content/dom-agent.js`）由 `src/domAgent.ts` 打包而成，内核是
> `@webskill/browser` 的 `createPageAgentHandler`；**产物已提交进仓库**，直接解包加载即可，
> 只有改动 `src/` 或升级 SDK 时才需要重新构建。其余文件（service worker、两个桥接脚本、
> options）仍是纯原生 JS，不经构建。

## 安装（Load unpacked）

1. 打开 `chrome://extensions`，右上角开启 **开发者模式**；
2. 点击 **加载已解压的扩展程序**，选择本目录（`extensions/ccs-fetch-proxy/`）；
3. 安装后无需重启浏览器；如修改了扩展代码，回到 `chrome://extensions` 点击该扩展卡片上的刷新图标，并刷新已打开的外壳页面。

## 构建（仅改动 `src/` 时）

```bash
pnpm --filter ccs-fetch-proxy build        # 用已发布的 @webskill/sdk
pnpm --filter ccs-fetch-proxy build:sdk    # 用本地 SDK 源码（../../../web-skill-sdk）
```

产物写回 `content/dom-agent.js`（带 GENERATED 标记）。**不要手改那个文件**，下一次构建会覆盖。

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

安全要点：扩展不申请 `tabs` 等敏感权限，白名单校验依据 content script 自报的 `location.origin`。

`downloads` 权限只服务于**操作触发的下载信号**（WebSkill SDK 0.15.0 分册 15）：外壳在一次页面操作前后各调一次 `window.ccsExtDownloads`，SW 只回一个**完成计数**——文件名、大小、类型、来源 URL 都不出 SW，也从不调 `chrome.downloads.search`/`open`/`download`。窗口是时间闭区间（open 之前、settle 之后一概不计），最长 30s 自动作废；开窗与投递页面指令走同一道闸门（白名单外壳的顶层帧）。模型要读文件内容仍必须走 `list_downloaded_files` / `read_downloaded_file` 的逐次确认卡。

ISOLATED ↔ MAIN 的私有通道：MAIN world 的脚本与页面脚本共享 realm，只按 `event.source === window` + `event.origin` 过滤等于不设防——同源页面脚本可以自己 `postMessage` 伪造一条 `dom-exec`（把授权面改成整页），也可以监听到真实指令的 `reqId` 后抢先回传伪造结果，让外壳把编造的快照当成真页面。因此：

- **入站（ISOLATED → MAIN）**：ISOLATED 在 `document_start` 生成一次性随机 token 递给 MAIN 侧两段脚本，指令必须带对 token；MAIN 侧监听器早于页面任何脚本注册，收到发给自己的报文立刻 `stopImmediatePropagation`，页面既学不到 token 也看不见指令内容。信封新增 `to` 字段（`main` / `dom` / `iso`）指明归谁消费与截停，两段 MAIN 脚本互不吞报文。
- **出站（MAIN → ISOLATED）**：不截停（跨 world 的 `stopImmediatePropagation` 行为各版本不一，截停有掐死 ISOLATED 接收的风险），故出站不带 token，改由随指令下发的一次性 `execId` 认证——`execId` 只存在于被截停的入站报文里，页面猜不到，用过即删，重放无效。
- **探针撤销**：`dom-agent.js` 在 `document_start` 包裹 `EventTarget.prototype.addEventListener` 采集点击监听器（最强的可交互信号），那时还不知道本帧是否在白名单外壳之下。`lockdown-check` 现在额外返回 `shell`（同源子帧也为真），确认「不是外壳下的帧」后 ISOLATED 会下发 `CCS_EXT_DOM_DISARM`，dom-agent 把原型还原，不在无关站点的帧里留痕。

生命周期说明：MV3 Service Worker 空闲约 30 秒会被 Chrome 终止，内存中的 frame 注册表随之清空；已加载的静态 iframe 不会再次触发 `document_start` 注册。为此 SW 在路由未命中时会向该 tab 所有 frame 广播 `frame-ping`，各 frame 的 ISOLATED 脚本收到后立即重新注册，随后重试路由——页面保持打开即可，无需刷新。

嵌套 iframe 感知：content script 以 `all_frames: true` 运行，嵌套 iframe（无论同源还是跨域）里的 dom-agent 同样在场并向注册表自报。感知时每帧会把内部可路由的嵌套 iframe 地址（`nestedFrameUrls`）一并上报，外壳据此沿同一条桥逐帧下钻，因此 iframe 里再嵌 iframe 的内容也能被 AI 读到；后续操作（act）按句柄发放帧路由回对应帧。外壳侧约束：只钻子系统白名单 origin 的嵌套帧，深度封顶 2 层、嵌套帧封顶 4（连首帧一次感知最多 5 帧）。同源但没有 URL 的帧（`srcdoc`/`about:blank`，报错页/注入内容常藏在里面）过不了按 URL 的路由，由父帧直接读 contentDocument 内联进快照（限 include 范围内且可见的帧）。

读空防瞎编：三类诚实信号防止模型拿空快照编造内容。其一，帧地址如实上报：可路由地址以帧内真实 `location.href` 优先（帧内导航不改 src 属性，拿旧 src 去感知会读到报错帧）；首帧实际读到的页面与外壳请求地址分叉时，外壳补一条 note 说明帧已导航。其二，画布渲染页（WPS/Office 文档预览）内容全画在 canvas 上、DOM 无文字，帧内检测到「大画布 + 整页读不出文本（脚本源码不计）」时携带 `canvasNote`，外壳转成 note 告知模型内容不可机读。其三，整棵树读不出任何可访问名时，外壳同样补 note 并要求模型如实报告而非只描述外壳。

可点的 div、图片与图标链接：ERP 大量可交互元素是无语义角色的 div、当链接用的图片/图标或文字链接型单元格，默认不发句柄。dom-agent 对 generic/img/cell 元素做角色提升（提升为 button 后即可发句柄），依据是通用可交互信号而非枚举具体 class：**监听器探针**（脚本以 `document_start` 注入，包裹 `addEventListener`，挂过 click 类监听的元素即为可交互——行为事实，Tailwind 等工具类写法的菜单项只有这条路认得出）、`tabindex`（非 -1）、`title` 属性、class/id 含交互语义词根（btn/action/menu/link/tab/trigger/icon 族等，边界匹配不误伤 `table`）、computed `cursor: pointer`（最贵，殿后）。提升需有可辨识线索：文字型元素要有名字或后代文本（<span> 包文字的链接会被补上名字），图片无需文字（缩略图自身是线索），图标按钮从图标类名反推语义当名字（el-icon-view → view）。后代里已有可发句柄控件的容器不再提升，避免父按钮套子链接。外壳下发的 `roleHints` 仅作逃生舱，默认不声明任何选择器。感知侧名字解析与操作侧同序，`title` 属性殿后。

句柄稳定性：帧内的 ref 按元素稳定发放、跨感知保留——同一元素每次感知拿到的是同一个 ref。外壳侧的句柄描述表则按 SDK 的「每次感知整体替换」语义（`createRemoteTargetRegistry`）：没感知过就执行 = 拒绝，宁可让模型多感知一次。帧内保留的好处在于同一元素重感知后仍是同一个 ref，确认卡与留痕里指称一致。

模态授权面：外壳只声明静态的 `actionInclude` / `actionExclude`，而 ERP 的表单大多在点击后弹出的对话框里。因此 act 成功后新出现的模态会被「提升」——其子树**并入**（不是替换）授权面，下一次感知里可读可发句柄。两条边界：其一，提升是并入，替换会把外壳下发的整个授权面冲掉，同时开两个模态时后一个还会冲掉前一个；其二，提升只是扩大可操作集合，不是免检票——act 的范围闸门对模态内目标一视同仁，`actionExclude` 与感知侧的 `exclude` 在模态里同样生效。提升记录按「仍在文档中**且仍匹配模态选择器**」清理：Element Plus 这类组件关闭对话框时只是隐藏、节点仍留在 DOM 里，只看 `isConnected` 会让用户后来自己点开的同一个对话框继续被当成已授权。用户手动打开、不在授权面里的对话框会得到一条 note 说明「因非本次操作打开故未读取」，且**不报它的名字**——范围外的内容一个字都不该进模型上下文，标题也是内容。

点击结果的可见性：两重机制防止「点击成功后 AI 看不见结果、循环重点同一目标」。其一，新窗口拦截（main-world.js 的 lockdown，仅在白名单外壳下的跨域帧激活，不会波及普通浏览）：帧内的 `window.open` 与 `<a target>` 被改为当前帧跳转（`about:blank`/`javascript:` 除外），点击触发的详情/预览页不会跑到外壳读不到的新窗口（真文件下载不受影响，附件响应由 Content-Disposition 触发）；其二，导航证据：act 成功后若本帧地址已变，结果里携带 `navigated: true` 与新地址，整个 outcome 会原样回给模型，明确告知页面已切换、不应再点原目标。固有限制：真实跨文档导航 commit 后帧上下文销毁，当次 act 响应可能发不出去（外壳表现为「目标页面已失效」），下一次感知会按帧自报的新地址跟上。

## 目录结构

```
ccs-fetch-proxy/
├── manifest.json                  MV3 清单（storage + downloads 权限、双 content script、SW、options、图标）
├── icons/                         扩展图标（16/32/48/128，源自 apps/ccs-android 的 ic_launcher.png，裁掉透明边距）
├── src/domAgent.ts                【源码】监听器探针 + @webskill/browser 的 createPageAgentHandler + 报文翻译
├── src/scopes.ts                  【源码】帧内声明的可操作范围与角色逃生舱
├── vite.config.mjs                src/domAgent.ts → content/dom-agent.js 的 IIFE 打包
├── content/main-world.js          MAIN world：顶层 API 安装 / 子 frame 执行器 + 新窗口拦截
├── content/dom-agent.js           【构建产物，勿改】MAIN world：页面感知 / 操作执行
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

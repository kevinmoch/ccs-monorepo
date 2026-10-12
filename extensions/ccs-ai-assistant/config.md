# config.json 字段参考

## 顶层分节

| 分节                      | 内容                                                                       |
| ------------------------- | -------------------------------------------------------------------------- |
| `models` / `defaultModel` | 模型条目与默认模型（放在 `models.json`）                                   |
| `agentRuntime`            | 智能体运行时：循环上限、交互策略、钩子、能力开关、多模态                   |
| `sandbox`                 | 沙箱与安全：执行器、网络策略、能力闸门、数据源、体积上限                   |
| `quickPrompts`            | 快捷指令                                                                   |
| `privacy`                 | 隐私与用户画像                                                             |
| `siteAccess`              | 站点白名单                                                                 |
| `console`                 | 控制台显示：消费金额、菜单裁剪                                             |
| `appearance`              | 外观：主题、语言、渲染器、语音输入语言                                     |
| `manifest`                | **扩展独有**：覆写 MV3 manifest 的四项                                     |
| `hostComponents`          | **扩展独有**：宿主组件（把汇总发到微信之类）；**写了某一项就是接入该组件** |

> `siteAccess` 与 `console` 两节需要 `@webskill/chatbot` ≥ 0.22.0，**白名单要真的拦得住**
> 还需 ≥ 0.23.0（匹配器 `isAllowedSite` 那时才进已发布入口）。校验器来自本工程
> `package.json` 里钉的**已发布**版本（`WEBSKILL_SRC=1` 的源码别名管不到 vite 配置
> 加载期的裸导入），版本不够时构建直接报 `CONFIG_UNKNOWN_KEY`。

---

## models / defaultModel

`models` 是数组，条目与 SDK 的 `RuntimeLlmEntry` 同形。未列出的键一律报错。

| 键                     | 类型                                                                       | 必填                       | 说明                                        |
| ---------------------- | -------------------------------------------------------------------------- | -------------------------- | ------------------------------------------- |
| `id`                   | string                                                                     | 是                         | 条目标识，不可重复                          |
| `label`                | string                                                                     | 是                         | 界面显示名                                  |
| `provider`             | `"openai-compatible"` \| `"anthropic"` \| `"google"` \| `"chrome-builtin"` | 是                         |                                             |
| `model`                | string                                                                     | 除 `chrome-builtin` 外必填 | 浏览器内置模型没有模型名可填                |
| `baseUrl`              | string                                                                     | 否                         | 省略即用该 provider 的官方端点              |
| `apiKey`               | string                                                                     | 否                         | **不进解析结果**，被摘到 secrets 里单独处理 |
| `requestTimeoutMs`     | integer ≥ 1000                                                             | 否                         |                                             |
| `thinkingBudgetTokens` | integer                                                                    | 否                         |                                             |
| `capabilities.tools`   | boolean                                                                    | 否                         | 默认 `true`                                 |
| `capabilities.image`   | boolean                                                                    | 否                         | 默认 `false`                                |

`defaultModel` 是 string，**必须**指向 `models` 里已声明的某个 `id`，否则构建失败。

```json
"models": [
  { "id": "gpt", "label": "GPT-4o", "provider": "openai-compatible",
    "model": "gpt-4o", "baseUrl": "https://api.example.com/v1", "apiKey": "sk-..." }
],
"defaultModel": "gpt"
```

> `apiKey` 走 AES-GCM 密文进包，但**密钥与密文在同一个包里**——这是混淆，不是加密。
> 带 key 构建出来的 `dist/` 等同于凭据本身，不要分发。

---

## agentRuntime

### 顶层

| 路径                                          | 类型    | 默认            | 取值                                   |
| --------------------------------------------- | ------- | --------------- | -------------------------------------- |
| `agentRuntime.streaming`                      | boolean | `true`          |                                        |
| `agentRuntime.renderResult`                   | boolean | `true`          |                                        |
| `agentRuntime.router`                         | string  | `"progressive"` | `"progressive"` \| `"full-disclosure"` |
| `agentRuntime.skillState.quarantineThreshold` | integer | `5`             | 1 ~ 20                                 |

### agentRuntime.loop

| 路径                   | 类型    | 默认       | 区间     |
| ---------------------- | ------- | ---------- | -------- |
| `maxTurns`             | integer | `1000`     | 1 ~ 9999 |
| `maxHistoryMessages`   | integer | `1000`     | 1 ~ 1000 |
| `totalTimeoutMs`       | integer | `3600000`  | ≥ 1000   |
| `toolTimeoutMs`        | integer | `600000`   | ≥ 1000   |
| `toolResultMaxBytes`   | integer | `256000`   | ≥ 1024   |
| `maxDocumentBytes`     | integer | `25600000` | ≥ 1024   |
| `maxDocumentTextBytes` | integer | `5120000`  | ≥ 1024   |
| `temperature`          | number  | 不设置     | 0 ~ 2    |

单位一律是**存储单位**（毫秒 / 字节 / 条），不是界面上的展示单位。

### agentRuntime.interaction

| 路径                   | 类型    | 默认             | 取值                                         |
| ---------------------- | ------- | ---------------- | -------------------------------------------- |
| `missingParams`        | string  | `"user"`         | `"user"`（问用户）\| `"llm"`（让模型自己猜） |
| `confirmations`        | string  | `"required"`     | `"required"` \| `"auto-approve"`             |
| `approvalScope`        | string  | `"once-per-run"` | `"once-per-run"` \| `"every-call"`           |
| `interactionTimeoutMs` | integer | `300000`         | ≥ 1000                                       |

### agentRuntime.hooks

| 路径              | 类型    | 默认    | 区间  |
| ----------------- | ------- | ------- | ----- |
| `timeoutMs`       | integer | `5000`  | ≥ 100 |
| `failOnHookError` | boolean | `false` |       |

### agentRuntime.agentCapabilities

| 路径              | 类型     | 默认                                                 |
| ----------------- | -------- | ---------------------------------------------------- |
| `todo`            | boolean  | `true`                                               |
| `generativeUi`    | boolean  | `false`                                              |
| `skillGeneration` | boolean  | `false`                                              |
| `delegation`      | boolean  | `false`                                              |
| `uiPresets`       | string[] | `["charts","cards","dashboards","slides","reports"]` |

### agentRuntime.multimodal

| 路径                  | 类型    | 默认       | 区间    |
| --------------------- | ------- | ---------- | ------- |
| `imageAttachments`    | boolean | `false`    |         |
| `pageImageCapture`    | boolean | `false`    |         |
| `maxImagesPerMessage` | integer | `50`       | 1 ~ 100 |
| `maxImageBytes`       | integer | `10485760` | ≥ 65536 |
| `minImageArea`        | integer | `1024`     | ≥ 0     |

---

## sandbox

| 路径                         | 类型           | 默认         | 取值                                              |
| ---------------------------- | -------------- | ------------ | ------------------------------------------------- |
| `sandbox.executor`           | string         | `"auto"`     | `"auto"` \| `"blob-worker"` \| `"iframe-sandbox"` |
| `sandbox.networkPolicy`      | string 或对象  | `"deny-all"` | 见下                                              |
| `sandbox.typescript`         | boolean 或对象 | `false`      | 见下                                              |
| `sandbox.downloadedFiles`    | boolean        | `false`      |                                                   |
| `sandbox.uploadFiles`        | boolean        | `false`      |                                                   |
| `sandbox.allowHttp`          | boolean        | `false`      | 落在 `remoteUrl.allowHttp`                        |
| `sandbox.allowPrivateHosts`  | boolean        | `false`      | 落在 `remoteUrl.allowPrivateHosts`                |
| `sandbox.dataSources`        | 数组           | `[]`         | 见下                                              |
| `sandbox.maxDataSourceBytes` | integer        | `1024000`    | ≥ 1024                                            |
| `sandbox.maxUploadFileBytes` | integer        | `20971520`   | ≥ 1024                                            |
| `sandbox.unsignedSkills`     | string         | `"warn"`     | `"allow"` \| `"warn"` \| `"deny"`                 |
| `sandbox.documentSurface`    | boolean        | `false`      | 需宿主另提供一条能下发 CSP 头的 viewer 路由       |

**networkPolicy** 两种写法：枚举 `"deny-all"` / `"allow-all"`，或白名单对象
`{ "allow": ["https://example.com"] }`（`allow` 是字符串数组，唯一合法子键）。

**typescript** 两种写法：布尔简写 `true`（等价于 `{ "enabled": true }`），
或对象 `{ "enabled": bool, "esbuildUrl"?: string, "wasmUrl"?: string }`。

**dataSources** 每条 `{ "id": string, "url": string, "description": string }`，
`description` 允许空串，三个键都必填、无多余键。

### sandbox.capabilities

五个能力闸门，取值是**三态**：`true` / `false` / `"require-approval"`。

| 路径            | 默认    |
| --------------- | ------- |
| `readReference` | `true`  |
| `readAsset`     | `true`  |
| `writeArtifact` | `true`  |
| `confirm`       | `true`  |
| `fetchData`     | `false` |

> `sandbox.allowHttp`、`sandbox.allowPrivateHosts`、`sandbox.capabilities.fetchData`、
> `privacy.userProfile`、`agentRuntime.multimodal.imageAttachments`、
> `agentRuntime.multimodal.pageImageCapture` 这六项 SDK 缺省为「关」。
> 在 config.json 里打开是合法的，但构建时会打印警告——
> 那些默认值是经评审定下的（新增攻击面一律默认关），放宽必须是有意识的决定。

---

## quickPrompts

| 路径                 | 类型    | 默认 | 区间   |
| -------------------- | ------- | ---- | ------ |
| `quickPrompts.limit` | integer | `8`  | 1 ~ 20 |
| `quickPrompts.items` | 数组    | `[]` |        |

每条 `{ "id": string, "text": { "zh": string, "en": string }, "icon"?: string }`：

- `id` 不可重复
- `text` **中英两份都必填**，且只认 `zh` / `en` 两个键
- `icon` 可选，取值：`chart` `document` `report` `search` `list` `bug` `test`
  `metric` `compare` `page` `run` `warn` `sparkles` `settings`

写了 `quickPrompts.items` 会一并把 `quickPromptsSeeded` 置真，
否则宿主的一次性种子会在首启时再注一遍。

---

## privacy

| 路径                     | 类型    | 默认    | 区间                         |
| ------------------------ | ------- | ------- | ---------------------------- |
| `privacy.userProfile`    | boolean | `false` | 落在 `userProfile.enabled`   |
| `privacy.encryptProfile` | boolean | `true`  | 落在 `userProfile.encrypted` |
| `privacy.injectMaxBytes` | integer | `4096`  | ≥ 1024                       |
| `privacy.recordLimit`    | integer | `500`   | ≥ 1                          |

---

## siteAccess

| 路径                      | 类型     | 默认 |
| ------------------------- | -------- | ---- |
| `siteAccess.allowedHosts` | string[] | `[]` |

**空数组 = 不设限**（不是「全拒」）。清单非空时，助手只服务名单内的站点：
名单外的页面既不读取也不操作，侧栏顶部出现提示条，模型收到一条点名域名的英文说明。

三种写法，没有第四种：

| 写法              | 命中                                                 | 不命中                                   |
| ----------------- | ---------------------------------------------------- | ---------------------------------------- |
| `"*"`             | 一切                                                 | —                                        |
| `"*.example.com"` | `example.com`、`docs.example.com`、`a.b.example.com` | `notexample.com`、`example.com.evil.net` |
| `"example.com"`   | 仅 `example.com`                                     | `docs.example.com`                       |

- `*` 只能是开头的 `*.` 整体。`doc*.example.com`、`*.example.*` 不支持，会被当普通字符串，永不命中
- `*.example.com` **连主域一起命中**（与 Chrome match pattern 同口径）
- 多条取并集，任一命中即放行
- 只看主机名：端口、协议、大小写、结尾的点都不参与
- 清单非空时，**解析不出主机名的地址一律拦下**（`about:blank`、`chrome://…`、畸形串）

拦截点在标签页绑定处，因此感知、页面动作、标签页集、WebOffice、页面截图、
关联文档会**同时**失效，不存在漏网的能力。

```json
"siteAccess": { "allowedHosts": ["*.kdocs.cn", "intranet.corp.com"] }
```

---

## console

| 路径                                    | 类型     | 默认   | 区间 |
| --------------------------------------- | -------- | ------ | ---- |
| `console.usageCost.enabled`             | boolean  | `true` |      |
| `console.usageCost.cnyPerMillionTokens` | number   | `9`    | ≥ 0  |
| `console.usageCost.cnyPerUsd`           | number   | `6.8`  | > 0  |
| `console.hiddenPages`                   | string[] | `[]`   | 见下 |

**消费金额**的算法是 `costCny = 总 token 数 / 1000000 × cnyPerMillionTokens`；
英文界面按 `cnyPerUsd` 把人民币折成美元显示。`enabled: false` 时概览页的金额框整个消失，
指标栅格收成两列，不留空格子。单价填 `0` 合法（自建模型不计费）。

两个数值都不收负数——负数在构建期就会被拒。但 `cnyPerUsd` 的下界这两处并不齐：
构建期只挡到 `< 0`，运行时要求 `> 0`，所以写 `0` 能通过构建，之后被静默按 `6.8` 处理。

**hiddenPages** 是页面 id 数组，写进去的页面不出现在侧栏和命令面板。
**只管显示，不是访问控制**——藏起来的页面仍可被直接导航到。

| id                    | 侧栏显示       |
| --------------------- | -------------- |
| `overview`            | 概览           |
| `skills.library`      | 技能库         |
| `skills.editor`       | 编辑器         |
| `skills.transfer`     | 安装与导出     |
| `skills.integrity`    | 完整性与清单   |
| `runs.activity`       | 运行记录       |
| `runs.inspector`      | 运行详情       |
| `runs.sessions`       | 会话与记忆     |
| `governance.review`   | 审批队列       |
| `governance.audit`    | 审计日志       |
| `governance.versions` | 版本           |
| `governance.eval`     | 评估           |
| `governance.insights` | 洞察           |
| `connections.models`  | 大模型         |
| `connections.mcp`     | MCP 端点       |
| `connections.webmcp`  | WebMCP 工具    |
| `connections.page`    | 页面技能       |
| `settings.runtime`    | 智能体运行时   |
| `settings.sandbox`    | 沙箱与安全     |
| `settings.genui`      | 生成式 UI      |
| `settings.prompts`    | 快捷指令       |
| `settings.trust`      | 信任与签名     |
| `settings.privacy`    | 隐私与用户画像 |
| `settings.appearance` | 外观           |
| `settings.about`      | 关于与诊断     |

一组的页面被藏光时该组自动消失；藏光全部页面则退回完整导航
（一个连一页都点不开的控制台只会被当成坏掉了）。

写**组名**（如 `"connections"`）无效，只认页面 id。

---

## appearance

| 路径                       | 类型   | 默认       | 取值                                               |
| -------------------------- | ------ | ---------- | -------------------------------------------------- |
| `appearance.theme`         | string | `"dark"`   | `"light"` \| `"dark"`                              |
| `appearance.locale`        | string | `"zh"`     | `"zh"` \| `"en"`                                   |
| `appearance.renderer`      | string | `"native"` | `"native"` \| `"a2ui"` \| `"openui"` \| `"vercel"` |
| `appearance.dictationLang` | string | `""`       | BCP-47 标签；**空串 = 跟随界面语言**               |

`dictationLang` 刻意不按枚举校验：浏览器实际支持哪些标签不可探测，
按候选表拒绝会把合法取值挡在外面。

---

## manifest（扩展独有）

| 键            | 类型   | 说明                                                                                                                                                                        |
| ------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`        | string | 覆写 `manifest.json` 的同名项                                                                                                                                               |
| `version`     | string | 1～4 段十进制整数，每段 0～65535，不得有前导零                                                                                                                              |
| `description` | string |                                                                                                                                                                             |
| `update_url`  | string | CRX 自动更新的清单地址：绝对的 `http://` 或 `https://` 地址，写进构建产物的 `update_url`。文件夹加载的扩展会忽略它；`pnpm build:crx` 要求它存在（见 README 「打包成 CRX」） |

只有这四项可覆写，其余字段（`key`、权限、入口路径）逐字保留。

---

## hostComponents（扩展独有）

宿主组件（0.26.0 分册 14）的接入清单。**写了某一项，就是扩展接入该组件**；分节缺席或为空数组，就是不接入。
每一项对应一次 `createHttpMessageComponent`，键与工厂选项一一对应：

| 键            | 类型           | 必填 | 说明                                                                                                  |
| ------------- | -------------- | ---- | ----------------------------------------------------------------------------------------------------- |
| `name`        | string         | 是   | 工具名，`^[a-z][a-z0-9_]{0,39}$`，不含 `__`，条目间不重名；也是 localStorage 里凭据与免确认记录的键名 |
| `label`       | `{zh, en}`     | 是   | 显示名，中英两份都必填且非空                                                                          |
| `endpoint`    | string         | 是   | 绝对的 `http://` 或 `https://` 地址；明文且非本机时确认卡会带未加密提示                               |
| `tips`        | `{zh, en}`     | 否   | 首次收集 token 时表单里显示的获取提示，中英两份都必填；已保存过 token 时不再显示                      |
| `description` | string         | 否   | 给模型看的说明，**用英文**；缺省用工厂的通用说明                                                      |
| `timeoutMs`   | integer ≥ 1000 | 否   | 请求超时，缺省 30000                                                                                  |

```json
"hostComponents": [
  {
    "name": "wechat",
    "label": { "zh": "微信", "en": "WeChat" },
    "endpoint": "http://localhost:3333/",
    "tips": {
      "zh": "请向小鲁班发送“获取发送token”",
      "en": "Send \"获取发送token\" to XiaoLuban to get the send token."
    }
  }
]
```

- **没有 token 这一项**：token 由用户在对话里的表单填写、存进 localStorage，不进配置，也不进构建产物。
- **没有 `fetch`**：它是函数，不是数据。扩展页的请求受 manifest 的 `host_permissions` 约束，
  `endpoint` 要被它覆盖（现有的 `<all_urls>` 已覆盖）才不受网页式 CORS 限制；服务端另有自己的校验。
- **写错会让构建失败**，错误信息指到字段的完整路径（如 `hostComponents[0].endpoint`）：
  未知键、缺必填键、`name` 不合规或重名、`endpoint` 不是 `http(s)` 地址、`timeoutMs` 不是 ≥ 1000 的整数、
  `label` / `tips` 缺了某种语言或写成了单个字符串。
- **与 SDK 自带工具重名**（如 `query_table`）构建期查不出来，会在第一次发送时报 `VALIDATION_FAILED`——起名时避开。
- **改了要重新构建才生效**：组件在侧边栏打开、引擎构造时装配。
- 这一节不是 SDK 的配置契约，SDK 的校验器对它原样放过（`hostSections`）。

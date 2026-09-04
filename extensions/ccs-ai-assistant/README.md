# WebSkill browser extension host (example)

一个可加载的 MV3 扩展：side panel 里跑 `@webskill/chatbot`，选项页里跑 `@webskill/console`，
内容脚本里跑分册 13 的页面侧 agent，技能脚本跑在分册 12 的 sandbox 页里。

**这是示例，不是产品。** 先读下面这张限制表，再决定要不要照抄。

---

## 限制（先读这一节）

| 限制                              | 说明                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **技能脚本在沙箱页里联网受限**    | 沙箱页是 opaque origin，出站请求的 `Origin` 是 `null`，且**拿不到扩展的 `host_permissions`**。要联网的技能得由宿主在扩展页侧代理，本示例不做（分册 12 §5）。                                                                                                                                                                                    |
| **扩展持有 `<all_urls>`**         | 安装即授予「读取你访问的所有网站」。示例为通用性如此声明；**真实产品应把 `host_permissions` 与 `content_scripts.matches` 收窄到自己的业务域名**。                                                                                                                                                                                               |
| **模型 API key 明文存于扩展存储** | 模型端点与密钥配在扩展内（`localStorage`，见 FR-14.9），`localStorage` 与 `chrome.storage` 都**不加密**。任何能打开这个扩展页面的人、任何能读该 profile 目录的进程，都能拿到密钥。换来的是「不依赖后端就能跑」，代价就是这条。                                                                                                                  |
| **企业内分发 + 固定扩展 ID**      | `manifest.json` 里的 `key` 把扩展 ID 固定住，side panel 与选项页因此同源、共享 `localStorage`。本示例按**企业内分发 / 开发者模式加载**设计；上架公开商店需另行做合规评估，本册不覆盖。                                                                                                                                                          |
| **页面给的工具与技能不可信**      | 握手锚点在页面自己的 JS 世界里，页面上**任何脚本**都读得到它、也能塞一个假端点进来；nonce / 闭包在同一个世界里都挡不住，这一点无解。握手**没有**给页面新权限（它本就能调自己的端点），真正新增的风险是**向模型投毒**：伪造的工具与技能描述会进上下文。因此它们与 WebMCP 同级对待，且不绕过任何页面操作确认（分册 18 FR-18.7）。                 |
| **扩展持有 `downloads` 权限**     | 用于列出你最近下载的文件（`chrome.downloads.search`）。**没有它就没有别的办法**：模型不该、也不能拿到磁盘路径，取件号必须由浏览器的下载记录生成。取字节还额外要求你在 `chrome://extensions` 上手动打开「允许访问文件网址」，扩展自己开不了。能力本身缺省**关闭**（设置 › 沙箱 › 读取下载的文件），且每次列出与每次读取都要你点确认（分册 20）。 |

---

## 结构

```
manifest.json          MV3；固定 key、sandbox.pages、side_panel、options_page
sidepanel.html         → src/sidepanel/main.tsx  （chatbot）
options.html           → src/options/main.tsx    （console）
sandbox.html           只有一行 <script src>，不含任何内联脚本
src/
  sandbox/sandbox.js   由 SANDBOX_PAGE_SCRIPT_SOURCE 落盘，**逐字**相等，勿手改
  sidepanel/           UI 挂载 + 绑定条（不含 chrome.*）
  options/             console 挂载
  content/             页面侧 agent（createPageAgentHandler）+ MAIN world 点击探针
  background/          service worker：点图标开 side panel
  shared/              唯一碰 chrome.* 的一层：装配、传输、帧路由、取件闸门、授权记忆、范围声明
```

### 两层沙箱，互不相通

| 层                 | 跑在哪                       | 谁在这层                                   |
| ------------------ | ---------------------------- | ------------------------------------------ |
| **技能沙箱**（12） | side panel → iframe → Worker | 技能脚本；opaque origin；摸不到 `chrome.*` |
| **页面代理**（13） | 目标页的内容脚本             | `createPageAgentHandler()`；有 DOM，无技能 |

技能要操作页面，走的是：模型工具调用 → side panel 的 `PageActionPolicy` → transport →
内容脚本。**技能自己拿不到页面**。

### 链接文档取件与公共后缀表

页面上的附件（xlsx / pdf / docx 下载链）由**内容脚本**带着 `credentials: 'include'` 取，
而不是 side panel 自己 `fetch`：side panel 跑在 `chrome-extension://` 源下，
它的 cookie jar 不是用户在那个站点上的会话，取回来的会是一张登录页。

能取哪些地址由 `src/shared/fetchGate.ts` 判，判据是「与当前绑定 tab 同**注册域**（eTLD+1）」。
闸门在 side panel 侧而不在内容脚本侧：后者跑在页面的 renderer 里，被 XSS 的页面能改它的行为。

注册域由 [`tldts`](https://www.npmjs.com/package/tldts) 计算。它内置一份随包发布的
[Public Suffix List](https://publicsuffix.org/) 快照，**运行时不联网**。

- **为什么不自己取后两段**：`.com.cn` / `.co.uk` 这类多段后缀上它必错，
  而且错的方向是**放宽**——会把 `evil.com.cn` 判成与 `victim.com.cn` 同域。
- **快照怎么刷新**：跟着依赖走，`pnpm --filter ccs-ai-assistant update tldts`
  后重新构建。PSL 的变动节奏是天级的，过期快照的后果是少数新后缀被当普通域名（偏保守方向），
  不会反过来放宽。
- **PSL 给不出注册域时**（IP、`localhost`、内网单标签主机名）退回**严格同主机**。

PDF 文本抽取用 `pdfjs-dist`，只装在这个扩展里、不进 SDK：它带着自己的 worker、字体表和 CMap，
打包进 `@webskill/browser` 会让每个只想读 DOM 的使用方都背上这几 MB。

---

## 构建与加载

```bash
pnpm install
pnpm --filter ccs-ai-assistant build
```

然后 `chrome://extensions` → 打开「开发者模式」→「加载已解压的扩展程序」→
选 `extensions/ccs-ai-assistant/dist`。

`src/sandbox/sandbox.js` 已入库：CI 的守卫测试要在**不构建**的情况下比对它与
`SANDBOX_PAGE_SCRIPT_SOURCE`。改了 SDK 的沙箱页协议后运行
`pnpm --filter ccs-ai-assistant sandbox:write` 重新落盘。

### 打包期配置 config.json

把 `config.example.json` 复制成 `config.json`，构建时它会改写两处：

- **Console 的缺省值**——模型列表、页面图像抓取、智能体运行时 / 沙箱与安全 /
  快捷指令 / 隐私与用户画像 / 外观各分区的开关，都能在这里写死。
  它是**缺省值**而不是强制值：用户在 Console 里改过的项永远优先，
  只有从没配过的字段才吃这份配置。
- **manifest 的 `name` / `version` / `description`**——写了就覆盖 `manifest.json` 里的那三项，
  其余字段（`key`、权限、入口路径）逐字保留。

映射与校验在 `scripts/extensionConfig.mjs`，产物由 `scripts/writeBakedConfig.mjs`
生成到 `src/generated/bakedConfig.ts`（构建 / typecheck / test 前自动跑）。
字段名拼错、枚举值非法、`defaultModel` 指向不存在的条目，都会让构建**直接失败**——
静默忽略会得到「看起来生效了其实没生效」的产物。

顶层分节对应 Console 的导航分页，分节内的字段名与 `RuntimeConfig` **同形**
（`agentRuntime.loop.maxTurns`、`agentRuntime.multimodal.imageAttachments`……），
方便对着界面逐项核对；数值的取值区间也照抄界面上对应的输入框，
避免烘焙出一个界面调不回来的值。模型条目同理，与 `RuntimeLlmEntry` 同形。

有两项在 Console 里有**两个入口**：`multimodal.pageImageCapture` 同时出现在
「连接 / 页面技能」和「设置 / 智能体运行时 / 多模态」，`multimodal.imageAttachments`
在模型面板里也能被联动打开。config.json 里它们只有一处，统一落在
`agentRuntime.multimodal` 下——同一个字段给两个配置位置，冲突时无解。

`config.example.json` 覆盖了 SDK 有默认值的每一个可配字段，
这一点由 `test/bakedConfig.test.ts` 的守卫用例锁住，防止示例悄悄落后于解析器。

#### 关于 apiKey：这是混淆，不是加密

`config.json` 里的 `apiKey` 不会以明文进入 `dist`（走 AES-GCM 密文），
落进 `localStorage` 的也是占位串。但**密钥与密文在同一个包里**，
任何人都能调用解密函数拿到明文；运行时它也必然在内存里、也必然明文发给模型提供方。

所以这一层挡的是自动化密钥扫描器与误提交，**不构成安全边界**。唯一真正的边界是：

> **带 key 构建出来的 `dist/` 等同于凭据本身，不要分发。**

`config.json` 已在 `.gitignore` 里，仓库只提交 `config.example.json`（`apiKey` 留空）。
另外，`sandbox.allowHttp`、`sandbox.capabilities.fetchData`、`privacy.userProfile`、
`agentRuntime.multimodal.pageImageCapture` 这类 SDK 缺省为「关」的闸门若在
config.json 里打开，构建时会打印一条警告——
那些默认值是经需求评审定下的（新增攻击面一律默认关），放宽要是有意识的决定。

### 如果沙箱页加载失败

分册 12 的就绪超时会报一条带 `documentUrl` 的错。本示例**没有**声明
`web_accessible_resources`——同一个扩展内部的页面 iframe 自己的沙箱页不需要它。
若你的 Chrome 版本上确实需要，按下面这样补，**`matches` 必须收窄**，
绝不能写 `<all_urls>`（那等于允许任意网站 iframe 我们的沙箱页）：

```json
"web_accessible_resources": [
  { "resources": ["sandbox.html", "sandbox.js"], "extension_ids": ["<本扩展的固定 ID>"] }
]
```

无论列不列，沙箱页脚本里的 `event.source === parent` 校验都保留。

---

## 用法

1. 点扩展图标打开 side panel。
2. 助手操作的永远是**浏览器当前的活动标签页**——你看哪一页，它就看哪一页，无需手动绑定。
   点链接弹出新窗口也照样跟过去。切到扩展自己的页面（选项页）时绑定不变。
   换 tab 或换 origin 时句柄表清空，旧句柄以 `PAGE_ACTION_STALE_REF` 失败并要求重新感知——
   模型不会拿着 A 页的 ref 去点 B 页。
3. 先在选项页（扩展菜单「选项」，或 chatbot 里的设置入口）配好模型。
   选项页与 side panel 同源，配完**无需重装** side panel。
4. 页面操作会弹确认卡。勾「不再询问」后，**同 origin + 同动作类型**不再弹；
   密码类控件与临时提升的目标永远不给这个复选框，也永远弹卡。
5. 已记住的授权在选项页 → Connections → Page skills 里可以逐条或整组撤销。
6. 绑定页如果是用 WebSkill SDK 搭的，它注册的 MCP 端点、页面技能与 WebMCP 工具会**自动出现**在
   Connections 的三个面板里，页面一行不用改（分册 18）。端点随页面生灭，换页即全部下线；
   嵌入帧里的端点**不接**。先读上面限制表里「页面给的工具与技能不可信」那一条。

---

## 测试

```bash
pnpm test:extension        # 扩展 e2e：真开浏览器，不进 CI
```

它不进 CI（无头模式下 MV3 扩展加载不稳），因此它被写进了
[RELEASING.md](../../RELEASING.md) 的 Pre-release checklist，是发版前的必跑项。
能静态判定的部分（manifest 字段、`sandbox.js` 一致性、README 这四条限制、
挂载文件不含 `chrome.`）留在 CI 单测里，见 `test/browserExtension.test.ts`。

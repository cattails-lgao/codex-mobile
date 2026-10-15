# round-170 · chrome MCP 真机复验批 0–4(纯验证轮)

**性质**：**零产品代码改动** —— 用户要求「直接使用启动 chrome mcp 来验证改动」。全部产物是 `tmp/` 下不进仓的验证资产(`tmp/r170-mcp-inject.js` 注入脚本、`tmp/r170-methods.json` 方法目录快照)。未 bump 版本 / 未 tag / 未发版。

## 一、方法

`scripts/dev.cjs`(5173,隔离 home `<codex 隔离 home>`)+ chrome-devtools MCP 真实 Chrome。合成线程方案从 playwright 路由拦截(playwright 的 `context.route`)换成**页面内 fetch monkey-patch**:

- MCP `navigate_page` 的 `initScript` 用 6 行同步 XHR + eval 引导 `/tmp/r170-mcp-inject.js`(Vite 伺服 `200 text/javascript`);
- 注入脚本拦 `POST /codex-api/rpc`(`thread/read` / `thread/resume` / `thread/turns/list` / `thread/revert` / `turn/start` / `thread/fork`)与(按需)`GET /codex-api/meta/methods`,记录调用到 `window.__r170`;
- **坑**:`initScript` 不跨导航保持 ⇒ **每次导航都要带**;同文档 hash 跳转不重载文档 ⇒ 每场景换查询串(`?r170s=<n>`)。

## 二、结果(10 场景全过)

| # | 场景 | 断言 |
| --- | --- | --- |
| S1 | 内联编辑保存(批 4 #2) | `thread/revert{beforeTurnId:'t2'}` 先发 → `turn/start` 后发,`turnTrigger:'edit_user_message'`、input 含新文本,编辑器关闭 |
| S2 | Cancel 取消 | 零 RPC,编辑器关闭,原文保留 |
| S3 | 未改动保存 | no-op 守卫,零 RPC,编辑器收起 |
| S4 | Esc 取消 | 零 RPC,编辑器关闭 |
| S5 | Fork 自倒数第二轮(批 4 #1) | `thread/fork{beforeTurnId:'t2'}`,fork 线程只余 t0/t1 |
| S6 | Fork 自最后一轮 | **无 `beforeTurnId` 的全量 fork = 正确降级**(其后无轮次 ⇒ `findForkCutoffTurnId` 返回 null),**不是回归**——中途曾误判,读 `useDesktopState.ts:2658-2661` 定性 |
| S7 | 能力门控·设置面板(批 4 #3) | 真实桥 104 方法 ⇒ remoteControl 缺 4 方法=false、其余 8 能力=true;DOM 互斥分支:`.sidebar-settings-remote-empty` 显示 "Remote control is not supported by this Codex version."(toggle 不渲染)、hooks 走列表分支 |
| S8 | 能力门控·目录页反向 | 拦 `meta/methods`(响应 `{"data":[...]}`)剔除 `app/list` ⇒ Apps tab 显示 "Apps APIs unavailable in this Codex CLI.";4 个 tab 结构不受门控(设计如此,门控收敛的是内容) |
| S9 | 能力门控·目录页正对照 | 不剔除 ⇒ unavailable 文案不出现 |
| S10 | 时间分隔(批 1 #1) | turn 级 `startedAt`:昨天 22:00 ⇒ `Yesterday 22:00`;间隔 20 分钟(**<30,且基准是上一条分隔栏**)⇒ 不标;跨天 ⇒ `Today 08:00` |

附加:编辑按钮 title/aria 均为 `Edit this message`(批 4 #4);内联编辑器 UI(预填原文 / Save / Cancel / 回退提示文案)截图正常。

## 三、字段层级教训(时间分隔)

时间戳的协议来源是 **turn 级 `startedAt`**(数字,`toIsoFromTurnTimestamp`:`>1e11` 视为毫秒否则 ×1000 秒);item 上的 `turnStartedAtIso` 是 normalizer(v2.ts:844)的**产物**,不是输入。首轮注入把 `turnStartedAtIso` 挂在 userMessage item 上 ⇒ 无分隔,读 `ThreadConversation.vue:1141-1149` + `v2.ts:844-846` 修正后命中。

## 四、环境坑(复验工具链)

- chrome-devtools MCP 的 profile 被残留 Chrome 进程占用 ⇒ `new_page`/`list_pages` 直接报 "browser is already running";先按 CommandLine 匹配 `chrome-devtools-mcp` 杀主进程再重试。
- MCP 截图的 `filePath` 受其 workspace roots 限制(拒绝 `<项目目录>/**`)⇒ 用内联截图(结果落在 blobs)。
- `SettingsDialog` 的门控文案断言**别信 `body.innerText` 一次性快照**(methodsLoaded 未完成/分组切换会读到中间态)——断言 DOM 互斥分支元素(`.sidebar-settings-remote-empty` vs `.sidebar-settings-remote-toggle`)。

## 五、验证覆盖结论

至此批 0–4 **全部代码改动均有验证**:批 4 四项 + 批 1 #1 时间分隔为本轮真机复验;批 3 三步此前各有真机/闸门验证(r155/r163/r165/r166);批 1 #3 + 批 2 有 r152 有头实测 36 项;批 0 为零调用点纯函数(27 例单测即全覆盖)。**唯一悬空 = 批 1 #4 真机人手按键**(`Ctrl+J`/`Ctrl+B`,CDP 注入绕过浏览器 `PreHandleKeyboardEvent`,自动化测不出,判定书 §六 登记的人工动作)。

## 六、诚实边界

- 合成线程是 3 轮小样本;批 3 窗口化的规模面(170 轮)未在本轮重跑(已有 round-166 真实数据 9 场景收口,不必重复)。
- 能力门控只验了「方法集合维度」的真机呈现;版本维度(`sinceCli`)尚未接入(桥未上报 CLI 版本,round-168 已登记)。
- `tmp/` 资产不进仓 ⇒ 本轮探针不可 CI 复跑(与 r166/r168/r169 探针同一口径)。

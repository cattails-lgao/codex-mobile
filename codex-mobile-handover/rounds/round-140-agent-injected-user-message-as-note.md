# Round-140：多代理投递写入的 userMessage 改渲染为「代理注记」——用户气泡只留给真人（2026-10-10）

> **背景：** 用户报**线上环境**（`codex.arderpanada.top` → `1.15.149.204`）出现「消息列表压缩时，
> agent 的消息变成了用户消息」并附截图：一条 agent 口吻的正文（「CP8恢复实物：…需主核判据冲突」）
> 被画成**右侧用户气泡**，用户明确指认「**这个不是我发的**」。
> 用户随后给出服务器地址要求上机取证，取证定案后又下指令「**按照建议开始**」——
> 即先花一次实证把判据坐实，再按方案实施。
>
> 基线：`946a1c85`（round-139 末次提交，`package.json` = `0.1.129`）。本轮**已 bump 到 0.1.130**（见 §九）。

---

## 一、结论先行

| 项 | 本轮结论 | 一句话依据 |
| --- | --- | --- |
| 「agent 消息变用户消息」 | **不是压缩、不是渲染层翻转角色**；是 **codex 多代理 `sendInput` 投递**被 app-server 以 `userMessage` 条目写进接收会话**正在运行的那个 turn** | 线上 `thread_history_1.sqlite` 里那两条**本身就是** `{"type":"userMessage","clientId":null,…}`；同段文本在**另一线程** `01a12390-…` 里是 `collabAgentToolCall{tool:"sendInput", receiverThreadIds:["01a112e1-…"]}`（§三） |
| 客户端侧能不能修 | **能，且本轮已修**：把命中的 userMessage 渲染成**居左、弱化、带来源标签的注记**（`data-role="system"` / `data-message-type="agentNote"`），不再画右侧气泡 | 判据与渲染面都是本仓可控的（§二、§四） |
| 判据 | `clientId == null` **且非该 turn 首条 userMessage** ⇒ 代理注入；另加正文前缀 `<subagent_notification>` / `<environment_context>` | **0.161.0 三个探针实测**：`turn/start` 与 `turn/steer` 都会把 `clientUserMessageId` **回写成 `userMessage.clientId`**（§二） |
| 前提修复 | 本仓**从不传** `clientUserMessageId` ⇒ 线上 clientId 全 `null`、真用户与注入**在数据上不可辨**。本轮给 `turn/start` 与 `turn/steer` **都补上**该字段 | 线上 46 条 userMessage 的 clientId 全 null（§三①）；`grep clientUserMessageId src/` 改动前**零命中** |

证据：`vue-tsc` **EXIT=0**；全量 **812/812（80 文件）**；静态契约 **52 → 53**；
新增浏览器闸门 `check-agent-note-surfaces` **56/56**；`vite build` / `tsup` **EXIT=0**；
**反跑**（保留断言、只改生产代码）⇒ 契约 **10 个变异全红**、闸门 **48/56** 与 **4/56**（含**逐字复现原 bug**：气泡数 5），还原后 **56/56**（§七）。

---

## 二、先实证：`clientUserMessageId` 到底会不会被回写（本轮的第一件事）

判据「`clientId == null` ⇒ 非客户端提交」此前是**强推断而非实证**。按用户「按照建议开始」，
先花一次探针把这条坐实——**因为整个方案的可行性全押在它身上**。

做法：三个脚本 **stdio 直连 `codex.exe app-server`**（绕开 HTTP 与代理），配 `node:sqlite` 只读取 DB。

| 探针 | 做了什么 | 结果 |
| --- | --- | --- |
| `tmp/r140-probe-clientid.cjs` | A/B 对照：A 组 `turn/start` **带** `clientUserMessageId`；B 组不带 | **A：`clientId` = 传入值（MATCH=true）**；**B：`clientId` = `null`** ⇒ **映射成立** |
| `tmp/r140-probe-steer2.cjs` | 本地假 provider 回流最小 Responses SSE（`response.output_text.delta` 等）**让 turn 真跑完**，中途发 `turn/steer` | `ord=7` `userMessage clientId="46b32839-…"`（turn/start）与 `ord=13` `userMessage clientId="3f46485c-…"`（turn/steer）**同一 turn 内两条 userMessage** ⇒ **steer 也回写** |
| `tmp/r140-probe-read.cjs` | 验 `thread/read {includeTurns:true}` 与 `thread/turns/list` 的返回 | 两种读路的 userMessage item 都带 `clientId`（keys = `["type","id","clientId","content"]`），值与提交时一致 |

**第二个探针纠正了一个危险的简化。** 中途曾想直接按「同一 turn 内第 2 条 userMessage 即注入」判定——
探针 #2 证明**同轮两条 userMessage 是正常形态**（我们自己的 `turn/steer` 就造成），
且 steer 同样回写 clientId。**故位置判据必须与 clientId 组合，单独使用会误伤真用户的 steer。**

> 探针 #1 的一处早期误读记在这里：探针 #2 的第一版（挂起状态下发 steer）看不到新条目，
> 一度以为「steer 不入库」；换成假 provider 让回合跑完后才看到条目 —— **结论是「挂起态不落库」，不是「不入库」**。

---

## 三、根因（线上上机取证，已锁死）

### 3.1 线上环境事实

| 项 | 值 |
| --- | --- |
| 入口 | `https://codex.arderpanada.top` → nginx → `127.0.0.1:3030`；UI = `codex-mobile-re/dist-cli/index.js -p 3030` |
| app-server | `@openai/codex@0.162.0`（问题发生时 `cli_version` 记的是 `0.160.1`）、`CODEX_HOME=/root/.codex` |
| 问题线程 | session `01a112e1-…` / `thread_id` = `01a1199f-57cd-7102-ac3c-db406a36e677` |
| 上机方式 | 本机 `~/.ssh/id_rsa` 可直接 `root` 登录 `1.15.149.204`（OpenCloudOS 9.4） |

### 3.2 判据定案：不是渲染层，是写入侧

- 那两条消息在 `thread_history_1.sqlite` 的 `thread_items.item_json` 里**字面就是**
  `{"type":"userMessage","clientId":null,"content":[…]}` ⇒ **服务端 item 流里就是用户消息**，
  任何客户端读回都只能画成用户气泡。**没有任何「先 agent 后改 user」的过程。**
- 同段文本在**另一个线程** `01a12390-…` 里是
  `{"type":"collabAgentToolCall","tool":"sendInput","senderThreadId":"01a12390-…","receiverThreadIds":["01a112e1-…(本会话)"],"prompt":"CP8恢复实物：…"}`
  ⇒ **多代理跨线程 `sendInput` 的投递被 app-server 以 `userMessage` 写进接收会话条目流**。
- **不关压缩的事**：该 rollout 里 19 条 `contextCompaction` 只产出「上下文已压缩」行、只影响折叠与排序，**不碰角色**。

### 3.3 线上全库统计（判据的标定，也是「误伤面」的下界）

对线上库全部 **6362 条** `userMessage` 按「是否轮内首条 × clientId 是否为空」分类：

| 形态 | 条数 | 含义 |
| --- | ---: | --- |
| PLAIN · **首条** · `null` | 5 463 | 老数据 / 本仓改动前的真用户提问（那时我们从不传 id） |
| PLAIN · **非首条** · `null` | **705** | **代理注入**（判据命中目标） |
| PLAIN · **首条** · 非空 | 193 | 别的客户端提交的提问 |
| PLAIN · **非首条** · **非空** | **1** | 客户端 `steer` —— **必须保住** |

⇒ 判据精确命中 **705**、**放行那 1 条 steer**。这也解释了为什么判据必须组合：
只看位置会连那 1 条一起误伤，只看 clientId 则救不了 5463 条老数据里的首条。

### 3.4 为什么本仓改动前**在数据上不可辨**

`userMessage.clientId` 就是客户端提交时传的 `clientUserMessageId`（`TurnStartParams` / `TurnSteerParams`
的 `string|null` 字段）。改动前 `grep clientUserMessageId src/` **零命中** ⇒ 本 UI 提交的每条消息
clientId 都是 `null`，与代理注入**长得一模一样**。⇒ **判据能成立的前提是先把这个字段补上**（§四①）。

---

## 四、修复（5 组改动 + 4 处下游消费点）

### 4.1 判据（`src/api/normalizers/v2.ts`）

```ts
const AGENT_NOTE_TEXT_PREFIXES = ['<subagent_notification>', '<environment_context>']

function isInjectedUserMessage(message: UiMessage, indexAmongUserMessages: number): boolean {
  const text = message.text.trimStart()
  if (AGENT_NOTE_TEXT_PREFIXES.some((prefix) => text.startsWith(prefix))) return true
  if (indexAmongUserMessages <= 0) return false        // 轮内首条：永不判为注入
  return (message.clientId ?? null) === null
}
```

- **轮内首条永不判为注入**：老数据 / 别的客户端没写 id 时，首条**就是**用户提问。
- 前缀判据**可以先于位置判据命中**：`<subagent_notification>` / `<environment_context>`
  这两种包裹形态本身就是来源签名，即使它们是轮内首条也判注入。
- `toUiMessages` 的 userMessage 分支把 clientId 带出来（空串 → `null`）：

  ```ts
  clientId: typeof item.clientId === 'string' && item.clientId.length > 0 ? item.clientId : null,
  ```

- `normalizeThreadMessagesV2` **逐 turn** 打标（计数只认真正的用户消息条目；
  `rawBlocks`（未知 `UserInput` 变体的兜底）**不是独立消息**、`isUnhandled` 不参与轮内序号）：

  ```ts
  let userMessageOrdinal = 0
  for (const message of turnMessages) {
    if (message.role !== 'user' || message.isUnhandled === true) continue
    if (isInjectedUserMessage(message, userMessageOrdinal)) message.isAgentNote = true
    userMessageOrdinal += 1
  }
  ```

- `repositionCompactionAfterUserMessage` 的「轮首 user 消息」锚点**跳过注记**
  （`candidate?.isAgentNote !== true`）——否则压缩行会挂到代理注记后面。

### 4.2 类型（`src/types/codex.ts`）

`UiMessage` 新增 `clientId?: string | null` 与 `isAgentNote?: boolean`（均带来源注释）。

### 4.3 分组与轮次边界（`src/utils/transcriptGrouping.ts`）

- `TurnRenderItemKind` 新增 `'agent-note'`。
- `renderItemKind` 的 `agent-note` 判断**必须排在 `role === 'user'` 之前**——注记**本身就是 user 角色**。
- 新增导出 `isUserAuthoredMessage(message)`（`role === 'user' && isAgentNote !== true`）。
- `buildTurnRenderGroups` 改为 `if (isUserAuthoredMessage(message) || !current)`：
  **注记不开新轮组**——这是「截图里一条条独立气泡」的**直接原因**，只改渲染不改这里会留下一堆空轮组。
- `buildTurnGroups` 的 `isUserMessage` 改用 `isUserAuthoredMessage`（轮次边界只由真人消息确立）。

### 4.4 渲染面（`src/components/content/ThreadConversation.vue` / `ThreadTurn.vue`）

- `ThreadTurn.vue` 的 `ConversationTurnItem.presentation` 增加 `'agent-note'`。
- `ThreadConversation.vue` 的 `processItems` 把 `kind === 'agent-note'` 映射成 `presentation === 'agent-note'`，
  并在通用 `v-else` 分支**之前**加渲染分支：

  ```html
  <div v-else-if="item.presentation === 'agent-note'" class="message-row thread-agent-note-row"
       data-role="system" data-message-type="agentNote">
    <div class="message-stack" data-role="system">
      <article class="thread-agent-note">
        <div class="thread-agent-note-header">{{ t('Agent note') }}</div>
        <div class="thread-agent-note-body" v-html="renderMarkdownBlocksAsHtml(message.text)" />
      </article>
    </div>
  </div>
  ```

  外观＝**居左 + 弱化**（`rounded-md border-line-1 bg-s1/60 text-ui text-ink-3`，暗色走
  `:root.dark .thread-agent-note { border-line-2 bg-s2/60 text-ink-4 }`）＋ **来源标签**，
  与用户自己的提问明确区分。正文走既有的 `renderMarkdownBlocksAsHtml`，**保真不减**。
- `editableTurnIdByMessageId` 改用 `isUserAuthoredMessage` ⇒ **代理注记不可被「编辑消息」**。

### 4.5 前提修复：提交时带上 `clientUserMessageId`（`src/api/gateway/threads.ts`）

新增 `createClientUserMessageId()`：优先 `globalThis.crypto.randomUUID()`，
**非安全上下文（`http://<lan-ip>`）下该方法不存在** ⇒ 回退分支自产 v4 形态串
（`Math.random` + 固定 `4` / `8|9|a|b` 位）。`turn/start` 与 `turn/steer` **各加一处**
（`clientUserMessageId: createClientUserMessageId()`，**实测命中 2 处，静态契约钉住**）。

> 为什么两处都要加：实测 `turn/steer` **也回写** clientId。只加 `turn/start` 的话，
> 本 UI 自己发出的 steer 在新判据下就会因为「轮内非首条 + null」被误判成代理注记。

### 4.6 下游消费点（4 处，全部改用 `isUserAuthoredMessage` / `isAgentNote` 守卫）

| 文件 | 位置 | 为什么 |
| --- | --- | --- |
| `src/App.vue` | `latestUserTurnId`、`onRollback` | 回滚/「最新用户轮」不能锚在代理注记上 |
| `src/composables/useDesktopStateUtils.ts` | `hasEquivalentUserMessage`（target 与候选）、`dedupeAssistantAgentMessageText` 的轮次重置、reasoning 锚点 `lastUserIndex`、live 插入点轮次边界（共 6 处） | 注记不该参与「同一用户消息」去重、也不该当推理锚点 |
| `src/composables/useDesktopState.ts` | `interruptedUserMessage` 查找 | 中断回填不能填到代理注记里 |
| `src/composables/useUiLanguage.ts` | 新增 `'Agent note': '代理注记'` | 本仓 i18n **以英文串为 key**（`zhCN[msg] ?? msg`）⇒ 新文案必须补表值，否则中文版直接显示英文 |

---

## 五、用户可见行为（改动前后）

| 场景 | 改动前 | 改动后 |
| --- | --- | --- |
| 代理 `sendInput` 投递的正文 | **右侧用户气泡**（像是「我说过这句话」） | **居左注记** + 「代理注记」来源标签 |
| 代理注记所在的轮 | 被当成一轮的 request，**自己开一个轮组** | **不开新轮组**，附在所处轮内 |
| 真人提问（本仓提交） | 用户气泡 | 用户气泡（带 clientId，永不误判） |
| **客户端 steer**（同轮第 2 条） | 用户气泡 | 用户气泡（**已实测回写 clientId ⇒ 不误判**） |
| 压缩行（`contextCompaction`） | 「上下文已压缩」 | 一行未改（token 等值 **792/792 逐字相同**） |
| 代理注记的「编辑消息」入口 | 可点（因为被当 user 消息） | **不可点** |

---

## 六、验证

### 6.1 基线

| 闸门 | 结果 |
| --- | --- |
| `vue-tsc --noEmit` | **EXIT=0**（空输出） |
| 全量 Vitest | **812/812 通过（80 文件）** |
| `check-ui-contract.cjs` | **53/53**（52 → 53，新增 round-140 一项 10 判据） |
| `scripts/check-agent-note-surfaces.cjs`（本轮新增） | **56/56 × 4 RUN**（亮/暗 × 桌面 1440 / 窄屏 390） |
| `check-fonts` / `check-theme` / `check-message-media-surfaces` | **13/13** · **15/15** · **44/44** |
| `check-token-equivalence.cjs` | **792/792 逐字相同**（外观零改动） |
| `vite build` + `tsup` | 均 **EXIT=0** |

**本轮增量 = 10 例新单测**：`src/api/normalizers/v2.agentNote.test.ts`（5 例）＋
`src/utils/transcriptGrouping.agentNote.test.ts`（4 例）＋ `useUiLanguage.test.ts`（+1，中文表值）。
另 `src/api/codexGateway.test.ts` 的 `steerThreadTurn` 精确参数断言因新增字段而失败 ⇒
改为 `expect.any(String)` + v4 正则断言（**保留强度、放开取值**）。

**一条环境性失败（与本轮无关，已隔离确认）**：
`codexAppServerBridge.archive.test.ts > writeWorkspaceRootsState > persists workspace roots in canonical form`
在**并发跑 80 文件**时 `Test timed out in 15000ms`（本机整轮 45.5s，`externalSessionTracker` 单项就 42s）；
**隔离复跑 36/36 通过**。这是 round-115 已登记的**负载敏感 fs 超时**（`mkdtemp → 写文件 → 业务 fs → rm -r`
全落 `os.tmpdir()`），与本轮改动无关；随后一次全量复跑 **812/812 全绿**。

### 6.2 静态契约新增的 1 项（52 → 53）

**代理投递写入的 userMessage 渲染为注记，用户气泡只留给真人（round-140）**——
`判据字段` / `带出 clientId` / `包裹前缀规则` / `非首条+null 判据` / `逐轮计数` /
`agent-note kind` / `不开新组` / `轮次边界守卫` / `渲染注记` / `提交带 id（命中 2 处，须 2）`
**十项同时成立**。

### 6.3 反跑（证明断言非空）

**做法沿用 round-137 的教训：保留断言、只退回生产代码**（把断言一起回退＝空过）。

- `tmp/r140-contract-reverse.cjs`：对 `check-ui-contract` 做 **10 个变异**（逐个破坏判据特征）
  ⇒ **全部如期失败**、还原后 **53/53** 恢复。
- `tmp/r140-gate-reverse.sh`：对浏览器闸门做 2 个变异 ——
  - **变异 A**（`renderItemKind` 去掉 `agent-note` 分支）：**用户气泡数变 5，逐字复现原 bug**、**48/56 失败**；
  - **变异 B**（`buildTurnRenderGroups` 让注记开新组）：`turnBlocks = 5`（应 2）、**4/56 失败**；
  - 还原后 **56/56** 全绿。

### 6.4 浏览器闸门 `check-agent-note-surfaces.cjs`（新增，400 行）

照 `check-message-media-surfaces.cjs` 的套路：`page.route` **只拦 `**/codex-api/rpc`**，
对 `thread/read` / `thread/resume` 回**合成** thread，其余 RPC 一律透传
⇒ 被检验的是**真实管线**（归一化 → UiMessage → 分组 → 组件 → CSS），**只有数据是合成的**。
合成 3 个 turn：①同一轮里 genuine + injected + steer ②`<subagent_notification>` 轮 ③`<environment_context>` 轮。

断言（56 项）：用户气泡**恰好 2 个**（真提问 + steer）、**注入的那条不再是气泡**、
注记**恰好 3 条**、`data-message-type="agentNote"` 行数 = 3、注记正文**保留 3 个关键字**
（防 `v-html` 把正文吞掉）、**居左**、标题非空、有真实占位（宽高 > 0）、不溢出视口、
正文对比度 **≥ 4.5:1**（暗色实测 **7.76:1**）、**注记不开新轮组**（`turnBlocks === 2`）。

### 6.5 `SHARED_BRIDGE_VERSION` **未 bump**（本轮**有意**）

本轮**全部**改动在客户端侧（`src/api/gateway/**`、`src/api/normalizers/**`、`src/utils/**`、
`src/components/**`、`src/composables/**`、`src/types/**`），**没有**改 `src/server/**`：
既没给 `AppServerProcess` 加方法，也没动 `ThreadTerminalManager` 构造参数，
**共享对象本身没有变** ⇒ 按本仓判据（「共享对象变了才 bump」）不 bump。
`src/api/gateway/threads.ts` 是**浏览器的 RPC 客户端**，不是桥。

---

## 七、诚实边界

1. **判据依赖「客户端上报 `clientUserMessageId`」。** 本仓改动后自己发的消息都带 id；
   但**改动前产生的老数据**（线上 5463 条首条 + 193 条首条非空）没有这个字段，
   **只能靠位置兜底** —— 而那 705 条注入也全在「非首条」位置上，故对这批数据判定成立。
   残留的理论误伤面＝**「同一 turn 内、由本仓之外的客户端提交的第 2+ 条 userMessage」**
   （线上全库这类只有 **1 条**，且它是本仓 steer、改动后本就带 id）。
2. **没有在线上跑修复后的构建。** 线上仍是旧版；本轮的验证是「本机生产构建 + 合成 thread 的真实管线」，
   **不等于**「线上真线程验证」。
3. **压缩与注入在时间上相关但非因果。** 用户是在「压缩时」注意到的；实测 19 条
   `contextCompaction` 不影响角色。注入为什么常与压缩邻近**未确证**（两者都发生在长回合里，
   属合理联想，本轮未给证据）。
4. **`check-branch-list-budget.cjs` exit=1 属环境不足**：隔离 home 里没有线程 ⇒
   `waiting for locator('.thread-row')` 超时；同类 `verify-review-pane-scroll` /
   `verify-conversation-list-persists` / `verify-conversation-mount-scroll` 均 SKIP「桥里没有线程」。**非回归。**
5. **未做**：把「代理注记」也暴露给用户做**折叠/展开**或「查看原始投递」入口；
   代理注记当前**没有**复制/引用等操作条（有意——它不是用户说的话）。
6. **未 bump `SHARED_BRIDGE_VERSION`**，论证见 §6.5。
7. **本轮只修客户端渲染面**：服务端把代理投递写成 `userMessage` 的行为**未动**（也动不了），
   故**别的客户端**（Codex Desktop / CLI）读同一份数据仍会把它们画成用户消息。

---

## 八、涉及文件 + 复现方式

**改动（13 改 + 3 新增）**

`git diff --shortstat` = **13 files changed / +245 / −14**；**3 个新增文件共 569 行**。

**新增**

- `scripts/check-agent-note-surfaces.cjs`（**400 行**）：代理注记面的浏览器级闸门，56 项 × 4 RUN
- `src/api/normalizers/v2.agentNote.test.ts`（99 行，5 例）
- `src/utils/transcriptGrouping.agentNote.test.ts`（70 行，4 例）

**改（`git diff --numstat`）**

| 文件 | +/− | 内容 |
| --- | --- | --- |
| `src/api/gateway/threads.ts` | +39/−0 | `createClientUserMessageId()` + `turn/start` 与 `turn/steer` 各带 `clientUserMessageId` |
| `src/api/normalizers/v2.ts` | +41/−1 | 带出 `clientId` + `AGENT_NOTE_TEXT_PREFIXES` / `isInjectedUserMessage` + 逐 turn 打标 + 压缩重定位跳过注记 |
| `src/components/content/ThreadConversation.vue` | +57/−2 | `agent-note` 渲染分支 + `processItems` 映射 + `isUserAuthoredMessage` 接入 + 10 处 `.thread-agent-note*` 样式（含暗色） |
| `src/utils/transcriptGrouping.ts` | +15/−2 | `'agent-note'` kind + `isUserAuthoredMessage` + 不开新组 + 轮次边界守卫 |
| `src/types/codex.ts` | +8/−0 | `UiMessage.clientId?` / `isAgentNote?` |
| `src/composables/useDesktopStateUtils.ts` | +6/−5 | 6 处用户消息判定 |
| `src/api/codexGateway.test.ts` | +6/−0 | `steerThreadTurn` 断言补 `clientUserMessageId` |
| `src/App.vue` | +3/−2 | `latestUserTurnId` / `onRollback` |
| `src/composables/useDesktopState.ts` | +3/−1 | `interruptedUserMessage` |
| `scripts/check-ui-contract.cjs` | +55/−0 | round-140 契约项（52 → 53） |
| `src/composables/useUiLanguage.ts` | +1/−0 | `'Agent note': '代理注记'` |
| `src/composables/useUiLanguage.test.ts` | +10/−0 | 新增 describe「agent-note source label」 |
| `src/components/content/ThreadTurn.vue` | +1/−1 | `presentation` 增加 `'agent-note'` |

**复现命令**

```bash
NODE="<node 安装目录>/node.exe"

# 1) 静态与全量
"$NODE" node_modules/vue-tsc/bin/vue-tsc.js --noEmit
"$NODE" node_modules/vitest/vitest.mjs run
"$NODE" scripts/check-ui-contract.cjs

# 2) 反跑（保留断言、只退回生产代码）
"$NODE" tmp/r140-contract-reverse.cjs          # 10 个变异 ⇒ 全红；还原 ⇒ 53/53
bash tmp/r140-gate-reverse.sh                  # 变异 A/B ⇒ 48/56、4/56；还原 ⇒ 56/56

# 3) 生产构建（改了 src/** ⇒ dist 与 dist-cli 一起重建；emptyDir 会被 shim 拦 ⇒ 沙箱外跑）
"$NODE" node_modules/vite/bin/vite.js build
"$NODE" node_modules/tsup/dist/cli-default.js

# 4) 代理注记面的浏览器级闸门（56 项；环境不足退 2）
#    起桥 + 等就绪 + 跑闸门 + 杀进程树必须在同一个 shell 会话里；
#    沙箱内 node 的 fetch 连不上绑 0.0.0.0 的本机服务 ⇒ 用系统浏览器跑
CODEX_HOME=<隔离 home> "$NODE" dist-cli/index.js --no-tunnel --no-open --no-login --no-password -p 4190
PROFILE_BASE_URL=http://127.0.0.1:4190 "$NODE" scripts/check-agent-note-surfaces.cjs
```

**判据实证探针（`tmp/`，未入库）**：`r140-probe-clientid.cjs`、`r140-probe-steer.cjs`、
`r140-probe-steer2.cjs`、`r140-probe-read.cjs` + 各自 `*-out.txt`；
`r140-apply-agent-note.cjs`（29 处锚点改写，CRLF 归一，dry-run 全部「恰好命中 1 次」才写盘）；
`r140-contract-reverse.cjs`、`r140-gate-reverse.sh`；线上取证 `r140-online-collect.sh` /
`r140-online-rootcause.md` / `r140-user-message-forensics.cjs`。

---

## 九、落款说明

- **已 bump 到 `0.1.130`** 并建 **annotated tag `v0.1.130`** + GitHub Release（Latest）；
  `npm publish` 由维护者执行（本机 `npm` 凭据 401、`pnpm publish` 才是可用通道，见 round-138 段）。
- 本轮 **10 例新单测**与 **1 项契约**均**反跑证明非空**（§6.3）；新增**浏览器闸门 56 项**同样反跑
  （变异 A **逐字复现原 bug**）。
- **`SHARED_BRIDGE_VERSION` 未 bump** 是**有意的**（§6.5）。
- **只看客户端渲染面**：服务端把代理投递写成 `userMessage` 的行为未动（§七⑦）。

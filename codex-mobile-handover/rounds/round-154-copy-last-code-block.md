# 第一百五十四轮 · 复制最后一个代码块（对齐桌面端 `copyLastCodeBlock`）

> 判定书 `sections/desktop-parity-decision.md` §三·C 的**最后一处缺口**：桌面端有
> `copyLastCodeBlock`、我方「无」。本轮补齐。**纯前端**（未碰 `src/server/**`），
> 发布无需重部署桥。
>
> 这一轮与 round-153（批 3a）是两件事，各自独立提交。

---

## 一、桌面端的原样（取证）

从 `tmp/r145-asar`（桌面端 `app.asar` 拆出）逐个读出来的，不是推测：

| 项 | 值 |
|---|---|
| 命令 id | `copyLastCodeBlock` |
| 标题（zh） | `复制最后一个代码块` |
| 标题（en） | `Copy last code block` |
| 描述（zh） | `复制当前聊天中助手提供的最后一个代码块` |
| 分组 | `commandMenuGroupKey: 'thread'`，`commandMenu: true`（进命令菜单） |
| 键位 | `shortcutScope: 'app'`，electron `defaultKeybindings: [{ key: 'CmdOrCtrl+Shift+;' }]` |

⇒ 关键信息是**描述那句话**：范围限定在**助手**，语义是**全局最后一个**。
（桌面端的执行体在未拆出的懒加载 chunk 里，所以语义按描述定义，而不是照抄实现。）

---

## 二、实现

### 2.1 新增纯函数模块 `src/utils/conversationCodeBlocks.ts`（108 行，CRLF）

| 导出 | 语义 |
|---|---|
| `ConversationCodeBlock` | `{ messageId, turnIndex, language, value }` |
| `isAssistantContentMessage(m)` | 默认的「助手内容消息」判定：`role === 'assistant'` ∧ 非命令执行（`messageType === 'commandExecution'` **且**带 `commandExecution` 载荷）∧ 非 `worked` ∧ 非 `.live` |
| `collectCodeBlocksFromMessage(m)` | 单条消息里的代码块（按出现顺序） |
| `hasAssistantCodeBlock(messages, isAssistant?)` | **廉价**可用性判定（见 2.3） |
| `findLastAssistantCodeBlock(messages, isAssistant?)` | 全局最后一个助手代码块；找不到为 `null` |

**与渲染层同源**：解析走既有的 `parseMessageBlocks`（渲染层用的就是它），**不另写一份围栏正则**
——否则会出现「复制出来的内容和屏幕上的不一样」。

**递归**：块树里的嵌套只发生在**列表项**上（`unorderedList` / `orderedList` 的
`items[].children`；`taskList` 的 item 没有 `children`）。`blockquote` 是纯 `value: string`、
内部不再解析成块 ⇒ **引用块里的围栏不算代码块**，与渲染层一致（渲染层也只按 `codeBlock` 分支出代码块）。
有一条用例专门钉住这件事，并同时验证廉价判定不会因此误报。

**「最后一个」的正确形状**：从末尾往前找**第一条带代码块的助手消息**，取该消息的**最后一个**块。
最后一条助手消息没有代码块时**继续往前找**，而不是直接判空（桌面端描述是「当前聊天中……最后一个」，
不是「最后一条回复里的」）。

### 2.2 围栏正则唯一化（`src/utils/conversationMarkdown.ts`）

`readFenceStart` 原本内联了一条正则。`hasCodeFenceStart` 需要同一条判据，于是把它提到
`FENCE_START_PATTERN` 常量、由两个 `RegExp` 共用（`'u'` 逐行 / `'gmu'` 整篇）：

```ts
const FENCE_START_PATTERN = '^\\s{0,3}(```+|~~~+)\\s*([^\\s`~][^`]*)?\\s*$'
const FENCE_START_LINE = new RegExp(FENCE_START_PATTERN, 'u')
const FENCE_START_LINE_ANYWHERE = new RegExp(FENCE_START_PATTERN, 'gmu')
```

**两处各写一份正则迟早会漂移**，而后者恰恰是前者的「有没有」版本。新增导出
`hasCodeFenceStart(text)`（整篇扫描、遇首个即返回）。全局正则每次调用前重置 `lastIndex`
（否则 `test` 有状态，第二次调用会从上次位置继续 —— 有用例专测「连续多次调用结果稳定」）。

### 2.3 为什么需要一个**廉价**判定

命令面板的可用性收敛（无代码块时不出现该命令）依赖 `filteredMessages`，而**流式期间消息每次变化都会重算**。
全量 `parseMessageBlocks` 在大线程上是 O(总文本) 的块解析 + 列表嵌套，放在这个热路径上不合适。
`hasCodeFenceStart` 只扫「有没有围栏起始行」，且与解析器共用同一条模式串 ⇒ **命中即保证解析会产出
`codeBlock`**（围栏没有闭合行时解析器会一直吃到文末，仍然产出块）。提取本身只在**执行时**做一次。

两者不会分歧 —— 有一条语料对照用例断言
`hasAssistantCodeBlock(messages) === (findLastAssistantCodeBlock(messages) !== null)` 逐例成立，
并用另一条用例保证语料里**既有真也有假**（否则这条断言恒真）。

### 2.4 接线（`commandRegistry.ts` / `useUiLanguage.ts` / `App.vue`）

- **注册表**：新增 `{ id: 'thread.copy-last-code-block', title: 'Copy last code block', group: 'thread',
  keywords: ['code','snippet','clipboard','代码块','复制代码'], requiresThread: true }`（25→26 条）。
  `keywords` 按约定**不翻译**（中英双向召回）。
- **i18n**：zhCN 补 `'Copy last code block': '复制最后一个代码块'`。漏了会被 round-150 的
  「命令标题自动比对 zhCN 表」当场抓出。
- **App.vue**：`case 'thread.copy-last-code-block': void copyLastCodeBlock()`，
  函数体取 `findLastAssistantCodeBlock(filteredMessages.value)` 后 `copyTextToClipboard(block.value)`
  （与既有的 `copySelectedThreadChat` 同一条 best-effort 口径）。
- **收敛**：`if (command.id === 'thread.copy-last-code-block' && !hasAssistantCodeBlock(filteredMessages.value)) return false`
  —— 与 `thread.interrupt` / `thread.implement-plan` 同一处置，**面板永不给出空操作**。

### 2.5 刻意**不做**的两件事

1. **不加键位**。桌面端是 `CmdOrCtrl+Shift+;`，但我方的 `onWindowKeyDown` 开头就是
   `if (event.shiftKey || event.altKey) return`，要支持它就得为此放开守卫；而 `;` 与 round-150 的
   `/` 一样**依赖键盘布局**（非美式布局产不出 `';'`）。round-151 的结论是「布局相关键位必须有指针入口」，
   这里的指针入口就是命令面板（顶栏放大镜按钮）。**结论：只进面板，不绑键位**，也不设
   `shortcut` 展示字段（没有绑定就不该显示提示）。
2. **不做内联按钮**。桌面端这条命令的载体是命令菜单 + 菜单加速键，不是消息下方的常驻按钮
   （`commandMenu: true`）。面板条目 + 可用性收敛是它的对应物。

---

## 三、验证

| 项 | 结果 |
|---|---|
| 新用例 | **37/37** |
| 全量单测 | **998 例 / 87 文件全绿**（round-153 后 961/86，**+37 例 +1 文件**，零退化） |
| `vue-tsc --noEmit` | **EXIT=0** |
| 契约闸门 | **59/59**（round-153 后 58，新增 round-154 断言） |
| `vite build` | **EXIT=0** |
| 浏览器实测 | **13/13**（见 §四） |
| `tsup` | **未跑**（未碰 `src/server/**`） |

新用例覆盖：语言标记 / 无标记 / 一条消息多围栏 / `~~~` / 4 反引号里嵌 3 反引号 / 未闭合围栏 /
CRLF / 保留块内空行缩进 / 列表项内嵌套 / 引用块内不算 / 行内单反引号不算 / 空正文 /
`isAssistantContentMessage` 的四类排除 / `hasAssistantCodeBlock` 的跳过与回退 / 自定义谓词 /
`hasCodeFenceStart` 的缩进边界（3 空格算、4 空格不算）与连续调用稳定性 / 语料一致性对照。

### 闸门新增断言（58→59）与**六路反跑**

断言拆成 5 个子判据：`注册表条目` / `纯函数 API` / `解析同源` / `执行接线` / `模块纯净`
（最后一条要求模块**不 import vue、不 import 组件** ⇒ 可脱离应用单测）。

`tmp/r154-refute.cjs` 逐个破坏，**六次全部按预期转红、且翻红的子判据精确**，再按字节还原：

| 变异 | 结果 | 翻红的子判据 |
|---|---|---|
| A 摘掉面板可用性收敛 | `58/59` | `执行接线=NO` |
| B 注册表 id 改名 | `58/59` | `注册表条目=NO` |
| C 撤掉 `hasCodeFenceStart` 导出 | `58/59` | `解析同源=NO` |
| D 让模块 import vue | `58/59` | `模块纯净=NO` |
| E 复制错字段（语言而非正文） | `58/59` | `执行接线=NO` |
| F switch 分支改名 | `58/59` | `执行接线=NO` |

还原后 `59/59`，四文件**按字节一致**。

---

## 四、浏览器实测（`tmp/r154-verify-ui.cjs`，13/13）

**数据是合成的，管线是真的**：在浏览器层拦下 `thread/read` 与 `thread/resume`，回两份合成线程
（一份助手带两个代码块、一份只有用户贴的围栏），其余 RPC 一律透传 ⇒ 归一化 → `UiMessage` →
`filteredMessages` → 面板收敛 → `findLastAssistantCodeBlock` → 剪贴板**全都走真实代码**。
这样就不依赖本机恰好存在一条带助手代码块的真实线程（round-138 立的同一条边界）。

跑在**已在运行的 dev server**（`http://127.0.0.1:5173`，桥是 Vite 插件）上，有头/无头 Chromium +
`clipboard-read` / `clipboard-write` 权限。关键结果：

- `S1` 合成线程渲染出 **2 个** `.message-code-block` ⇒ 数据确实进了真实管线。
- `A1` 查 `code block` 只命中一行，标题 `Copy last code block`（面板默认英文界面；中文表值由闸门钉住）。
- `A3` 按回车后**剪贴板 === `echo SECOND`**，且 ≠ 第一个块、≠ 语言名 `bash`（三条各自独立，
  后两条专门防「取错字段」与「取错块」两类假通过）。
- `B1/B2` 在「只有用户贴的围栏」的线程上：该命令**查询为空时也不出现**，同一时刻面板仍列出 **23 条**
  别的命令 ⇒ 缺席是**收敛生效**，不是面板坏了或查询失灵。
- `C1` 控制台零 error。

---

## 五、诚实边界

1. **未采纳桌面端的键位** `CmdOrCtrl+Shift+;`（理由见 §2.5-1）：一是要放开
   `shiftKey`/`altKey` 守卫，二是 `;` 布局相关。桌面端在这一点上确实更强（菜单加速键），
   **这是本轮明确承认的一处「不如」**，补偿手段是顶栏那个指针入口。
2. **引用块内的围栏不算代码块** —— 这是解析器的既有行为（渲染层同此），不是本轮的取舍；
   若将来渲染层开始解析引用块内的块，这里必须同步。
3. **复制失败是静默的**（沿用 `copySelectedThreadChat` 的 best-effort 口径）。面板没有 toast 设施，
   本轮不新引入通知层；`copyTextToClipboard` 内部已有 `execCommand` 兜底。
4. **浏览器实测覆盖的是合成数据**（真实线程等价物未验）；且 `tmp/r154-verify-ui.cjs` 在 `tmp/`
   （被 gitignore）⇒ **不进 CI、不适合当闸门**。闸门覆盖结构、浏览器覆盖行为，两者不重叠。
5. **`collectCodeBlocksFromMessage` 只认围栏**。没有围栏的「缩进式代码块」在 Markdown 里
   本仓解析器也不产出 `codeBlock` ⇒ 不会被复制（与渲染一致）。
6. **未 bump 版本、未 tag / Release**；`SHARED_BRIDGE_VERSION` 未 bump。

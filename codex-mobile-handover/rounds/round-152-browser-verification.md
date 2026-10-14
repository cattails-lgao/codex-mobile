# 第一百五十二轮：启动浏览器实测（命令面板 / 快捷键速查 / 全局键位），并修掉一处焦点缺陷

> 承接 round-151。前两轮把命令面板、指针入口、速查面板做完后，剩下的验证一直是
> 「静态闸门 + 单元测试」——**没有任何一条检查真的在一个浏览器里按过键**。
> 本轮把 dev server 起起来，用 Playwright 驱动真实 Chromium 把三条交互全部走一遍。
> 实测过程立刻抓到一处**只在运行时存在**的缺陷（round-151 声称已修、实则只修了一半），
> 已修并补闸门断言。
> **未 bump 版本、未 tag / Release。**

---

## 一、跑起来的前提（可复现）

| 项 | 值 |
|---|---|
| 服务 | `node node_modules/vite/bin/vite.js --port 5173 --strictPort`（桥是 Vite 插件，起 vite 即起桥） |
| 环境变量 | `CODEXUI_SANDBOX_MODE=danger-full-access`（与 `scripts/dev.cjs` 一致） |
| CODEX_HOME | **真实 `~/.codex`**（非隔离 home）—— 本轮要验的是 UI，需要真实线程列表喂进侧栏 |
| 浏览器 | `playwright` 已装（`^1.59.1`，`%LOCALAPPDATA%/ms-playwright/chromium-1234`），**有头模式**跑 |
| 无鉴权门 | localhost 直连不进登录/密码流程，壳直接渲染 |

⚠️ 记录一条与记忆不符的事实：**dev server 端口是 5173**（`vite.config.ts:121` 硬编码），
不是长期记忆里写的 4173。4173 是别的东西。已回写记忆。

---

## 二、实测结果：36/36 通过

脚本 `tmp/r152-verify-ui.cjs`（每次断言落 `{ id, pass, detail }`，截图落 `tmp/r152-shots/`）。
`INFO` 两条是**探针**不是断言，不参与退出码。

| 组 | 检查 | 结果 |
|---|---|---|
| S0 | 壳渲染（`http://localhost:5173/#/`） | PASS |
| A1 | 顶栏放大镜按钮可见，`title="Command palette · Ctrl+/"` | PASS |
| A2 | 点击打开面板；`count=13/13` 与 DOM 行数一致；焦点进输入框 | PASS |
| A2 | 顶栏（无选中线程）时线程组被裁到只剩 `thread.new`、panel 组整组消失 | PASS |
| A3 | 输入 `shortcut` ⇒ 收敛到 1 条（`Keyboard shortcuts`） | PASS |
| A3 | 输入中文 `快捷键` ⇒ 同样召回（keywords 不翻译的收益） | PASS |
| B1 | `Esc` 关闭；**焦点回到顶栏入口** | PASS |
| C1 | `Ctrl+/` 打开 | PASS |
| C2 | 打开状态再按 `Ctrl+/` ⇒ 关闭 | PASS |
| C3 | 关闭后**焦点仍回到顶栏入口** | PASS（round-152 修） |
| C4 | 面板打开时 `Ctrl+B` 让位（侧栏不收） | PASS |
| D1 | 速查面板：`15` 条与 DOM `kbd` 行数一致、3 组（GLOBAL/COMPOSER/NAVIGATION） | PASS |
| D1 | 打开速查时命令面板已卸载（互斥）、焦点在关闭按钮 | PASS |
| D1 | Windows 键位标签：`Ctrl + /`、`Ctrl + B`、`Ctrl + J`、`Esc`… 含 `Enter / Tab` 等价键 | PASS |
| D2 | `Esc` 关闭速查；**焦点回到顶栏入口** | PASS（round-152 修） |
| E0 | 侧栏真实线程行 `.thread-row[data-thread-id]` = 4 条 | PASS |
| E1 | 进入 `#/thread/<id>`；右面板入口存在（桥报 terminal available） | PASS |
| E2 | `Ctrl+J` ⇒ `.thread-terminal-panel` 出现（右侧 tab 无 `is-active`）；再按 ⇒ 收回 | PASS |
| E4 | 面板执行「重命名线程」⇒ 对话框输入框获得焦点并被全选（不是顶栏按钮） | PASS |
| E3 | `Ctrl+B` ⇒ `.desktop-sidebar` 消失；再按 ⇒ 恢复 | PASS |
| Z | 控制台零 error | PASS |

**视觉证据**：`06-ctrlj.png` 显示右侧已是**活着的终端**（`Microsoft Windows [版本 10.0.26200.9457]` + `D:\code\codex>` 提示符），
不是空壳；`08-rename-dialog.png` 显示重命名输入框内容处于全选态。

另外做了一次高清局部量测（`deviceScaleFactor=2`）：速查面板头部的计数徽标右边界 851px、
关闭按钮左边界 859px ⇒ **零重叠**。早先整图截图里看着像「15 被 × 压住」，
是缩放伪影——**量出来，没推出来**。

---

## 三、缺陷与修复：round-151 只修了一半的焦点归还

round-151 的文档写「关闭模态后把焦点还给触发控件，与 `AppDialog` 一致」。
实测证明这句话**只对命令面板的一条路径成立**：

| 路径 | round-151 状态 | 实测 |
|---|---|---|
| 命令面板 · `Esc`（焦点在输入框）→ 面板自己 `emit('close')` | 会归还（但**硬编码**到顶栏按钮） | PASS |
| **速查面板 · 任意关闭方式** | `onCloseShortcutHelp` 只置 `false`，**从不归还** | **FAIL：焦点落到 `<body>`** |
| **命令面板 · `Ctrl/Cmd+/` 关闭分支** | 键位分支**直接取反 ref**，绕过关函数 | 焦点丢给 `<body>` |
| **命令面板 · `Esc` 兜底分支**（焦点已离开输入框） | 直接置 `false`，绕过关函数 | 焦点丢给 `<body>` |
| **命令面板 · 执行命令后** | `onCommandPaletteRun` 直接置 `false` | 焦点丢给 `<body>` |

### 修法

1. 新增一对助手：`rememberOverlayFocus()`（打开时记下 `document.activeElement`）与
   `restoreOverlayFocus()`（关闭时 `nextTick` 归还；来源已卸载则兜底到命令面板顶栏入口）。
   —— 从「硬编码顶栏按钮」改成「记来源」的收益：用 `Ctrl+/` 从输入框打开面板时，
   关闭后焦点回到**输入框**，而不是被拽到顶栏。
2. `onOpenShortcutHelp` **刻意不重新记忆**：它唯一的打开路径是命令面板的
   `view.shortcuts`，此刻焦点还在面板输入框上（即将卸载）。沿用命令面板记下的来源，
   才能把焦点还原到「最初打开命令面板的地方」。
3. 键位分支收拢成 `onToggleCommandPalette()`，window 的两个 `Esc` 兜底分支改走
   `onCloseShortcutHelp()` / `onCloseCommandPalette()`，`onCommandPaletteRun` 也改走关闭函数。

### 修 (3) 引入的顺序风险，以及为什么它不成立

`onCommandPaletteRun` 改成走关闭函数后，归还焦点的 `nextTick` **先于**命令自身注册。
若某个命令要打开对话框（如重命名），对话框的聚焦会不会被抢走？不会——
`nextTick` 回调**按注册顺序执行**，我们的先跑、对话框的后跑，后者胜出。
这条不靠推理，**用 E4 在浏览器里钉住**：执行重命名后面板失焦，`rename-thread-input` 全选。

---

## 四、CDP 正对照：为什么 `Ctrl+J` 仍然无法自动判定

上一轮留的「真机按一次键」的待办，本轮**依然没有闭环**，现在有硬证据说明为什么：

> 正对照 F1：用同一套 CDP 注入按 `Ctrl+T`（浏览器保留加速键 = 新标签页）。
> 结果**页面数 1 → 1、URL 未跳转** ⇒ **CDP 注入的事件不经浏览器加速键前置处理**。

因此 E2 的 PASS 只能证明「**页面里的处理器会对 `Ctrl+J` 做出正确反应**」，
**不能**证明「真实浏览器不会先把它当下载页抢走」。这类键位只能靠人手在真实浏览器里按一次
（或按 round-149 的排除法结论：`Ctrl+J` 不在保留加速键表内、且终端面板本就有可见 tab 兜底）。

**但本轮的实测把这条风险的实际影响面缩小了**：即使 `Ctrl+J` 在某些浏览器被吃掉，
「终端面板」仍有一条完全等价的键盘路径 —— 命令面板 → `Toggle the terminal panel`
（`panel.terminal`，注册表里带 `Ctrl+J` 提示）。

---

## 五、验证

| 项 | 结果 |
|---|---|
| 浏览器实测 | **36/36**（含 2 条 INFO 探针，不参与退出码） |
| 契约闸门 | **57/57**（round-150 键位断言改写 + 新增 round-152 断言，56 → 57） |
| 单测 | **929 例 / 85 文件全绿**（零退化，未新增用例文件） |
| 类型 | `vue-tsc --noEmit` **EXIT=0** |
| 构建 | `vite build` **EXIT=0** |
| 控制台 | 零 error |

**反跑**：把 `onCloseShortcutHelp` 的 `restoreOverlayFocus()` 删掉 ⇒ 闸门精确报
`两关闭方向=NO`（56/57）；还原 ⇒ 57/57。证明新断言非空。

**闸门同步**：round-150 那条键位断言原先要求「`preventDefault()` 后内联取反
`isCommandPaletteOpen.value`」。分支收拢后改为断言
「分支调用收拢函数 ∧ 收拢函数两个方向都在 ∧ 关闭方向归还焦点」——**比原来更强**，
不是放宽。

---

## 六、诚实边界

1. **本轮唯一新增的自动化资产是 `tmp/r152-verify-ui.cjs`，它在 `tmp/` 下（被 `.gitignore` 排除）**，
   不进 CI、不进 `pnpm test`。它需要**同时**满足「dev server 起着 + 真实 CODEX_HOME 有线程」，
   因此**不适合**当闸门。要变成常驻资产需要先决定「给哪条路径配可复现的夹具」，本轮没做。
2. **闸门覆盖结构，浏览器覆盖行为，两者不重叠**。round-152 断言只保证「四条路径都走关闭函数」，
   不保证「焦点真的落在正确控件上」——后者只有 E2/E4/D2 在真实浏览器里跑过。
3. **`Ctrl+J` 的真实命运仍未闭环**（见 §四）。这是本仓库唯一一条已知「自动化测不了」的交互。
4. **键盘布局**：`Ctrl+/` 判定走 `event.key`，非美式布局可能拿不到 `'/'`。round-151 加的顶栏指针入口
   已经把这条风险从「面板不可达」降级为「快捷键不生效」，本轮实测的是 `en-US` 布局，
   **没有**覆盖其他布局。
5. **未覆盖的交互**：面板里 24 条命令只抽查了 `view.shortcuts` 与 `thread.rename` 两条端到端；
   其余靠「全部转发到既有处理函数」这一结构断言（round-150）兜底，没有逐条点过。
6. 速查面板的目录仍是**转写**（`utils/keyboardShortcuts.ts` 手写 15 条），
   断言只保证「目录与 zhCN 表一致」，**不保证「目录与运行时绑定一致」**。本轮实测
   `Ctrl+/`、`Ctrl+B`、`Ctrl+J`、`Esc` 四条全局键位**行为与目录相符**，其余 11 条（输入框/浮层类）未逐条验。

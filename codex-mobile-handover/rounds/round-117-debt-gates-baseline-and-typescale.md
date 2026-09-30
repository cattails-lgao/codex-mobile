# 第一百一十七轮：代码层小债清理 + 6 个 UI 闸门首次建立基线 + 7 级排版阶梯归档

> 用户口径：先问「还有哪些没有解决的」→ 我核对出五类遗留 → 用户点选三项「处理代码层小债、4 个 UI 契约脚本 + 2 个专项闸门、7 级排版阶梯」。
>
> 三项的共同点是**都属于「写了但没验过」的欠账**：`scripts/` 里的 6 个闸门从未跑过、排版阶梯从未落地、死配置从未清理。

---

## 一、代码层小债

### 1.1 `package.json` 的 pnpm 死配置（已删）

pnpm 11 起，`package.json` 的 `pnpm` 字段**整体不再被读取**，构建白名单只认 `pnpm-workspace.yaml` 的 `allowBuilds`。round-116 删 `node-pty` 时已能看到这条警告，但只删了那一个条目，字段本身留着。

删前核实等价性：`pnpm.onlyBuiltDependencies` 的三项 `@firebase/util` / `esbuild` / `protobufjs` 与 `pnpm-workspace.yaml` 的 `allowBuilds` **完全一致** → 删字段是零功能影响。

删后验证：`require('./package.json')` 合法、`p.pnpm === undefined`、`optionalDependencies` 确认为空。

### 1.2 桥内裸全量读复核（结论：有意保留，**不需要改**）

遗留清单里的「`codexAppServerBridge.ts:637` 裸 `thread/read{includeTurns:true}`」经复核＝`AppServerProcess.readThreadForTurnPage`（定义在 `codexAppServerBridge.ts:628`，带 TTL 缓存与 in-flight 合并）。

**它是有意保留的兜底路径**，且**已有单测锁死这个语义**：`threadRoutes.turnPage.test.ts:79` 断言主路径下调用次数为 **0**、`:94` 断言降到全量路径时为 **1**。即「上翻主路径走有界读，只在有界读不可用时才落回它」。

→ 该项从「待办」改为「已复核、口径正确」，无需改码。

---

## 二、6 个 UI 闸门首次跑通并建立基线

### 2.1 跑法（这一节是本次最实用的产出）

| 闸门 | 是否需要服务 | 端口 | 备注 |
|---|---|---|---|
| `check-ui-contract.cjs` | **否**（纯静态扫 src） | — | 37 项 → 本轮 **38 项** |
| `check-fonts.cjs` | **是** | `PROFILE_BASE_URL`（默认 4190） | 需要**带 `/codex-api` 桥**的服务 |
| `check-theme.cjs` | **是** | 同上 | |
| `check-token-equivalence.cjs` | 否（比对磁盘快照） | — | 需先由 `ui-audit-shots.cjs` 采集 |
| `check-thread-switch-feedback.cjs` | **是** | `PROFILE_BASE_URL`（默认 4173） | 性能类，**必须跑生产构建** |
| `verify-mobile-375.cjs` | **是** | 原先硬编码 4173，本轮加 `PROFILE_BASE_URL` 支持 | |

**关键坑（本轮踩到）**：4190 若用 `vite preview` 起，它只是静态文件服务器、**没有 `/codex-api` 桥**，前端调后端必然 404 → `check-fonts` 的「无失败请求」断言会 FAIL，**且失败信息里是 `/codex-api/rpc` 404 而不是字体问题**，极易误判成字体缺陷。

正确起法：

```bash
CODEX_HOME=<项目>/.codex node dist-cli/index.js \
  --no-tunnel --no-open --no-login --no-password -p 4190
```

**另一个坑**：`dist-cli/` 是**独立于 `dist/` 的产物**。本轮它就停在 09-28（round-116 之前），里面还是找 `node-pty` 的旧代码 → `/codex-api/thread-terminal/status` 返回 `{"available":false,"reason":"…Native PTY support is not installed."}` → **`canShowRightPanel` 为 false → 移动端闸门找不到面板按钮**。重建（`tsup`）后立刻变 `{"available":true}`。

→ 教训：**闸门只有跑在当前源码构建上才有意义**；`dist/` 与 `dist-cli/` 都要重建。

### 2.2 结果

| 闸门 | 结果 |
|---|---|
| `check-ui-contract` | **38/38** ✅（新增 1 项，见 §四） |
| `check-fonts` | **13/13** ✅ |
| `check-theme` | **15/15** ✅ |
| `check-token-equivalence` | ✅（重置基线后 792/792 逐字相同） |
| `check-thread-switch-feedback` | **11/11** ✅（首开冻结 17–23ms、切换 19–45ms，预算 60ms） |
| `verify-mobile-375` | **6/6** ✅ |

### 2.3 修掉的三处闸门自身缺陷

**（1）`check-token-equivalence` 拿 P0 基线比 P1 之后的界面 —— 必然永远失败**

它比的是 `docs/ui-audit/current-computed-styles.json`（**09-24**，P0 阶段快照）与当前采集。P1 主界面重做后，这个「外观不得变化」的不变量**在语义上已经过期**。

首跑报出：9 项超容差 + 24 项「元素缺失」。逐条归因后确认**全部是有意的 UI 演进，不是回归**：

- 9 项超容差全是 `.thread-row` / `.thread-row-title`：背景 `rgb(255,255,255)`/`rgb(39,39,42)` → `rgba(0,0,0,0)`（透明，靠 hover/选中抬 `bg-s2`）、标题色改用 `ink-2` —— 正是 **round-99「行列表」改造**，方案 L172 有记录。
- 24 项「元素缺失」（`.work-block*` / `.tool-call-*` / `.message-code-*` / `.message-heading`）是 **09-24 基线里有、今天结构已不同**。

**且采样是稳定的**：拿今天（16:30）与今天（16:45）两次采集对比，**「仅 before」「仅 after」均为 0**。所以问题只在基线过期，不在采样漂移。

修复：把当前快照重置为新基线（旧基线备份到 `tmp/r117-baseline-old.json`），并在文档里留下这次重置的理由。

**（2）`verify-mobile-375.cjs` 用 i18n 文本定位按钮**

它用 `page.getByLabel('Open side panel')` 找面板开关，而 `App.vue:177` 的 `aria-label` 是 `t('Open side panel')`，中文界面下渲染为 **「打开侧边面板」**（`useUiLanguage.ts:541`）→ **中文环境永远匹配不到**。

改为语言无关的 class 定位：`.content-header-right-panel-toggle`（开）、`.content-right-panel-close`（关）、`.content-right-panel.is-mobile-open`（开合状态）。同时给它补上 `PROFILE_BASE_URL` 覆盖（原先硬编码 4173，与其余四个脚本不一致）。

**（3）`verify-mobile-375.cjs` 的导航前置假设已随 UI 改版失效**

改完定位后仍 FAIL。截图揭示根因：**375px 下首页是「Let's build」空态**（无侧栏、无 content header），而脚本还在走「点第一个项目 → 点第一个会话项」的旧路径 —— 它点到的是空态里的「Select folder」那类按钮。

改为**直接向桥要一个真实线程 id 再进对应路由**：

```js
const threadId = await page.evaluate(async () => {
  const res = await fetch('/codex-api/rpc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ method: 'thread/list', params: {} }),
  })
  const r = (await res.json()).result
  return (r.data || r.threads)[0]?.id ?? null
})
```

**注意**：这一条修好后仍 FAIL 过一次，原因是 §2.1 讲的**旧 `dist-cli`**（终端 unavailable）—— 两个缺陷叠在一起，先修哪个都看不出全貌。

---

## 三、7 级排版阶梯归档

### 3.1 范围核实：实际只剩 `text-sm`，比任务描述的 377 处小得多

任务原本写「`text-xs` 215 + `text-sm` 162 + `text-[Npx]` 147」。逐项核实后：

- **`text-[Npx]` 147 处**：round-96 已清零。现存仅 2 处 `text-[1em]`，是**相对单位**、合同保留（契约断言的「清零」口径本就排除它）。
- **`text-xs` 215 处**：**合法档位**。`style.css:94-102` 的 `@theme` 注释明确「12px 复用 `text-xs`、18/24px 复用 `text-lg`/`text-2xl`，**不再造别名**」。阶梯实际是 nano 10 / micro 11 / **meta 12（=text-xs）** / ui 13 / body 15 / h3 18 / h2 24 / display 40。
- **`text-sm` 162 处**：**唯一越界档位**（14px 在阶梯里没有位置），且 162 处**全是无衬线**（0 处 `font-mono`、0 处 `tabular-nums`）。

### 3.2 分类规则（用户拍板「按语义分档」）

| 语义 | 归档 | 判据 |
|---|---|---|
| 会话正文（Markdown 渲染出的内容） | `text-body` **15px** | 选择器属 `.message-*`（排除 heading）/`.work-summary-text` |
| 控件 / 列表行 / 面板正文 / 状态提示 | `text-ui` **13px** | 其余全部 |
| **不动** | `text-sm` 14px 保留 | `.message-heading-h4/h5/h6` —— 它走 **Tailwind 默认档体系**（h1–h4 = xl/lg/base/sm），由 `check-ui-contract.cjs:333/339` 的「Markdown 标题分级」断言**单独管辖**，与 UI 阶梯是两套 |

**边界复核**：曾担心 `.live-overlay-*`（实时覆盖层）是「消息正文的替身」，若归 13px 会在内容落定后与 `.message-text` 的 15px 产生跳变。逐处查看后确认它是**过程态**（工具/思考文字，round-23 注释写明），与最终会话正文不同层 → 归 13px 正确。

### 3.3 执行

按 (文件) 粒度单次读写、按 (选择器) 判定归属，脚本先**试算**再 `--apply`：

```
试算：body=8  ui=151  skip(未动)=3  涉及 31 个文件
写入：body=8  ui=151  skip(未动)=3  涉及 31 个文件
复算：text-sm 残留 3 处（全在 ThreadConversation.vue 的 heading 链）✅
```

### 3.4 契约加固（37 → 38 项）

新增断言：**「UI 字号不落在阶梯外：`text-sm`(14px) 只余 Markdown 标题链 3 处」** —— 防止后续再往 UI 层写 14px。

---

## 四、验证

- **类型**：`vue-tsc --noEmit` **EXIT=0**
- **单测**：`vitest.mjs run` → **714 passed (714) / 74 files**，零失败
- **构建**：`vite build` EXIT=0（30.63s）；`tsup` 重建 `dist-cli` EXIT=0
- **6 个闸门**：38/38、13/13、15/15、792/792、11/11、6/6 全绿（见 §2.2）
- **等值前后对比**（本次改动的**硬证据**）：132 个可比样本 → **118 未变、14 变化**，且**变化只有一个方向 `14px → 13px`**；**元素增删为 0**；**字体族/背景/文字色/圆角/边框差异为 0**
- **实测 computed 字号**（生产构建 + 真实浏览器）：
  - `.message-text` / `.message-list` = **15px** ✅
  - `.thread-row-title` / `.thread-composer textarea` = **13px** ✅
- **真机截图**：`output/playwright/r117-typescale-after.png`（界面完好）

---

## 五、诚实边界与遗留

1. **`check-thread-switch-feedback` 有一次偶发失败**：「快速 A→B→C→A 连点」场景的最终态 hash 与期望不一致。**复跑 2/2 通过**。可归因线索：当时线程列表里**存在两个同名线程**（「任务：实现一个 Markdown 图片本」），而脚本按**标题**定位，存在歧义；本轮只改了 CSS 字号类、零 JS 逻辑改动。**未深挖，记为脚本脆弱性。**
2. **`check-token-equivalence` 的语义已被重置**：它现在守的是「本轮之后的外观不再变」，不再是「P0 token 化零变化」。后续每次有意改外观都要重置基线并留下理由。
3. **Android / Linux / macOS 仍未实测**（与 round-115/116 相同，WSL 被本机安全策略硬拦）。
4. **`dist-cli` 与 `dist/` 必须一起重建**这条纪律已写进文档，但没有自动化（没有 postinstall 或 CI 强制）。

---

## 六、涉及文件

**改（源码）**
- `src/**/*.vue` × 31：`text-sm` → `text-ui`(151) / `text-body`(8)
- `package.json`：删 `pnpm` 字段
- `scripts/check-ui-contract.cjs`：新增「UI 字号不落在阶梯外」断言（37 → 38）
- `scripts/verify-mobile-375.cjs`：i18n 定位 → class 定位；导航改走真实线程路由；补 `PROFILE_BASE_URL` 覆盖

**改（文档 / 基线）**
- `codex-mobile-handover/rounds/round-117-*.md`（本文）
- `codex-mobile-handover/codex-mobile-handover.md`（4 处登记）
- `codex-mobile-handover/sections/ui-redesign-plan.md`（排版阶梯 ⏸ → ✅）
- `codex-mobile-handover/sections/environment.md`（4190 带桥服务 + 双产物重建纪律）
- `docs/ui-audit/current-computed-styles.json`（等值基线重置）

**探针 / 脚本（未入库）**
- `tmp/r117-typescale-analyze.cjs`（分类分析，只读）
- `tmp/r117-typescale-apply.cjs`（试算 + `--apply`）
- `tmp/r117-typescale-probe.cjs`（实测 computed 字号）
- `tmp/r117-fix-mobile-check.cjs` / `tmp/r117-fix-mobile-nav.cjs`（锚点修复脚本）
- `tmp/r117-facts-before-typescale.json`（排版前快照，对比用）
- `tmp/r117-baseline-old.json`（被替换掉的旧等值基线）

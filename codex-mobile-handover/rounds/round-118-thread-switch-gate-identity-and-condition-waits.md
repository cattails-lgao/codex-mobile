# 第一百一十八轮：`check-thread-switch-feedback` 遗留处置——按线程 id 定位 + 条件等待

> 用户口径：「处理 check-thread-switch-feedback」——即 round-117 §五 遗留 1：该闸门有一次偶发失败（「快速 A→B→C→A 连点」的最终态 hash 与期望不一致，复跑 2/2 通过），当时记为「脚本脆弱性、未深挖」。

---

## 一、先测后改：闸门为什么偶发

### 1.1 失败的断言长什么样

闸门最后两项断言用**启动时抓的索引**当期望：

```js
const titles = await page.evaluate(/* 启动后抓一次 */)   // t0，约第 3 秒
...
const tour = [0, 1, 2, 3, 0].filter((i) => i < rows)
await page.evaluate((indices) => { const all = document.querySelectorAll('.thread-row'); for (const i of indices) all[i].click() }, tour)
check(afterTour.activeTitles[0] === titles[tour[tour.length - 1]], ...)   // 期望 = t0 的 titles[0]
check(afterTour.hash === settled.hash, ...)                               // 期望 = t0 点 .first() 时的 hash
```

`tour` 末次点击落在**运行时刻**的 index 0；而期望来自**约 9 秒前**的 index 0。两者是同一线程，当且仅当这段时间里行序没变。

### 1.2 四个探针（均在真实生产构建 + 真实线程上跑，脚本留在 `tmp/`，未入库）

| 探针 | 问题 | 结果 |
|---|---|---|
| `tmp/r118-order-probe.cjs` | 连续点 6 行，行序会变吗？ | **冷启动两次各得 5 种顺序**（6 次采样）；另一份 `t0` 顺序与热态完全不同 |
| `tmp/r118-settle-probe.cjs` | **不点任何东西**，行序会自己变吗？ | **20 秒 40 次采样，0 次变化、0/10 索引漂移** → 重排是点击诱发的，不是列表自己在刷新 |
| `tmp/r118-click-effect.cjs` | 只点一行（每次重载，互相独立），它会移位吗？ | **4 例中 2 例移位**：index 1 → 0（drift 2/10）、index 2 → 0（drift 3/10）；index 0（已在顶部）与 index 5（最旧、本就在真实位次）不动 |
| `thread/list` × 8 次直连 | 服务端返回顺序稳定吗？ | **1 种顺序 / 8 次调用** → 重排发生在客户端（打开线程刷新该线程元数据后按 `updatedAtIso` 重排），不是服务端抖动 |

于是根因是第一类「假设世界没变」：**打开一条线程会把它提升到顶部**（`SidebarThreadTree.vue:1076-1080` 按 `updatedAtIso` 降序），行序随之重排；闸门把 9 秒前抓的索引当期望，任何一次重排都会让期望指向另一条线程。这也解释了为什么它是偶发而非必现——重排是否发生取决于被点的行当前位次（`2/4`）。

### 1.3 顺带被证伪的候选与一个真实的次要缺陷

- **路由 hash 落后**（「3 秒还没落地」）——**证伪**：点击到 hash 变化实测 **1/5/5/4/5/3 ms**。
- **固定 sleep 太短**——**成立**：在内容尚未加载的环境里，老闸门 `conversationChars > 0` 稳定失败 **0/8**；改成条件等待后同一环境通过。
- **标题不是主键**——成立：本机侧栏存在**两条同名线程**（「需求：开发一个本地文件夹图片批量重命名工」），按标题比较可能在断言错误线程时「通过」。

### 1.4 与 round-117 记录一致

round-117 记的「当时列表里有两个同名线程、脚本按标题定位存在歧义」是同一现象的另一个切面：重排让 index 0 变成另一条线程，**而那条线程恰好同名**，于是标题断言可能仍然通过、只有 hash 断言露馅——正是当时看到的「最终态 hash 与期望不一致」。

---

## 二、改动

### 2.1 产品侧：给两个表面加稳定标识（各 1 行、纯附加）

| 文件 | 改动 |
|---|---|
| `src/components/sidebar/SidebarThreadRow.vue` | `<SidebarMenuRow class="thread-row" :data-thread-id="props.thread.id">` |
| `src/components/content/ThreadConversation.vue` | `<section class="conversation-root" :data-thread-id="props.activeThreadId">` |

`SidebarMenuRow` 是 `inheritAttrs: false` + `v-bind="$attrs"`，属性如实落到 `.thread-row` 上；`conversation-root` 的 id 让「切过去之后内容真的是那条线程的」可以**断言**而不是只能比字符数。两处都不改行为、不加样式。

### 2.2 闸门：定位改按 id、等待改按条件

`scripts/check-thread-switch-feedback.cjs` 重写定位与断言（检查项从 11 → **12**，新增一条构建防呆）：

1. **目标全部按线程 id 解析**——`readRows()` 从 `[data-thread-id]` 读，点击用 `.thread-row[data-thread-id="…"]`，连点 tour 在页内**逐个 id 重新查询**（重排也点不歪）；断言只比 id 与 `location.hash` 的 id，不再用索引或标题。
2. **等待改成条件轮询**（`waitForState` + `SETTLE_TIMEOUT_MS`，默认 15 s）替代写死的 3 s / 2.5 s。结算条件 = **单一行选中 + 选中行 id 命中 + 路由 id 命中 + 会话 id 命中 + 消息已渲染**。
   - 其中「内容」必须进条件：**高亮先画、内容后到是 round-89 的设计**，在路由落地那一瞬断言内容是在测「过渡」而不是测「结果」——第一版重写就因此 **1/5 失败**，把这层加进条件后消失。
3. **目标线程按「有消息」挑选**（`CONTENT_IDS`，页内问 `thread/turns/list {itemsView:'notLoaded'}`，取前 4 条）。原脚本默认「侧栏前两行就有内容」，而线程列表按最近使用排序，**新线程恰好会挤在顶部而它们大多是空的** → 环境一变就整体误报。挑不到 2 条就**明确报环境不满足**并退出，不再以 `chars=0` 的形式伪装成产品缺陷。
4. **构建防呆**：任一行缺 `data-thread-id` 直接判失败退出（否则失效的构建会让后面每条断言退化成「比较空字符串」）。
5. **诊断行**：打印本次运行中「索引→线程」的变化数与同名标题，把这条曾经无形的危害变成可见读数。
6. `conversationChars` 量的是 `.conversation-list`（真正的消息列表），**不是** `.conversation-root`——后者恒含「Loading messages...」占位文本，用它计数会让「内容已加载」在尚未加载时也成立（第一版重写即踩此坑，属**假通过**，已修正）。

---

## 三、验证

| 项 | 结果 |
|---|---|
| `vue-tsc --noEmit` | **EXIT=0** |
| `vite build` | EXIT=0（15.52s）；产物 `index-*.js` / `ThreadConversation-*.js` 均含 `data-thread-id` |
| 全量 Vitest | **714 passed (714) / 74 files**，零失败（与 round-117 基线逐字相同） |
| 闸门（本机沙箱） | **12/12 全绿**；本次运行诊断行报 **6/13 索引发生漂移** —— 危害实际发生了，而闸门因为不依赖顺序照样通过 |
| 闸门墙钟耗时 | 老脚本 ~25 s → 新脚本 **~16 s**（条件等待替代固定 sleep 的副产物） |

### 3.1 受控注入 A/B（本轮最硬的证据）

重排自然发生但只有 `2/4` 概率，故把「打开一条中段行」这一自然操作**注入**成固定步骤，让两个版本看到完全相同的扰动：

| 变体（`tmp/` 下，未入库） | 结果 |
|---|---|
| `r118-old-gate-rerank.cjs`（注入重排） | **0/6 通过**：`FAIL highlight, route and content agree after the rapid tour`，单跑时打印 `hash=#/thread/01a039b2… expected=#/thread/019fc7ef…` —— **round-117 记录的原症状逐字复现** |
| `r118-new-gate-rerank.cjs`（同一注入） | **6/6 通过** |

无注入时两者都过（`old 6/6`、`new 6/6`）——这正好说明老脚本的缺陷是**条件触发**的，与 round-117「偶发、复跑即过」的记录一致。

---

## 四、诚实边界与遗留

1. **未在无注入的自然流程里复现出老闸门的失败**（`old 6/6`）。上面的 A/B 是**注入版**：注入的操作（打开中段行）是实测会自然发生的行为，但自然发生率不足以在 6 次运行内稳定复现。结论按「构造上不成立 + 注入下必现」表述，不宣称自然必现。
2. **本机沙箱 `.codex` 原本只有 1 条有消息的线程**（`thread/list` 共 10 条），闸门根本无法运行。已把真实 home 里 **4 个最小 rollout 的副本**（22/37/50/52 KB，`tmp/r118-seed-sandbox.cjs` 可重跑，原文件未动）放进 `.codex/sessions/`，使沙箱有 13 条线程 / 5 条有轮次。**这是测试数据，`.codex/` 已被 gitignore；如需还原，删掉这 4 个文件即可。**
3. **一条 `chars=0` 的环境性失败被消除**，但同一现象也提醒：`thread/turns/list` 对少数**旧形状 rollout 可能报 0 轮次**（实测拷贝进来的 `01a06803` / `01a06806` 各 50/52 KB 却报 0），故「按内容挑选」是**保守**的——它可能跳过个别其实能渲染的旧线程；闸门只需要 2 条，够用。
4. **`check-token-equivalence` 未跑**：本轮两处改动是纯附加属性、无样式与字体变化，未重置等值基线（round-117 刚重置过）。
5. 其余 5 个 UI 闸门未回归（改动不触及字体/主题/移动端布局）；Android / Linux / macOS 仍未实测（WSL 被本机安全策略硬拦）。

---

## 五、涉及文件

**改（源码）**
- `src/components/sidebar/SidebarThreadRow.vue`：`+ data-thread-id`
- `src/components/content/ThreadConversation.vue`：`+ data-thread-id`
- `scripts/check-thread-switch-feedback.cjs`：按 id 定位 + 条件等待 + 按内容挑选目标 + 构建防呆 + 诊断行（11 → 12 项）

**改（文档）**
- `codex-mobile-handover/rounds/round-118-*.md`（本文）
- `codex-mobile-handover/codex-mobile-handover.md`（快照 / 未完成事项 / 轮次索引 / 页脚）
- `tests.md`、`tests/thread-loading-state/index.md`、`tests/thread-loading-state/thread-switch-feedback-gate-identity-and-waits.md`

> `sections/commit-history.md` **未动**：该节只按**发版**记（现有最后一节是 v0.1.126 / round-87~100），round-101 起的各轮同样不在其中，提交记录统一在下次发版时落。

**探针 / 脚本（未入库）**
- `tmp/r118-order-probe.cjs`：冷 / 热行序稳定性
- `tmp/r118-settle-probe.cjs`：无点击对照
- `tmp/r118-click-effect.cjs`：单次点击是否移位
- `tmp/r118-index-drift.cjs`：索引漂移量化
- `tmp/r118-seed-sandbox.cjs`：把真实 rollout 副本补进沙箱（dry-run 优先）
- `tmp/r118-ab-runner.cjs`（+ `r118-ab-summary.json`）：A/B 运行器
- `tmp/r118-old-gate.cjs` / `r118-old-gate-rerank.cjs` / `r118-new-gate-rerank.cjs`：注入版对照
- `tmp/r118-content-probe.cjs`、`tmp/r118-procs.txt`、`tmp/r118-port-probe.txt`、`tmp/r118-vitest.log`

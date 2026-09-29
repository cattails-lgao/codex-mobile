# round-106 — CLI 0.159.0 升级：三探针全绿 + items/list 协议事实

日期：2026-09-30。用户指令「升级」。目标：把本机 Codex CLI 0.158.0 → 0.159.0（npm stable），复跑协议探针确认兼容性，并对 0.159.0 新能力（`thread/items/list` 锚点分页、`instant_interrupt`）出可复跑探针。**运行时行为零改动**——本轮是升级验证轮，产品代码无一行变更。

## 一、CLI 升级（pnpm 全局）与环境插曲

- `pnpm install @openai/codex@0.159.0 -g` 最终成功（用户修复 node 运行时环境后）。升级期间本机 pnpm 全局安装稳定复现 `[ENOENT] .../global/v11/<hash>/node_modules/@openai/codex/package.json`（7 次，含 add/install 两种语法、带/不带版本、换 npmmirror 镜像后下载成功仍失败）——根因是 **fnm 管理的 node 运行时损坏**，用户卸载重载 node 版本后 pnpm 恢复正常。中途用 npm 全局装的重复份已卸载（`npm rm -g @openai/codex`），保持 pnpm 单一来源。
- **教训**：pnpm 全局安装群体性 ENOENT 且错误指向 pnpm 内部 `readInstalledPackages` 时，先怀疑 node 运行时本身（`node --version` 正常不代表一切正常），不要在包管理器语法/镜像/清理状态上绕圈。
- **探针的 writer lock 插曲**：并行对同一线程跑两个探针互抢 `CODEX_HOME/thread-writer-locks/` 的 per-thread writer lock（`thread/resume` 报 `-32603: failed to open thread writer lock`，且 dev 服务器的 app-server 子进程也会持有）——探针必须**串行**跑；`taskkill` 持锁进程后 lock 文件残留无碍（OS 锁随进程释放）。
- codex bin 路径照例以第 4 参显式传入（pnpm store 哈希随版本变：本轮 `61b6c9e1…`，store links 布局 `store/v11/links/@openai/codex/0.159.0/<hash>/node_modules/@openai/codex/bin/codex.js`）。

## 二、探针复跑：0.159.0 协议事实（大线程 01a0cdce…，124MB/173 轮）

三个探针**全绿**，round-84/86 两条有界路径在 0.159.0 上行为不变：

- `probe-turn-page.cjs` **5/5 fact PASS**：`turns/list` 游标页与全量水合 slice 深度相同、链覆盖恰好一次、`turnsBackwardsCursor` 仍重发自身页、turn id 作 cursor 仍被拒。全量水合 **6.0–6.2s / 26.16MB**（与 0.158.0 的 8.0s 同量级），有界路径 123–135ms / 2.52MB。
- `probe-resume-turn-page.cjs` **7/7 assumption PASS**：有界 resume 页 == 全量 slice(-10) 反转（逐项 deep-equal）、chained notLoaded 计数 173 精确无重复、`threadTurnStartIndex` 推导 163 == legacy trim。
- **探针适配（可复现性修复，非行为变更）**：两个旧探针的「`turns/list {limit:10000}` 单发拿全 / 单发无 nextCursor」断言是 round-104 实测页上限 100 之前的旧口径——本轮把断言改为**续链收集**（与桥的 `readThreadTurnIds`/`readThreadTurnCount` 的 nextCursor 链同构），并修掉小页循环 8 页上限（173 轮需 35 页）。桥代码零改动：两条 bounded 路径本就有 50 页续链循环，100/页钳制天然兼容。

### 0.159.0 新协议事实（新探针 `scripts/probe-items-page.cjs`）

- **`thread/items/list` 已实现且好用**：`{threadId}` 默认页 25 条，响应 `{data, nextCursor, backwardsCursor}`，data 每条 `{turnId, item:{type,id,clientId,content,…}, startedAtMs,…}`。大线程续链收集 **5000+ items（200 页探针安全帽截断）零重复**。对 codexapp 的意义：round-86 只能按轮取整页 items，items 级分页给「只取某窗口 items」留了更细的刀——**暂不接入**，等出现真实需求（如超大单轮的懒加载）再评估。
- **resume 的 result 新增 `itemsBackwardsCursor`**（与 `turnsBackwardsCursor` 并列）：items 级反向游标，同轮探针确认存在。
- **`turn/interrupt` 现要求 `turnId`**：`{threadId}` 单参被拒 `Invalid request: missing field turnId`；`{threadId, turnId}` schema 有效（idle turn 报状态错误 `no active turn to interrupt`——预期）。**codexapp 已兼容**：`gateway/threads.ts` 的 `interruptThreadTurn` 一直传 `{threadId, turnId}` 且有 `turn/interrupt requires turnId` 守卫，零改动。
- **`features.instant_interrupt=true`**：spawn 接受（resume 正常），「中断即时生效」的延迟收益需要 live model turn，留手测（本轮只固化「flag 可开」这一事实）。

## 三、验证

- 三个探针全 PASS（命令：`node scripts/probe-*.cjs <threadId> "$CODEX_HOME" <codex.js 路径>`，串行）。
- 全量 Vitest **668/670**（2 失败为既有 Windows archive 平台差异，与 round-105 基线逐字同构）——升级零回归。
- 产品代码、`src/server/**` 零改动；仅探针脚本变更（两旧探针断言适配 + 新探针）。
- dev 服务器注意：若 4173 在跑，其 app-server 子进程仍是升级前 spawn 的旧版本，改用 0.159.0 必须冷启动 dev（round-104 运维教训）。

## 四、遗留

- `instant_interrupt` 的实际中断延迟收益：需 live turn 手测（steer 探针同款流程可复用）。
- `thread/items/list` 接入评估：暂无消费场景，探针固化协议形状备用。
- `TURN_ID_PAGE_LIMIT=10_000` 的误导命名（round-104 已记）仍未清理。

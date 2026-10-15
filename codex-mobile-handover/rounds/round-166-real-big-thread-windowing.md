# round-166 · 真实大线程上机实测：批 3b+3c 组合表现与分割栏常量修正

日期：2026-10-15。承接 round-163 §六 / round-165 的共同边界「**真实 173 轮大线程未实测（样本是合成 60/30 轮）**」与 round-163 §六②「模型切换分割栏 44px 未实测」。用户口径「处理真实大线程」。**零前端结构改动**；产品侧仅一处常量修正（`MODEL_SWITCH_DIVIDER_HEIGHT_PX` 44 → 30）。

## 一、数据困境与真实数据形态方案

当年（round-104）从线上导出的 124MB / 173 轮 rollout（`01a0cdce…`）**已不在本机任何 home**（`~/.codex/sessions/2026/09/23` 已不存在、`<隔离 home>` 只有 4 条空 rollout、归档目录无匹配）。「原始 173 轮」这条数据源不可复活 ⇒ 改用**真实数据形态**方案：

1. **真实 home 起桥**（`CODEX_HOME=<真实 home> node dist-cli/index.js … -p 4190`，round-76 起常态化做法，只读不写）；
2. `thread/read {includeTurns:true}` 取回真实重型线程 `01a0465a…`（31MB + 3MB 两段 rollout，round-76 的最重线程）的**最新 10 轮 / 554 个真实 items**（220 reasoning / 215 commandExecution / 63 agentMessage / 31 fileChange / 3 contextCompaction / 1 mcpToolCall，2.6s / 2MB——payload 瘦身后）；
3. 探针把这 10 轮**按原序复制 17 周期 = 170 轮**：item id 重映射保证唯一、时间戳按周期 +86400s 展开成 17 个「日」组（时间分隔栏密度随之真实化：~3 条/周期）。**工具卡密度、reasoning 链、命令输出体积全部来自真实数据**；只有轮数是复制的。

诚实边界：这是「真实数据形态 × 复制轮数」，**不是**原生 173 轮；但 round-163 登记的担心点（warm 区构成的真实工具卡/分割栏密度）正是它针对性覆盖的。

## 二、探针 `tmp/r166-real-big-thread.cjs`（9 场景，不入库）

骨架照抄 `scripts/check-hot-window.cjs`（playwright + `page.route` 拦 `thread/read`/`thread/resume` 回夹具，其余 RPC 透传）。**真实数据文件不进仓**（脱敏红线）⇒ 探针留在 gitignored `tmp/`，读 `tmp/r166-real-read.json`；复跑配方：起桥（4190）→ `node tmp/r166-real-big-thread.cjs`。

1. 贴底打开：窗口化生效（渲染 3/170 轮）且贴底维持；
2. warm 折叠卡窗口化生效（渲染 1 / warm 区 140）；
3. 上滚 2000px ⇒ dist 恰好 +2000（spacer 守恒）；
4. 滚到顶再回底 ⇒ sh 与顶读数一致（**同 coldPage 态**，见 §三-1）；
5. JumpBar 跳最老问题（cold 区！）⇒ 自动扩 cold 页、强制入窗、锚点落点 ≈ 12px 精确；
6. 模型切换分割栏（localStorage 播种 round-73 marker 锚定第 85 轮）在窗口化 warm 区渲染；
7. 分割栏实际高度量出（**30.0px**，回填 round-163 登记的 44px 估算边界）；
8. 反跑禁 RO ⇒ hot 区 30 轮全部强制入窗（warm 层估算驱动、与 RO 无关，仍窗口化）；
9. 反跑 sh 与窗口化态 sh 一致（±2px）⇒ hot spacer 守恒非恒真。

## 三、首跑 3 项失败的归因（全部不是 spacer 失守）

首跑 9 项过 6，3 项失败逐一定性（临时探针挂 `window.__R166_WARM` 读计划层输入输出，**提交前已移除**）：

1. **「顶→回底 sh 漂移 +1886px」= 冷区自动扩页（设计行为）**。滚到顶附近触发 `LOAD_MORE_SCROLL_THRESHOLD_PX` 的自动 `nextColdPage` ⇒ `coldPage` 0→1 ⇒ warm 区 20 块 → 40 块（estSum 1646 → 3292，Δ=1886 与 sh 增量**逐位一致**）。扩页完成后顶/回底 sh **完全相等**（53091 == 53091）。首跑断言拿「扩页前的贴底读数」比「扩页后的回底读数」，比错了对象 ⇒ 探针口径改为**同 coldPage 态**（顶 ↔ 回底）。
2. **回底 dist=+14px = 模型切换分割栏估算误差**。实测分割栏 30.0px vs 登记估算 44px，每条 +14px 漂移 ⇒ 产品修复（§四）。修复后回底 dist=0。
3. **反跑期望 `turns==170` 照抄错了口径**。round-165 的合成 30 轮全在 hot 区，禁 RO = 全量；本线程 170 轮分属 cold/warm/hot，禁 RO 只打掉 hot 层的实测缓存（30 轮强制入窗），warm 层是估算驱动、本来就窗口化 ⇒ 正确期望 `turns==30 && 0<warmCards<140`。

**关键结论：估算常量在真实数据上全部命中**——warm 折叠卡实测 68.5（与常量逐位一致，真实预览文本 truncate 生效）、时间分隔栏实测 34（逐位一致）、hot spacer 全实测守恒。round-163「近似常量」前提在真实数据形态下成立。

## 四、产品修复：`MODEL_SWITCH_DIVIDER_HEIGHT_PX` 44 → 30

`src/utils/warmTurnWindow.ts` 唯一改动：登记估算 44px → 真机实测 30.0px（1440×900 / dpr 1，真实大线程探针经 localStorage 播种 marker 量得）。round-163 §六② 的「未实测登记」就此闭环；修正后窗口滑动时每条分割栏 14px 的贴底落点漂移消失。

## 五、验证读数

- 探针 `tmp/r166-real-big-thread.cjs` **9/9 通过**：贴底渲染 3/170 轮（dom 1339 / heap 92MB / open 2.1s）vs 反跑 hot 全量（dom 12678 / heap 99MB）——**DOM 规模 ~9.5×**；sh 51247 逐位一致；JumpBar 落点 12.0px；分割栏 30px 实测。
- 回归：`check-hot-window` 6/6、`check-bottom-lock` 4/4。
- 单测 **1035/1035**（89 文件，基线不漂；warmTurnWindow 21 例对新常量全绿）；`vue-tsc --noEmit` 0。
- `vite build` + `tsup` 通过（ESBUILD_BINARY_PATH 分指 0.25.0 / 0.27.7，老坑复认）。

## 六、剩余边界

- 夹具轮数是复制的（170 = 10 真实轮 × 17）；**单轮内**真实形态已覆盖，跨轮多样性（长 agent 回复、图片轮）未覆盖；
- 探针在 `tmp/`（真实数据不进仓），**不是** CI/闸门资产；重建数据源需重跑 §一-1/2 的捕获步骤；
- 反跑口径 = hot 30 轮（warm 层无「禁估算」等价反跑——估算驱动是其设计）；
- 常量绑定字体/缩放（round-163 §六③ 原边界不变，换环境按 round-163 §二 配方复测）。

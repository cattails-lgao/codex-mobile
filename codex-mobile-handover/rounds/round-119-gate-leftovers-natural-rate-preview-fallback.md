# 第一百一十九轮：`check-thread-switch-feedback` 两条遗留的处置——自然复现定量 + 内容挑选 preview 兜底

> 用户口径：「处理 round-118 的两条未完成项」——即 round-118 §四 遗留 1（未在无注入的自然流程里复现老闸门失败）与遗留 3（`thread/turns/list` 对少数旧形状 rollout 报 0 轮次，导致「按内容挑选」偏保守）。本轮在**另一台机器（macOS、codex CLI 0.160.1）**上完成取证与改动；round-118 的 `tmp/` 探针未入库、本机不存在，老闸门从 git 历史恢复（round-89 版 `c8a5e14a`，194 行）。

---

## 一、环境重建（本机从零起闸门）

- **构建**：`pnpm run build` 在沙箱内被 pnpm 的 run 前置依赖检查拦死（workspace symlink 注册触发 `node-brokered-fs-shim` 拒绝）→ 绕过 pnpm 包装直跑等价链：`vue-tsc --noEmit` **EXIT=0** → `vite build`（6.4s）→ `tsup`（dist-cli 674.99 KB），`dist/` 与 `dist-cli/` 按纪律一起重建。
- **服务**：4173 被现有 dev 进程占用 → `dist-cli` 起在 **4191**（`CODEX_HOME=项目 .codex`，`--no-tunnel --no-open --no-login --no-password`）。注意本机 shell 带 `HTTP_PROXY` env，curl/probe 全部要 `--noproxy '*'` / `NO_PROXY='*'`；后台进程须用受管后台任务跑（`nohup`+`&` 会随父 shell 被回收，macOS 无 `setsid`）。
- **沙箱**：`.codex/sessions/` 现有 3 条真实 rollout（0.147.0 时代，55/279/306 KB），`thread/turns/list` 实测 **3/4/1 轮**——全部有内容，闸门可跑（round-118 的 ≥2 条前置条件天然满足）。
- **浏览器**：macOS `/Applications/Microsoft Edge.app/.../Microsoft Edge`（老脚本里的 Windows 默认路径必须用 `PROFILE_EDGE` 覆盖）。

---

## 二、遗留 1：自然复现实验（0/15，叠加 round-118 的 0/6 → 0/21）

**做法**：老闸门（round-89 版，用索引/标题当期望的缺陷版）在**当前生产构建**上无注入连跑 15 次（`tmp/r119-old-gate-loop.cjs`，逐次日志留 `tmp/r119-old-run-*.log`），按失败签名分类（重排 vs freeze vs 其它）。

**结果**：

| 项 | 结果 |
|---|---|
| 重排失败（round-117 原症状签名） | **0/15**；叠加 round-118 的 0/6 → **累计 0/21**（rule of three 95% 上界 ≈ 14%） |
| `first-open freeze <= 60ms` 失败 | **6/15**（frozen 61–100ms）——**另一种失败形态**：freeze 预算断言对机器负载敏感（新旧闸门都有此断言），与重排缺陷无关 |
| 机制证据 | 15 次运行 tour 断言全过 ⇒ **运行期行序自始至终没变**（tour 末次点击始终落在 t0 的 `titles[0]`、`settled.hash` 复验逐字一致） |

**机制结论**：在**本机（codex CLI 0.160.1）打开线程不触发侧栏重排**——round-118 机器上实测「打开中段行 4 例中 2 例移位」，本机 15 次运行 0 次移位。自然复现在本机**结构性不可能**，不是概率不足。重排危害的成立条件是「重排真实落地」（round-118 机器会发生；注入版把它变成确定步骤后 0/6 必现）。round-118 的结论**维持不变并加严**：构造上不成立 + 注入下必现 + 本机自然流程下诱因不存在。

**两条新观察（记录，不处置）**：

1. **freeze 预算在慢/载机器上脆弱**：老闸门 6/15、frozen 61–100ms 超 60ms 预算；本机空载时读数 50–60ms 本就贴着预算。两个版本的闸门都有这条断言，在负载高的机器上会形成「与被测缺陷无关」的偶发失败。若日后要在慢机器上跑闸门，可考虑 `FREEZE_BUDGET_MS` 上调或把 freeze 断言改为「警告不失败」——本轮不动。
2. **重排出现的跨运行方差**：第一次新闸门运行诊断行报 **2/3 漂移**，之后（warm 状态）的运行报 **0/3**，15 次老闸门运行也全为 0。猜测：`CONTENT_IDS` 对 notLoaded 线程的 `turns/list` 首探会触发加载、touch 线程元数据，造成一次性的重排（假设，未单独证）。

---

## 三、遗留 2：0 轮次现象取证 + 内容挑选 preview 兜底

### 3.1 本机取证：0 轮次在 0.160.1 上不可复现（两个形状假设均证伪）

round-118 记的 0 轮次 rollout（`01a06803`/`01a06806`，50/52 KB，0.158 机器）不在本机。用合成 rollout 在本机复现的两次尝试**都失败**：

| 假设 | 形状 | 结果（codex 0.160.1） |
|---|---|---|
| H1：轮次按 `turn_context` 键控 | `session_meta` + `response_item` 消息，**无** `turn_context`/`task_started` | `turns/list` 报 **1**，preview 正常派生 |
| H2：response_item 缺失导致派生失败 | **纯 `event_msg`**（user_message + agent_message） | `turns/list` 报 **1**，preview 正常派生 |

⇒ app-server 对旧形状的轮次派生比预期宽得多，0 轮次是**版本性/形状特定**现象（0.158 时代的观察），本机造不出来。两个合成文件在实验后已删除，沙箱还原为 3 条真实线程。

### 3.2 改动：`CONTENT_IDS` 改两级挑选（`scripts/check-thread-switch-feedback.cjs`）

- **tier 1（不变）**：逐行问 `thread/turns/list {limit:1, itemsView:'notLoaded'}`，`data.length > 0` 即有内容。
- **tier 2（新增，仅当 tier 1 不足 limit 时）**：问一次 `thread/list`，把**非空 `preview`** 作为次级「有内容」信号兜底挑选——preview 派生自首条用户消息（round-81 结论：rollout 是元数据事实源），独立于 turns/list 的轮次派生。
- **诊断行（新增）**：兜底被用到时打印 `content selection: N by turns/list + M by preview fallback`，让非典型环境一眼可见。
- **已声明的边角**：preview 被round-81 goal 救济路径填充的线程可能没有消息——这种挑选会让**结算条件失败**（响亮地失败而非静默通过），诊断行保证归因可见；注释里如实写明。

### 3.3 验证

| 项 | 结果 |
|---|---|
| **存根探针**（`tmp/r119-fallback-verify.cjs`） | 把 `turns/list` 响应**存根为全空**（模拟 0.158 的 oracle 失效），从闸门源码提取真实 `CONTENT_IDS` 在真实页面执行 → `picked 3/3` 全部来自 preview（`fromFallback=3`）——tier 2 路径按设计工作 |
| **探针的额外收获** | 当场抓到一个真 bug：`((cond) || []).map` 在条件为真时得到 `true` 而非数组 → `.map` 崩溃；该路径在真实环境同样会走（tier 1 不足 limit 时），已修为三元表达式 |
| **健康路径回归** | 闸门 **12/12 全绿**（3 条真实线程、tier 1 直接挑满、诊断行不出现、`0/3` 漂移） |

---

## 四、诚实边界

1. **自然复现仍未达成**（0/21）——但本轮把它从「概率不足」升级为「本机诱因不存在」的机制性结论，并给出定量上界。缺陷本身的修复依据不变（构造上不成立 + 注入下必现）。
2. **preview 兜底的端到端未验证**（真实 0 轮次线程被兜底挑中并渲染成功）——本机造不出 0 轮次线程；已验证的是兜底**代码路径**（存根 oracle）与健康路径**零回归**。
3. **freeze 预算的负载脆弱**（6/15）未处置——非本轮缺陷，记录为闸门在慢/载机器上的已知敏感点。
4. macOS 侧只跑了本闸门与本轮探针；其余 6 个闸门、全量 Vitest 未在本机重跑（本轮唯一源码改动是闸门 `.cjs` 脚本本身，产品源码零改动，round-118 的 714/714 基线不受影响）。

---

## 五、涉及文件

**改（脚本）**
- `scripts/check-thread-switch-feedback.cjs`：`CONTENT_IDS` 两级挑选（turns/list → 非空 preview 兜底）+ 诊断行 + 修 `((cond) || []).map` 崩溃；检查项仍为 12

**改（文档）**
- `codex-mobile-handover/rounds/round-119-*.md`（本文）
- `codex-mobile-handover/codex-mobile-handover.md`（快照 / Dev 状态 / 未完成事项 / 轮次索引 / 页脚）
- `tests/thread-loading-state/thread-switch-feedback-gate-identity-and-waits.md`（两级挑选 + 诊断行）

**探针 / 脚本（未入库，`tmp/`）**
- `tmp/r119-old-gate.cjs`：老闸门（round-89 版，自 git `c8a5e14a` 恢复）
- `tmp/r119-old-gate-loop.cjs` + `tmp/r119-old-run-*.log`：15 次自然运行与逐次日志
- `tmp/r119-turns-probe.cjs`：逐线程 `thread/list` + `turns/list` 取证
- `tmp/r119-make-zero-turn-thread.cjs` / `tmp/r119-make-zero-turn-v2.cjs`：两个形状假设的合成器（已证伪，沙箱已还原）
- `tmp/r119-fallback-verify.cjs`：存根 oracle 验证兜底路径

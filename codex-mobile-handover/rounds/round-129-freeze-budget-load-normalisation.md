# round-129：闸门 freeze 预算按环境帧节奏归一——载机器上不再误红

> 日期：2026-10-08 · 环境：Windows / codex-cli 0.158.0 · 口径：处置 round-120 明确记「未处置」的闸门技术债
> 承接：[round-119](round-119-gate-leftovers-natural-rate-preview-fallback.md) §一「freeze 预算的负载脆弱（6/15）未处置」、[round-120](round-120-design-audit-motion-and-token-fixes.md) 同款记名

本轮**唯一改动是闸门脚本本身**（`scripts/check-thread-switch-feedback.cjs`），产品源码零改动、零运行时行为、零样式变化。

---

## 一、定案：为什么这条断言会在载机器上误红

`check-thread-switch-feedback.cjs` 有两条定时断言（`first-open freeze <= 60ms`、`switch freeze <= 60ms`），它们守的是 round-89 的修复：**点击侧栏线程后，选中高亮必须在切换工作开始前就画出来**（修复前整条切换链挤在同一个任务里，浏览器 76–143ms 一帧未画）。

原始实现有两个独立缺陷，载机器上会一起发作：

**缺陷 ①：单次采样 + 绝对 60ms 阈值。** 每次只点一次、只量一个样本，和一个与机器无关的常数比。round-119 在 macOS 机器上的记录：

| 条件 | 读数 |
| --- | --- |
| 空载 | `frozen` **50–60ms**（本就贴着预算） |
| 载态 | **6/15** 次跑到 **61–100ms** → 假红 |

也就是说这条断言在**空载时就贴着边**，机器一忙就翻——与被测缺陷（重排）无关。

**缺陷 ②：指标本身在慢机器上会退化。** `window.__freeze()` 的算法是「从点击那一帧起累加帧间隙，直到出现一个 **< 40ms** 的帧就停」——它默认机器的正常帧短于 40ms。如果机器慢到**每一帧都 ≥ 40ms**（载机器正是如此），这个循环**永远不 break**：

```
旧实现（无界）: frozen = Σ 所有后续帧间隙（可无限增长）
加上 12 帧边界后: frozen = 12 × 帧长（例如 12 × 70 = 840ms）
```

两个数都**不再表示「点击后有多久没画」**，于是「用 `2×ambient` 之类把阈值放宽」这种只改阈值的修法**无效**——值本身已经爆炸。**指标和阈值都得改。**

---

## 二、改动：指标按环境节奏判定 + 预算按 ambient 归一

### 2.1 索引「已绘制的一帧」——自适应 break 阈值

`__freeze` 的停止条件从写死的 `< 40ms` 改成「帧间隙回到**本机当前的环境节奏**」：

```js
const quiet = Math.max(40, (window.__ambient(0.5) || 0) * 2)   // 40ms 是原来的地板
for (const frame of framesAtOrAfterClick) {
  frozen += frame.gap
  if (frame.gap <= quiet || ++seen >= MAX_FREEZE_FRAMES) break
}
```

- 快机器：`quiet = max(40, 2×8) = 40` ⇒ **与改动前逐字相同**的测量。
- 慢机器（每帧 ~70ms）：`quiet = max(40, 140) = 140` ⇒ 点击后的第一帧（~70ms）就 break ⇒ 读数回到「点击到首次绘制」的语义，而不是累加到 12 帧的伪值。

### 2.2 预算按 ambient 归一

每次点击**之前**先开一个 **700ms 静默窗**（`AMBIENT_WINDOW_MS`，不打任何东西），用同一套 rAF 采样量出本机此刻的帧节奏，然后：

```js
budget = min( max( 60ms, 2 × ambient_p90 ), 200ms )
```

| 环境变量 | 默认 | 作用 |
| --- | --- | --- |
| `FREEZE_BUDGET_MS` | `60` | 预算地板（空载机器上的严格度） |
| `FREEZE_BUDGET_MODE` | `scaled` | `absolute` = 保留 round-128 及以前的行为（不看 ambient） |
| `FREEZE_AMBIENT_FACTOR` | `2` | 放大倍数 |
| `FREEZE_BUDGET_CAP_MS` | `200` | 硬上限 |

- 空载机器：`2×8 = 16 < 60` ⇒ 预算仍是 **60ms**，严格度不变。
- 载机器：`2×70 = 140` ⇒ 预算 **140ms**，一次「只花了一帧」的点击不再被定罪。

**过载时跳过而不是误红**：若 `2×ambient_p90 > cap`（机器忙到墙钟断言毫无意义），该条只打印 `skip` 并**不计入失败**——机器太忙不该给产品定罪。

### 2.3 自带取证开关（默认全关）

| 环境变量 | 作用 |
| --- | --- |
| `FREEZE_SYNTHETIC_LOAD_MS` | 每帧忙等 N ms（`rAF` 内忙等），制造**均匀变慢**的机器 |
| `FREEZE_INJECT_CLICK_STALL_MS` | 捕获相点击监听器忙等 N ms（跑在 app 自己的 handler **之前**）＝round-89 回归形状 |

外加 `node scripts/check-thread-switch-feedback.cjs --self-test`：**浏览器无关**的算式自检（8 例，含 cap / skip 路径），不跑产品、不需要模型。

> `FREEZE_SYNTHETIC_LOAD_MS` 为什么必须是 `rAF` 忙等而不是 `setInterval` 忙等：实测 `setInterval` 忙等（90ms 忙 / 180ms 周期）只把 `max` 从 10ms 抬到 **96ms**，`p90` **仍是 8ms**（大多数帧不受影响、点击多半落在快帧上）⇒ 复现不了「载机器」。改成每帧忙等后：`p50 = p90 = max = 70ms`（**均匀**变慢），才等价于载机器看到的帧节奏。

---

## 三、验证

### 3.1 决定性 A/B/C/D/E（**唯一变量**，非「改前 vs 改后」的跨构建对照）

跑在一个**生产构建**服务上（`PROFILE_BASE_URL=http://127.0.0.1:4191`，`dist/` 按请求读盘、非 dev、`isDev=false`；该 home 有 **10 条线程 / 4 条有消息**）。原始输出存 `tmp/r129-verify-matrix.txt`。

| 腿 | 条件 | 读数 | 结果 |
| --- | --- | --- | --- |
| A | 空载 / `scaled` | `frozen=10ms ambient90=8ms budget=60ms` | **PASS**（EXIT 0） |
| A2 | 空载 / `scaled`（重跑） | `frozen=11ms/8ms ambient90=8ms budget=60ms` | **PASS** |
| B | `load=70` / **`absolute`**（＝round-128 及以前） | `frozen=74ms ambient90=71ms budget=60ms` × 2 | **FAIL 2/2**（EXIT 1） |
| C | `load=70` / `scaled` | `frozen=74ms ambient90=71ms budget=142ms` | **PASS** |
| C2 | `load=70` / `scaled`（重跑） | `frozen=74ms/73ms ambient90=71ms/70ms budget=142ms/140ms` | **PASS** |
| D | `load=70` / `scaled` + **注入 150ms 点击期阻塞** | `frozen=316ms/300ms ambient90=70ms budget=140ms` | **FAIL 2/2** |
| E | `load=70` / `scaled` + `cap=60`（过载） | `skip × 2`，无失败项 | **PASS**（all checks passed, EXIT 0） |

**怎么读这张表**：

- **B vs C 是对照组**：同一个负载（`load=70`）、同一份构建、同一次运行环境，**唯一变量是判定模式**。`absolute` 判 `74 > 60` 失败——这就是 round-119 记的假红被**逐字复现**；`scaled` 判 `74 ≤ 142` 通过——假红被消除。
- **D 证明没有「一律放行」**：同一个负载下再叠 150ms 点击期同步阻塞（round-89 的回归形状），`frozen` 飙到 300–316ms **> 预算 140ms** ⇒ 仍然 **FAIL**。归一化放的是「环境节奏」，不是「真停顿」。
- **A/A2 证明空载严格度不变**：预算仍是 60ms，读数 8–11ms 与改动前（`tmp/r129-freeze-baseline.txt`：三次 8–10ms）逐字一致。
- **E 证明过载走的是跳过**：`2×70=140 > cap=60` ⇒ 两条都 `skip`，整轮仍 `all checks passed`，不产生假红。

### 3.2 `--self-test`（浏览器无关，可复跑）

```
$ node scripts/check-thread-switch-feedback.cjs --self-test
ok    idle machine keeps the 60 ms floor  (got=60 want=60)
ok    loaded machine scales by 2x ambient  (got=140 want=140)
ok    absolute mode ignores the cadence  (got=60 want=60)
ok    scaled budget is capped  (got=200 want=200)
ok    zero ambient falls back to the floor  (got=60 want=60)
ok    idle never exceeds the cap rule  (got=false want=false)
ok    very loaded machine exceeds the cap  (got=true want=true)
ok    absolute mode never skips  (got=false want=false)

self-test passed
```

8/8，EXIT **0**；把 `scaled` 改回固定阈值即会红（该自检就是「预算算式不得静默退化」的守卫）。

### 3.3 全量验证

| 项 | 结果 |
| --- | --- |
| `node --check scripts/check-thread-switch-feedback.cjs` | SYNTAX_OK |
| `vue-tsc --noEmit` | **EXIT=0** |
| Vitest 全量 | **742/742 通过（76 文件）零失败**（与 round-128 基线逐字相同） |
| `vite build` | **EXIT=0**（13.46s） |
| 闸门自身 | 见 §3.1（A/A2/C/C2 PASS、B/D 按预期 FAIL、E PASS） |

> 本轮不新增静态契约断言：`check-ui-contract.cjs` 只读 `src/` 的产品源码、不读 `scripts/`（已核对），把闸门断言塞进「UI 契约」属错位；本轮的「非空过」证据是 §3.1 的 **B vs C**（同一负载、唯一变量）与 §3.2 的 8 例自检，均比静态断言更强。

### 3.4 计数与标签

计数器仍是 **12 项**（未增删检查项），只改两条 freeze 断言的**判定口径**；标签仍叫 `first-open freeze` / `switch freeze`（历史文档按此引用），但语义已在文件头注释里写明是「点击到首次绘制」。

---

## 四、诚实边界

① **本机复现不了 round-119 的真实假红**。本机（Windows）空载 `frozen=8–11ms`，远低于 60ms；载态只能用 `FREEZE_SYNTHETIC_LOAD_MS` **合成**。所以 §3.1 是「合成负载下的对照」，不是「真实载机器上的对照」。合成负载是**均匀**变慢（`p50=p90=70ms`），与真实载机器的**突发式**停顿分布不完全同构。

② **归一化必然会降低载机器上的灵敏度，这是取舍不是零成本**。载机器上「环境节奏」本身就在噪声量级，`2×ambient` 以内的停顿**无法**与调度抖动区分。空载机器不受影响（预算仍 60ms、灵敏度与改动前逐字相同）；越忙的机器，放行的停顿越大（上界 `2×ambient_p90`，硬顶 `200ms`）。

③ **ambient 只在点击前 700ms 静默窗内采样**。若窗口内恰好没有停顿、而点击那一瞬才来一次停顿，仍可能误红——这是**概率性**残留，不是结构性保证；加大 `AMBIENT_WINDOW_MS` 可缓解（未做成环境变量）。

④ **过载跳过是「静默放行」**。`2×ambient_p90 > cap` 时该条只打印 `skip`、不计失败。若把它当作唯一判据，等于**在极忙机器上不测 freeze**。本仓无 CI 接线（只有 `.github/workflows/build-apk.yml`，不跑这些闸门），故影响仅限人工跑闸门时；若要进 CI，应先规定「`skip` 超过 N 次即视为环境不满足」的策略。

⑤ **未在 codex-cli 0.160.1 上复测**。本机 0.158.0；改动只在闸门脚本（浏览器侧），不涉及 app-server 协议，故判断与 CLI 版本无关，但没在 0.160.1 上实跑。

⑥ **前置条件未变**：该闸门仍要求服务所连的 `CODEX_HOME` 里有 **≥2 条有消息的线程**，否则报「环境不满足」退出（round-118 起如此）。

⑦ **未发版、已推送**：随下一次发布走（npm `latest` 仍是 `0.1.127`，round-122 ~ round-129 一起）。

---

## 五、涉及文件 + 复现方式

**改动文件（1 个）**

- `scripts/check-thread-switch-feedback.cjs`（17 538 → 27 112 字节）
  - 页面内观察器：`__ambient(pct)`（支持任意分位）、自适应 `__freeze`、`MAX_FREEZE_FRAMES=12` 边界、`__synthLoad(busyMs)`（rAF 忙等）、`__injStall(ms)`
  - Node 侧：`effectiveFreezeBudget` / `ambientExceedsCap` / `checkFreeze`（三者均可传参，供 `--self-test` 复用）、`AMBIENT_WINDOW_MS=700`、点击前的静默窗、`--self-test` 分支
  - 环境变量：`FREEZE_BUDGET_MS` / `FREEZE_BUDGET_MODE` / `FREEZE_AMBIENT_FACTOR` / `FREEZE_BUDGET_CAP_MS` / `FREEZE_SYNTHETIC_LOAD_MS` / `FREEZE_INJECT_CLICK_STALL_MS`

**复现（需要一个跑着生产构建、且 ≥2 条有消息线程的服务）**

```bash
# 0) 自检（不需要浏览器 / 模型 / 服务）
node scripts/check-thread-switch-feedback.cjs --self-test          # 8/8, EXIT 0

# 1) 空载对照（严格度不变）
PROFILE_BASE_URL=http://127.0.0.1:4191 node scripts/check-thread-switch-feedback.cjs
#   => ok  first-open freeze <= 60ms  (frozen=~9ms ambient90=8ms budget=60ms)

# 2) 合成载机器：唯一变量是判定模式
FREEZE_SYNTHETIC_LOAD_MS=70 FREEZE_BUDGET_MODE=absolute \
  PROFILE_BASE_URL=http://127.0.0.1:4191 node scripts/check-thread-switch-feedback.cjs
#   => FAIL  first-open freeze <= 60ms  (frozen=74ms ambient90=71ms budget=60ms mode=absolute)

FREEZE_SYNTHETIC_LOAD_MS=70 FREEZE_BUDGET_MODE=scaled \
  PROFILE_BASE_URL=http://127.0.0.1:4191 node scripts/check-thread-switch-feedback.cjs
#   => ok    first-open freeze <= 142ms  (frozen=74ms ambient90=71ms budget=142ms)

# 3) 叠真回归形状（应仍 FAIL）
FREEZE_SYNTHETIC_LOAD_MS=70 FREEZE_INJECT_CLICK_STALL_MS=150 \
  PROFILE_BASE_URL=http://127.0.0.1:4191 node scripts/check-thread-switch-feedback.cjs
#   => FAIL  first-open freeze <= 140ms  (frozen=316ms ambient90=70ms budget=140ms)
```

**取证原始输出**：`tmp/r129-freeze-baseline.txt`（改动前空载 3 跑）、`tmp/r129-verify-matrix.txt`（A~E 五条腿）、`tmp/r129-load-probe.cjs`（负载 profile 探针）、`tmp/r129-patch-gate{,2,3,4}.cjs`（本轮改动的 read-modify-write 补丁，带「每个片段必须恰好匹配 1 次」断言）。

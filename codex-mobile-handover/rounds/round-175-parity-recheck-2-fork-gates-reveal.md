# round-175 · parity 滞后复核第二轮：分叉 / 能力门控 / 揭示动画三处改判

> 承接 round-174 的复核口径（「parity 表判定要与代码核对，别按旧快照报还差」）。本轮**零代码改动**（纯取证 + 文档），把剩余疑似滞后的三行全部核掉。

## 一、结论先行

| parity 行 | 旧判定 | 新判定 | 一句话依据 |
| --- | --- | --- | --- |
| 行 79 分叉 | 他们对（少一次往返） | **打平** | round-168 主路径已是 `thread/fork {beforeTurnId}` 一步截断；`lastTurnId` 中间路径有意不做（运行时探测模式下留孤儿线程、与降级 revert 同为 2 RPC 上限） |
| 行 132 能力门控 | 他们更好（长期收益） | **打平（模式）· 规模差距登记** | `capabilityGates.ts`（round-168）已收敛 9 能力单一数据源；方法探测覆盖现有全部能力面，版本维度唯一实例已在桥侧 |
| 行 64 流式揭示动画 | 他们对（观感）；非必须 | **打平（当前版本）** | 26.1013 asar 全量复核：该动画已被桌面移除，两端行为一致 |

## 二、逐行取证

### 行 79 · 分叉

- **round-168 现状**：`forkThreadFromTurn`（`useDesktopState.ts:2623`）优先 `thread/fork {beforeTurnId: cutoffTurnId}` 一步截断（与桌面主路径同款、同一次 RPC），截断谓词在 `threadForkTruncation.ts`；上游静默忽略未知参数时才降级全量 fork + 副本 revert（`thread/revert`）。
- **`lastTurnId` 取证**（`tmp/r175-fork-versions.cjs`）：对本机四版二进制（0.159.0 / 0.161.0 / 0.162.0 / 0.162.1）逐一搜 `ThreadForkParams`——**四版均为 20 元素且恒含 `lastTurnId`、`beforeTurnId`、`excludeTurns`**；0.162.1 二进制错误串另证互斥语义（「`beforeTurnId` cannot be combined with `lastTurnId`」「fork boundaries are mutually exclusive」）。
- **有意不做 `lastTurnId` 的推理**：桌面三路径的价值来自**能力表预知**（发 RPC 前就知道该走哪条，永不浪费往返）。我们是运行时探测（发出去看结果）：主路径 1 RPC；若上游不支持 beforeTurnId，降级在**已 fork 的副本**上 revert（2 RPC，不留垃圾）。此时补试 `lastTurnId` 只能对**源线程再 fork 一次**——在上游已创建第一个副本的前提下弃之，**孤儿线程**会出现在线程列表；且最好情况也是 2 RPC，与 revert 兜底持平。净收益为零、副作用为正 ⇒ 不做。

### 行 132 · 能力门控

- **round-168 现状**：`src/utils/capabilityGates.ts` 单一数据源 9 能力（hooks / remoteControl / plugins / apps / mcps / mcpReload / mcpLogin / marketplace / pluginShare），App.vue / DirectoryHub.vue 共 9 处散落 `methodSet.has()` 内联数组已被替掉——行文里「散落探测」的描述已过时。
- **版本维度侦察**：桌面「60+ 能力 × 最低版本」的版本维度，只在「**方法存在但行为/开关不同**」时才有独立价值（方法不存在 ⇒ 现有方法探测已经判死）。我们唯一此类实例 `features.instant_interrupt ≥ 0.159.0` **已在桥侧实现**（`appServerRuntimeConfig.ts` `codexCliSupportsInstantInterrupt` + `parseVersionTriple`，round-164 接线）。
- **fork 参数佐证**：`beforeTurnId` / `lastTurnId` 自 0.159.0 起恒在（四版二进制实测）⇒ 对这类参数无需版本门控。
- **残余差距**：60+ 的规模、别名表、预发布（pre-release）比较——属桌面多端发布形态的工程化，登记为「等能力面扩张到方法探测不够用时再立项」。

### 行 64 · 流式揭示动画

- **取证**（`tmp/r175-reveal*.cjs` 三连搜，全 15171 个资产文件）：
  - `min(3000` / `Math.min(3e3` / `Math.max(1e3` 命中全为无关噪声（vite 依赖映射、CodeMirror parser、analytics retry）；
  - turn 列表 chunk（`virtualized-turn-list-8f04484ca276.js`，round-148 起哈希未变）**零** `duration` / `animation` / `1e3` / `*5` 命中；
  - `length*5` 全量命中 8 处全是 mermaid `cose-bilkent` 布局算法。
- **结论**：公式 `min(3000, max(1000, 长度×5))ms` 属**早期桌面版本**的取证，26.1013 已移除该动画——当前桌面流式文本与我们一样直接出现。判定改「打平（当前版本）」。

## 三、验证

- 纯文档轮：`src/` 零改动 ⇒ 不跑产品侧构建/单测（口径同 round-167）。
- 三道文档闸门：脱敏违规 0 / 链接+锚点 0/0 / 派生 drift 0（见提交记录）。
- 取证脚本留档：`tmp/r175-fork-versions.cjs`（四版本 ThreadForkParams）、`tmp/r175-fork-schema.cjs`（0.162.1 错误串）、`tmp/r175-reveal.cjs`/`reveal2`/`reveal3`（揭示动画三连搜）。

## 四、诚实边界

- 本机二进制谱系只覆盖 **0.159.0–0.162.1**；「beforeTurnId/lastTurnId 自 0.159.0 起恒在」的结论**不能外推到更老版本**——但 0.159.0 以下的上游本就低于本仓最低支持线（schema 快照 0.162.1），运行时探测降级链仍兜底。
- 行 64 的「早期版本取证」没有留原始出处轮次（判定书成文时未记 chunk 名）；本轮以「26.1013 现状」为准做改判，若用户在更老桌面版上看到该动画，属版本差异，不改回。
- parity 表 A 域 §二逐项对照其余行的旧行号（`:997-998` 等）仍未逐一复核（round-174 已登记）。

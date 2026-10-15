# round-164 · 贴底锁定的确定性收口（锁底从「猜帧数」改为「状态」）

日期：2026-10-15（round-155 验证轮的次日，接住昨晚拉取复验时定下的两件小事）

## 一、动机

round-155 真机验证时撞到一次**未复现**的「图片到达后列表没有回锁到底」（4 次忠实复现全过）。
当时判定：故障在写路径**上游**——补锁只覆盖两条路：

1. `scheduleConversationScroll` 的 rAF 里锁 6 帧（`scheduleBottomLock(6)`）；
2. `bindPendingImageHandlers` 给「**bind 时点已在 DOM 里**的 `<img>`」绑 load/error（`scheduleBottomLock(3)`）。

任何落在两者之外的增高都会漏锁：晚于 bind 创建的 img（warm 窗口重渲染、分支渲染）、
代码高亮/字体晚到引起的重排……锁底本该是**状态**（贴底 ⇒ 任何内容增高都回到底），
不该是**猜帧数**。本轮把第三条路补上，根治之。

## 二、实现（`ThreadConversation.vue`，+60/−0，一处连续块 + 挂载/卸载各一行）

- **`ResizeObserver`**：观察滚动容器自身（视口变高/变矮）+ 全部**直接子元素**
  （内容增高 = 某个子元素的盒子变高）。回调里 `shouldLockToBottom()` 成立才 `scheduleBottomLock(2)`。
- **`MutationObserver`**（只盯 `childList`）：新挂载的子元素补进观察集（`observe` 已观察元素是 no-op，
  全量重扫即可）。当前 DOM 规模被批 3b 压在 ~40 li，重扫可忽略；若将来上到数千应换增量 diff
  （代码内注释已登记此上限）。
- **快路径保留**：图片 load/error 与 6 帧锁照旧——它们先于 RO 触发，少等一帧。
- `typeof` 守卫：环境无 `ResizeObserver`/`MutationObserver` 时静默跳过，行为退回现状（不劣化）。
- 无 `SHARED_BRIDGE_VERSION` bump（未动 `AppServerProcess` 成员 / `ThreadTerminalManager` 构造参数）。

## 三、新闸门 `scripts/check-bottom-lock.cjs`（4 场景 + 反跑证明非空）

沿用既有浏览器闸门约定（Playwright、`PROFILE_BASE_URL`、合成 thread、SKIP 退 2），
合成数据形状直接复用 round-155 已真机验证过的 harness 字段。四场景：

| # | 场景 | 操作 | 断言 |
| --- | --- | --- | --- |
| 1 | 贴底 + 末轮增高 | 贴底后给最后一个 `li.conversation-turn` 注入 `minHeight: +500` | 等待后 `dist = 0`（RO 回锁） |
| 2 | 已滚开 + 增高 | 先上滚 400px 再注入同样增高 | `dist` 保持 ≈ 900（**不拽人**，保护阅读位） |
| 3 | **反跑**：RO 置为无操作 stub | 同场景 1 | `dist = 500`（漏锁复现 ⇒ 证明场景 1 非恒真） |
| 4 | 恢复真 RO | 同场景 1 | `dist = 0` |

实测读数：4/4 过，场景 3 稳定复现 `dist=500`、场景 1/4 稳定 `dist=0`。

## 四、闸门开发路上的四个坑（都进了代码或本文，防复发）

1. **dev server 冷启动**：首启 Vite 按需编译上千模块，`domcontentloaded` > 20s ⇒ 闸门
   `goto` 20s 超时直接 SKIP。修法：goto 放宽到 60s + 失败重试一次。（此前那批闸门能过，
   是因为 check-theme 先撞过一次把编译预热了——**时序依赖的假绿**。）
2. **`delete window.ResizeObserver` 会炸应用**：`ThreadTerminalPanel.vue:191` 与
   `useProjectDragAndDrop.ts:82` 是**无守卫**的 `new ResizeObserver`（`App.vue` 有 `typeof` 守卫）。
   反跑改用**可恢复 stub**：记录原实现 → 替换为 no-op → 测完还原，应用照常跑。
3. **显式 `height` 被 flex 压回**：列表是 `flex-col` 滚动容器，给 `li` 设的 `height` 高于
   min-content 时被 flexbox 压扁，`scrollHeight` 纹丝不动（与 round-163 spacer 必须 `shrink-0`
   是同一机制）。注入增高必须抬 **min-content 地板** ⇒ 用 `minHeight`。
4. **注入时机撞上初始锁窗**：首次把增高注入在页面就绪后立即执行，恰好落在挂载期
   6 帧锁底窗口内，旧机制把视图钉回去 ⇒ 反跑「测不出漏锁」（`dist` 恒 0 的假绿）。
   修法：注入前先等初始锁窗彻底结束（探针 `tmp/r164-relock-probe.cjs` 抓到写入栈是
   `runBottomLockFrame` 才定位）。

## 五、验证矩阵

- `vue-tsc --noEmit` **0**；全量单测 **1019/1019（88 文件）**。
- 离线闸门：`check-ui-contract` **59/59**（本轮无 UI 变更）。
- 浏览器回归（同站点）：`check-fonts` 13/13、`check-agent-note-surfaces` 56/56、
  `check-message-media-surfaces` 44/44 —— 组件改动未碰坏任何现有表面。
- 新闸门 4/4（含反跑）。

## 六、同轮附带：`regen-app-server-doc.cjs` 假 drift 闭环（`6d14487c`）

昨晚复验发现 `--check` 在本机报 drift（1813→1826 行）：差异全部是 **13 个本机 gitignored
`.js` 伴生产物**（`.gitignore:28`，mtime 8-03）被脚本按目录全数不分扩展名扫进去
（TS 901 vs 文档 888）。修法：列目录时**按扩展名过滤（只数 `.ts`/`.json`）**。
修复后本机（含 13 个 js）`--check` = drift 0，干净机器读数不变。

## 七、诚实边界

- **无新单测**：jsdom 没有 `ResizeObserver` 实现，行为断言交给浏览器闸门（本文件 §三）；
  `syncObservedContent`/`onContentGrowth` 是 5 行级胶水，不值得为它们造 RO stub。
- 手动测试条目已入 `tests/thread-loading-state/bottom-lock-after-late-content-growth.md`
  （领域索引 +1，tests.md 计数 37→38）。
- 未动 `src/server/**`、未 bump 版本 / tag / Release；`vite build`/`tsup` 因仅前端组件改动，
  前端构建语义未变（无新依赖、无新入口），留待下批一起建。
- round-155 那次异常本身仍未复现——本轮是**机制性根治**（消除整类漏锁可能），
  不是对该次的复现修复；两者不矛盾。

# round-103 — P1：0.158.0 协议探针复跑全绿 + 大线程首触慢加载提示

日期：2026-09-29。承接 round-101 机会清单的 P1 两项：①复跑 `scripts/probe-turn-page.cjs`；②「首触 280s 迁移」加 UX 防线。用户指令「继续推进 round-101 清单里的 P1」。

## 一、P1-①：协议探针复跑（turns/list 已实现）

**背景：** round-101 审计（本日早些时候）实测 0.158.0 的 `thread/turns/list` 返回 `-32601: list_turns is not supported yet`，据此 round-102 做了 P0 兜底修复。本轮复跑探针发现上游状态已变。

**实测结论（`scripts/probe-turn-page.cjs`，直连 app-server，codex-cli 0.158.0）：**

- **`thread/turns/list` 已实现**：`{10000, notLoaded, desc}` 返回 27 个 id / ~50ms / 0.00MB；`{cursor, desc, full}` 游标页与全量水合 slice **深度逐字相同**；turn id 作 cursor 仍被拒绝。**5 项 fact 全部 PASS**（round-101 时 1/5 FAILED）。
- **round-84 有界 resume 探针（`scripts/probe-resume-turn-page.cjs`）同样 7 项假设全 PASS**：页 == 全量水合 slice 反转、notLoaded 计数精确、游标翻页恰好覆盖全部轮次一次、`threadTurnStartIndex` 推导与 legacy trim 一致（27 轮线程 218ms→93ms / 0.29MB→0.05MB）。
- **净结论**：round-86 有界翻页路径在 0.158.0 上**恢复可用**，round-102 的 P0 能力位分流退居守势（只在游标陈旧/瞬时错误时锁存，不再常态触发）；round-102 新增的边界响应与测试作为安全网保留，零改动。

**探针脚本的两个修复（均为可复现性修复）：**

1. **`model_providers.custom` 占位注入**：经 WebUI 旧版自定义端点创建的线程在 rollout 里记录 `model_provider="custom"`（legacy runtime id，与现行 `custom_endpoint` 不同），resume 报 `failed to load configuration: Model provider 'custom' not found`（`thread/read` 元数据不受影响，所以 round-101 只看到 resume 超时/失败）。线上桥经 `freeMode.ts` 注入 provider 定义，探针直连时没有——两个探针脚本各加三条 inert `-c model_providers.custom.*` 占位参数（不用该 provider 的线程零影响），任何线程形状都能 resume。
2. **codex 启动器路径**：pnpm store 哈希目录随升级变化（`2c10-`→`11d44-`→本轮 `19dc-`），硬编码候选注定过期；以第 4 参显式传入，定位方式 `cat <pnpm 全局 bin>/codex.CMD` 读 shim 里的真实路径。

**遗留（round-101 P1-③ 未做）**：「首触 280s 迁移」本身未复现——本机 `CODEX_HOME` 现存最大 rollout 仅 4.03MB（round-101 的 32MB/20 轮线程已不在），3MB 级全量水合实测 218–351ms。280s 数据以 round-101 实测为准，防线以提示形式落地（见下）。

## 二、P1-②：大线程首触 UX 防线（慢加载诚实提示）

**现象：** 0.158.0 首次打开超大旧线程时 app-server 做一次性迁移（round-101 实测 32MB ~280s），期间 UI 只有「加载消息中」，无任何解释。

**修复（`ThreadConversation.vue` + `useUiLanguage.ts`）：** 刻意不改请求语义、不做预热（迁移成本无论如何都要付，预热只是把卡顿挪到后台），只加一层**延迟出现的诚实提示**：

- `SLOW_LOAD_HINT_DELAY_MS = 5000`：加载开始时起计时器，超过 5s 仍未完成则追加一行 `text-xs text-ink-3` 提示（中/英双语，走既有 `t()` 表）：EN "Still loading — the first open of a large history can take a while." / ZH "仍在加载——较大的历史会话首次打开可能需要较长时间。"。
- 两种加载形态都覆盖：切换条（`conversation-switching-bar`，旧内容仍可见）与空会话加载行（`conversation-loading`）之后各挂一行（`conversation-loading-slow`，`role="status"`）。
- 三个重置点：加载结束（`isLoading` 变 false）清计时器并隐藏；换线程（`activeThreadId` watcher，`flush: 'post'`）按当前加载状态重启计时——**前一线程的等待不累计到新线程**；卸载（`onBeforeUnmount`）清理。
- 取值依据：round-84 实测有界 resume 常态 100–700ms，round-78 后首点 ~112ms——5s 足够把「异常慢」与一切正常负载分开，且不会对慢网络下的正常加载造成闪烁。
- **刻意不做**：进度条（协议无进度事件，做就是编数据）；预热（见上）；`ink-4` 作文字色（token 注释明确「仅非文本」，且对比度不达 round-97 的 ≥4.5:1 门槛——第一版写了 `text-ink-4`，已纠正为 `ink-3`）。

## 三、验证

- `vue-tsc --noEmit` 通过。
- 全量 Vitest **663 例 / 661 通过 / 2 失败**——与 Windows 基线完全同构（`codexAppServerBridge.archive.test.ts` 平台差异），本轮无运行时行为断言新增（提示为纯展示层，手测覆盖）。
- `pnpm run build` 通过（web + CLI）。
- 探针端到端：`probe-turn-page.cjs` **5/5 fact PASS**、`probe-resume-turn-page.cjs` **7/7 assumption PASS**（2.89MB / 27 轮真实线程）。
- 性能审计（代码路径分析， live 测量不可行——本机已无 32MB 线程）：每个加载周期至多一个 `setTimeout`，结束时清除；隐藏态零渲染零布局；无新请求、无缓存、无监听器；提示出现后仅为一个静态 `<p>`。

## 四、改动清单

| 文件 | 改动 |
| --- | --- |
| `scripts/probe-turn-page.cjs` | `model_providers.custom` 占位三条 `-c` 参数 + 注释 |
| `scripts/probe-resume-turn-page.cjs` | 同上 |
| `src/components/content/ThreadConversation.vue` | `showSlowLoadHint` + 计时器（加载/换线程/卸载三重置点）+ 提示行模板与样式 |
| `src/composables/useUiLanguage.ts` | 新增提示文案中英映射 |
| `tests/thread-loading-state/round-103-slow-load-hint-large-thread.md` | 手测文档（新建） |
| `tests/thread-loading-state/index.md`、`tests.md` | 索引登记（35→36） |

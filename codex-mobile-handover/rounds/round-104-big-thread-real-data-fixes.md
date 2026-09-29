# round-104 — 真实 124MB 大线程实测：两枚真 bug（legacy custom 502 + 慢开提示死接线）

日期：2026-09-29。承接 round-103：用户提供了线上服务器导出的真实大线程 rollout（`rollout-2026-09-23T18-28-07-01a0cdce-….jsonl`，**124MB / 52,763 行 / 173 轮**，2026-09-23 由 lighthouse 服务器 0.156.1 创建），拷入本机 `CODEX_HOME/sessions/2026/09/23/` 做全链路实测。round-103 的两条结论都被修正/加深。

## 一、实测数据（直连 app-server，0.158.0，Windows）

| 测量项 | 结果 |
| --- | --- |
| A. 首触 `thread/resume`（全量水合） | **8.0s / 26.16MB** / 173 turns |
| B. 同进程二次 resume | 5.8s / 26.16MB |
| C. 新进程三次 resume | 6.2s / 26.16MB |
| `thread/read {includeTurns:false}` | **2ms / 0.00MB** |
| `turns/list {10000, notLoaded, desc}` | **1ms**；**首页最多 100 id（服务端页上限，无视 limit=10000）** |
| `turns/list` 游标走全（nextCursor 链） | 2 页 / **173 个唯一 id / 0 重复** / 全程 31ms |

**结论：**

1. **round-101 的「32MB ~280s 一次性迁移」没有复现**：124MB（4 倍体积）首触仅 8s，且二/三次触达同量级——不存在昂贵的持久化迁移步。280s 归因于当时环境（旧 CLI/冷盘/杀软扫描），不是协议固有成本。round-103 的提示降级为纯安全网（见下，它确实还会被触发——只是阈值意义变了：~6–8s 的常态水合 > 5s 阈值）。
2. **全量水合 payload 26.16MB** 是真正的规模风险——`thread/read {includeTurns:false}` 2ms vs 8s/26MB，有界路径的价值在大线程上被定量证实。
3. **新协议事实：`turns/list` 服务端页上限 100**。round-86 桥的 `TURN_ID_PAGE_LIMIT = 10_000` 假设「一次拿全」不成立，但 `nextCursor` 链式翻页（`threadTurnPage.ts` L198-200）恰好兜住：实测 2 页走全 173 id 零重复。**无需改代码**，但 10_000 的名字有误导性（实际语义是「每页上限」，50×10_000 的安全帽注释同理），留作下轮命名清理。

## 二、Bug ①（P0 级）：legacy `custom` 线程在 WebUI 打开必 502

**现象**：浏览器打开该线程，报 `RPC thread/resume failed with HTTP 502: failed to load configuration: Model provider 'custom' not found`。**所有线上服务器创建的旧线程导入本机后都打不开**。

**根因**：rollout 记录 `model_provider="custom"`（旧版 free-mode runtime id；现行是 `custom_endpoint`/`opencode_zen`）。round-103 只给两个探针脚本加了占位注入并推断「线上桥经 freeMode.ts 注入过」——错了：`getFreeModeConfigArgs` 在 free-mode 关闭时返回 `[]`，且启用时也只定义 `custom_endpoint`/`opencode_zen`，从不定义 `custom`。桥层对旧线程零覆盖。

**修复（`freeMode.ts` `getProviderCompatibilityConfigArgs`）**：在 spawn app-server 时**无条件**追加 inert 的 `model_providers.custom` 定义（name/base_url/wire_api 三条 `-c`），与既有 `opencode_zen` 兼容注册同款思路（只为读取注册、不选为活跃 provider）。base_url 指向死端口 `127.0.0.1:9`——**ponytail 注释了天花板**：历史读取恢复，但在 legacy 线程里**发送新消息**仍会打到死端点；升级路径是 free-mode custom 启用时把 base_url 指到 live custom proxy。

**验证**：`freeMode.test.ts` 新增断言（+1 例）；RPC 直调 `thread/resume` 200（4.6s）；浏览器端到端完整渲染 173 轮。

## 三、Bug ②：round-103 慢开提示接在死信号上（本轮端到端实测揭穿）

**现象**：直连探针、RPC、浏览器三路都确认打开耗时 >5s，但提示**从未出现**；`Loading messages...` 节点在整个打开期间也从未出现。

**根因**：所有线程打开路径（`useDesktopState.ts` 选择线程、hash 路由等）调 `loadMessages` 时全部 `silent: true` → `shouldShowLoading=false` → `isLoadingMessages` 首开时**恒为 false** → round-103 在 `ThreadConversation` 里基于 `props.isLoading` 的计时器永远不起表。纯单测/类型检查发现不了，真数据端到端一测就穿。

**修复（信号源上移）**：

- `useDesktopMessageHistoryLoading.ts`：`SLOW_OPEN_HINT_DELAY_MS = 5000` + `slowOpenThreadId` ref + 计时器——`loadMessages` 网络工作真正开始时起表（无论 silent），完成即清（以 pending threadId 判归属，换线程重新计时、旧 finally 不误清新计时）。
- `useDesktopState.ts` → `App.vue` → `ThreadConversation` 新 prop `isSlowOpen`（`slowOpenThreadId === composerThreadContextId`）。
- `ThreadConversation.vue`：**删除**内部计时器与三处重置点（死代码），提示行 v-if 改为 `isSlowOpen`。样式与双语文案不变。

## 四、端到端验证（Playwright，冷启动 dev + 冷 app-server）

- 修复 Bug ① 前后各一轮浏览器实测：修复前 502 错误横幅；修复后 173 轮完整渲染，顶部「Load earlier messages」有界入口、63% 上下文计量正常。
- 慢开提示：**11.05s 出现（DOM 断言 `.conversation-loading-slow`）、13.36s 随消息渲染完成消失**，出现/消失时序与设计一致（首开 resume 2.1s + thread/read 6.9s）。
- `vue-tsc --noEmit` 通过；全量 Vitest **664 例 / 662 通过 / 2 失败**（同 Windows 基线的 archive 平台差异）；`pnpm run build` 通过。
- 性能审计：计时器从组件挪到 composable，数量不变（每加载周期至多 1 个 `setTimeout`，finally 清除）；新增 prop 为布尔比较，零请求零缓存。

## 五、运维注意（本轮两次踩坑）

**Vite 的 `server restarted` 热重启不等于服务端模块生效**：改 `src/server/**`（freeMode.ts）后日志显示 restarted，但运行中的 bridge/app-server 仍持旧参数（进程命令行可证）——必须**整个杀掉 dev 进程冷启动**。诊断手法：`Get-CimInstance Win32_Process | ? CommandLine -match 'app-server'` 看 live spawn 参数。

## 六、改动清单

| 文件 | 改动 |
| --- | --- |
| `src/server/freeMode.ts` | `getProviderCompatibilityConfigArgs` 增加 legacy `custom` provider 占位（含 ponytail 天花板注释） |
| `src/server/freeMode.test.ts` | 新增 legacy custom 注册断言 |
| `src/composables/useDesktopMessageHistoryLoading.ts` | `slowOpenThreadId` + 5s 计时器（silent 打开也计时），导出 |
| `src/composables/useDesktopState.ts` | 透传 `slowOpenThreadId` |
| `src/App.vue` | 解构 + `:is-slow-open` prop |
| `src/components/content/ThreadConversation.vue` | 删内部计时器，提示行改 `isSlowOpen` 驱动 |
| `tests/thread-loading-state/round-103-slow-load-hint-large-thread.md` | 手测文档重写（round-104 接线 + 冷启动前置） |
| `tmp/first-touch-timing.cjs`、`tmp/turns-list-paging.cjs`、`tmp/verify-slow-load-hint.cjs` | 本轮实测脚本（保留复用） |

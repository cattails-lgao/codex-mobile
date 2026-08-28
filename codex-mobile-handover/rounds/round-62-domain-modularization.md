# Round-62：前端领域模块化续期（2026-08-28）

> **背景：** round-48/49 只完成 Vue 视图组件化，`useDesktopState.ts` 等逻辑中枢需按领域另行拆分。本轮在同步最新 `main` 后重新开启该工作，以公开契约、持久化键、请求顺序和消息时序不变为前提，连续完成低风险领域边界；不把 live turn/message/realtime 高风险链路混入本轮。

## 本轮范围

本轮包含 `3ab0020` 至 `501179c` 共 9 个代码提交：

| 提交 | 内容 |
| --- | --- |
| `3ab0020` | 提取 model/provider/reasoning preferences，包含 High 手动覆盖、speed mode 与模型元数据刷新 |
| `d05088c` | 提取线程/provider context key、规范化与裁剪工具 |
| `ae1d18d` | 提取 collaboration preferences |
| `27a8ee3` | 为 Settings Accounts、右侧栏、审批和 Queue 等低频表面增加异步边界 |
| `b8932ea` | 将完整 Settings 对话框提取为异步组件 |
| `343fc14` | 提取 rate-limit 状态、并发刷新与 500 ms 防抖 |
| `a2ebff3` | 提取项目显示名、顺序、置顶、改名、移除及 workspace-roots 持久化 |
| `358f0f7` | 提取 Skills / Hooks catalogs、cwd 缓存与 in-flight 请求 |
| `501179c` | 提取服务端 Queue 镜像、自动压缩暂存、阈值持久化与列表操作 |

详细的逐批依赖、测试和性能数据见 [热点领域模块化方案](../sections/domain-modularization-plan.md)。

## 边界与结果

- `useDesktopState.ts` 从本轮对齐基线约 4,766 行降至 3,927 行。主文件继续负责线程加载、消息历史、turn 生命周期、realtime 通知和发送/压缩编排；新模块只通过窄依赖和 action 接入。
- `App.vue` 的低频表面形成真实异步 chunk；完整 Settings 迁至 `src/components/settings/SettingsDialog.vue`。主 JS 曾从对齐基线 `609.25 kB` 降至 `549.71 kB`，后续静态领域模块加入测试边界后最新为 `551.90 kB`（gzip `171.28 kB`）。
- `useDesktopState` 对 `App.vue` 的公开 refs/actions、localStorage key、RPC 参数与用户可见行为保持不变。
- 用户此前关注的 `>500 kB` chunk 警告仍存在。没有调高阈值，也没有把首屏线程树、Composer 或状态中枢强行异步化来只消除数字。

## 验证

- `pnpm exec vue-tsc --noEmit`：通过。
- `pnpm run build`：通过，前端 313 modules；CLI `dist-cli/index.js` 633.48 KB。
- 最新定向测试：`useDesktopQueueState.test.ts` + `useDesktopState.test.ts`，95/95 通过。
- 全量测试：424/426 通过。两个失败均为未改动 Bridge 测试的既有 Windows 差异：symlink 创建 `EPERM`；POSIX `0600` 在 Windows 读取为 `0666`。
- 本轮最后两批没有新增 UI 行为，未执行新的 Playwright；Settings 异步批已在 4173 实页验证四个分组及浅色/深色表面。

## 性能审计

- Preferences、Rate limits、Catalogs 与 Queue 的请求入口、顺序、缓存和失败保留语义保持不变。
- Queue 启动仍最多一次 GET；相关 turn 事件仍为一次立即 GET 加一次 650 ms 跟进 GET；同线程重叠请求继续由 in-flight guard 抑制。
- 没有新增 watcher、后台轮询、阻塞 I/O、无界 fanout 或大 payload。静态领域模块不是 code-splitting 手段，主 chunk 小幅变化属模块边界开销。

## 下一步

下一批进入风险更高的 Thread loading / message history 领域。开始前应重新盘点 `loadThreads`、`loadMessages`、分页缓存、foreground resume 与通知驱动同步的共享状态，先提取读请求/缓存所有权，不同时改动 live turn、最终总结归属或 realtime 时序。随后再单独评估 turn lifecycle / realtime。

## 交接注意事项

- 不要为了继续降行数直接搬运闭包函数；先确认领域拥有的 refs、请求缓存和唯一写入口，再用窄依赖接线。
- High reasoning、子 agent 过滤、最终总结归属均是历史高风险路径。后续线程加载拆分不得顺带改其行为，除非另起修复批并提供针对性回归。
- 当前完整构建仍会报告 `>500 kB` 主 chunk 警告，这是已记录的剩余首屏结构，不应通过提高 warning limit 掩盖。

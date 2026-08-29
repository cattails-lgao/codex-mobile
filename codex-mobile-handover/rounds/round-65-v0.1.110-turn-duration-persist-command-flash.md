# Round-65：v0.1.110 发布（每轮耗时徽标 + 服务端 sidecar 持久化 / 命令块闪烁修复）

> **范围：** 收录两处改动，随 v0.1.110 一起发布。GitHub Release 与 git tag 由维护者（agent）创建，npm publish 由用户执行。`vue-tsc` 通过、`pnpm run build` 通过（web + CLI）。

## 本轮提交

| 提交 | 内容 |
| --- | --- |
| `0701899` | ①每轮耗时显示位置调整：从对话底部 `Worked for …` 段落改为「本轮过程」标题旁的胶囊徽标（`ThreadTurn.vue`，`conversation-turn-time` 样式）；②刷新/换浏览器不再丢失：新增服务端 sidecar 持久化——`threadPreferencesRoutes.ts` 新增 `GET/PUT /codex-api/thread-turn-durations` 读写 `~/.codex/.codex-global-state.json` 的 `thread-turn-durations`（每线程上限 200 轮），`misc.ts` 新增 `getThreadTurnDurationArchive`/`persistThreadTurnDuration`，`useDesktopStatePersistence.ts` localStorage 镜像 + 桥接层同步，`useDesktopState.ts` 轮次完成时 `rememberTurnDuration` 记录、启动 `loadThreadTurnDurationsIfNeeded` 加载并合并进消息流；`ThreadConversation.vue` 过程区过滤 `worked` 行避免重复显示；新增 `insertPersistedTurnDurations` 单测 |
| `f519842` | ②命令块闪烁修复：新命令执行到达瞬间会自动展开露出黑色输出区、随后旁白文本到达把条件翻转又收起，导致消息列表每次新命令「先弹出黑色块再缩回」闪烁。`useCommandExecutionDisplay.ts` 移除命令自动展开（保持紧凑行 + 序号 + 命令 + 运行中状态），手动点击仍可展开/收起；同步删除已无用的 `collapsedAutoCommandIds` 自动收起状态与 watch；更新单测与手测文档 |

## 改动要点

1. **每轮耗时徽标**：`ThreadTurn.vue` 把 `durationMs` 胶囊徽标（`3分25秒` 格式，`conversation-turn-time`）内联到「本轮过程」标题按钮旁（展开/收起状态都显示），原对话底部 `Worked for …` 段落移除；暗色模式 `bg-zinc-800 text-zinc-400`。
2. **耗时持久化（服务端 sidecar）**：
   - 服务端：`threadPreferencesRoutes.ts` 新增 `thread-turn-durations` 路由族——`GET` 返回全量 `Record<threadId, Record<turnId, durationMs>>`，`PUT` 按 `{threadId, turnId, durationMs}` 合并写入；读取时规范化（非法耗时丢弃）、每线程滚动保留最近 200 轮，防无限增长。
   - 客户端 API：`misc.ts` `getThreadTurnDurationArchive`（启动拉全量）/`persistThreadTurnDuration`（单轮写入，best-effort）。
   - 状态层：`useDesktopState.ts` `persistedTurnDurationsByThreadId` 响应式 + `rememberTurnDuration` 在 turn 完成时记录并 `savePersistedTurnDurationMap` 双写（localStorage `codex-web-local.thread-turn-durations.v1` + sidecar 镜像）；`messages` computed 末尾 `insertPersistedTurnDurations` 把无对应 `worked` 消息的持久化耗时补成徽标（live 摘要已插入的轮次跳过，避免重复）。
3. **命令块不自动展开**：`useCommandExecutionDisplay.ts` 移除「新命令自动展开」逻辑，命令到达保持紧凑；删除自动收起 override 集合 `collapsedAutoCommandIds` 与其 watch。列表不再闪烁。

## 验证

- 定向 Vitest：`turnDurations.test.ts` 6/6、`useCommandExecutionDisplay.test.ts` 7/7 通过；`useDesktopState.test.ts` 89/89 通过。
- `pnpm exec vue-tsc --noEmit`：通过。
- `pnpm run build`：通过（web + CLI）。
- 手动验证：dev server 4173 重启后 `GET /codex-api/thread-turn-durations` 返回 200；发一轮对话后耗时为「本轮过程」标题旁胶囊徽标，刷新页面（跨浏览器）后仍在；新命令出现为紧凑行、不再闪黑色块。

## 发布状态

- 版本 bump → 提交已推送至 `origin/main`；tag `v0.1.110` 指向该提交。
- GitHub Release `v0.1.110`：https://github.com/cattails-lgao/codex-mobile/releases/tag/v0.1.110
- `codex-mobile-re@0.1.110`：由用户 publish 至 npm 官方源并成为 `latest`（`npm view codex-mobile-re dist-tags.latest` 验证）。

## 交接注意事项

- `thread-turn-durations` 落在 `~/.codex/.codex-global-state.json`（与线程偏好同文件）；每线程上限 200 轮滚动裁剪，超过只保留最近 200 轮。
- 耗时徽标优先级：live turn 摘要（进程内 `turnSummaryByThreadId`）> 持久化数据；`insertPersistedTurnDurations` 只在消息流无该 turn 的 `worked` 消息时补徽标，避免重复。
- 命令块默认不自动展开，手动点击标题可展开/收起；不要重新引入自动展开，否则命令闪烁回归。

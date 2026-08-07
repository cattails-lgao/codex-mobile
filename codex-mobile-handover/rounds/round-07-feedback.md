# 第四轮反馈（2026-08-05 提出）

> **2026-08-05 第四轮进展：** 3 条需求已全部实现并验证（vue-tsc / build / 单测 / Playwright 布局断言），本轮改动已 commit 并推送。涉及 `ThreadComposer.vue`、`ComposerSlashMenu.vue`、`slashCommands.ts`、`useUiLanguage.ts`、`style.css`、`App.vue`、`codexGateway.ts`、`types/codex.ts`。

1. **斜杠技能行布局：左侧图标（区分用户/系统）+ 右侧名称（完整）+ 描述（可省略）**：`SlashCommand` 增加 `scope` 字段；`buildSkillSlashCommands` 带出 `scope`；`ComposerSlashMenu` 技能行改为左侧圆形 scope 图标（U/R/S/P，按 scope 着色）+ 右侧垂直排列的名称（不截断）与描述，移除右侧 kind 标签；明暗主题样式同步到 `style.css`
2. **composer 输入框下方的按钮移到输入框右侧，暂不需要语音**：`ThreadComposer` 新增 `.thread-composer-main`（纵向）+ `.thread-composer-input-row`（横向：输入框 + 右侧 submit/stop 按钮列）；移除麦克风、实时语音按钮与实时语音气泡；移除实时语音死代码（`useRealtimeVoice` 导入与相关 computed/函数）及 mic/realtime 样式
3. **composer 下方布局：加号、规划模式、审批策略、模型、模型强度；三个 popover 内容调整**：控制行顺序为 加号（attach，popover 含添加图片和文件/添加文件夹/拍照/执行中发送 Steer·Queue，原 Fast/Plan 开关已移除）、规划模式（plan，popover 三选一：Default / Plan mode / Execution plans，ExecPlans 后端不支持时禁用并提示）、审批策略（approval，popover 三选一：When Codex requests it / Unless trusted / Never，点击即保存）、模型、模型强度（不变）；`CollaborationModeKind` 增加 `'execplans'`，`getAvailableCollaborationModes` 过滤逻辑同步放行；三个菜单互斥，点击外部关闭


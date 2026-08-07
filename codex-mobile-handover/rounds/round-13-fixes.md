# 第九轮交接需求（2026-08-06 提出）

> **2026-08-06 第九轮进展：** 4 条需求/问题已全部修复并验证（`vue-tsc --noEmit` 通过、`pnpm run build` 通过、单测 232 通过 + 2 个既有 Windows 环境性失败与改动无关、Playwright UI 断言 4/4 通过），本轮改动尚未提交/推送（待本次交接文档更新后一并提交）。涉及 `ThreadComposer.vue`、`scripts/dev.cjs`、`src/server/appServerRuntimeConfig.ts`、`src/composables/useDesktopState.ts`，并新增手动测试文档 `tests/chat-composer-rendering/composer-policy-buttons-approval-effort-rollback-interrupt.md`。

1. **规划模式和审批策略选中什么按钮应该显示什么**：`ThreadComposer.vue` 新增 `planModeTriggerLabel` / `approvalPolicyTriggerLabel` computed：按钮文本不再固定显示「Plan mode / Approval policy」，改为显示当前选中项（Default / Plan mode / Execution plans；When Codex requests it / Unless trusted / Never），跟随 i18n 中文；Playwright 实测切换后按钮文本同步变化
2. **审批策略为除非信任时没有弹窗确认**：根因两层：①`scripts/dev.cjs` 启动 Vite 时强制注入 `CODEXUI_APPROVAL_POLICY='never'`，该 env 在读取与 app-server 启动参数中都优先于 config.toml，前端保存的策略永不生效；改为仅当外部显式设置时才保留该变量。②`appServerRuntimeConfig.ts` 的启动参数解析改为 env 优先、回退 `CODEX_HOME/config.toml`（无文件时默认 never）；保存策略后 config.toml 变化触发 app-server 自动重启（`disposeIfConfigChanged`）。验证：POST `untrusted` 后 app-server 进程实际以 `-c "approval_policy=\"untrusted\""` 重启运行；`config.toml` 中 `codex-mobile` 目录被标记 `trusted`，除非信任策略下信任目录命令自动执行不弹窗属正常语义，需在非信任目录/命令下验证弹窗
3. **模型强度默认值应为 Medium**：`useDesktopState.ts` `pickReasoningEffortForModel` 在无显式选择时优先 `medium`（若模型支持），不再直接取模型元数据的 `defaultReasoningEffort` 或第一个选项；Playwright 实测 Thinking 下拉默认显示 `Medium`
4. **thinking 时点击编辑消息确认后当前会话没有停止**：`useDesktopState.ts` `rollbackSelectedThread` 在回滚前先检查线程是否 in-progress，是则先调用 `interruptSelectedThreadTurn()` 停止当前 turn（中断后重新读取持久化消息再做回滚），避免编辑与新生成内容竞态丢失；新增 2 个单测锁定（in-progress 先中断、空闲直接回滚）

> **验证说明：** 问题 1/3 经 Playwright 实测（切换按钮文本、Thinking 默认 Medium）；问题 2 经 HTTP 层实测（GET/POST `/codex-api/approval-policy`、app-server 进程启动参数含新策略、config.toml 幂等写入）；问题 4 依赖单测（回滚前先 interrupt）与 vue-tsc/构建覆盖。遗留：问题 2 的真实命令弹窗需在非信任目录下人工验证；模型强度默认 Medium 仅当模型支持 Medium 时生效，否则回退模型默认值。


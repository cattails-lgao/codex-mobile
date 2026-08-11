# Round-36：回退后再次发送，被回退消息"复活"（2026-08-11）

> **背景：** 用户反馈：消息列表中点击回退按钮，回退虽然成功，但再次发送消息时，之前被回退的消息还在。

## 根因

**回退按钮仍残留上游「编辑」流程的输入框回填行为。** 本 fork 的 round-21 已把用户消息下的「编辑」按钮改为「回退」按钮（`MessageToolbar.vue` 的 `.message-rollback-button`，语义为「回退到该轮？后续回复将被移除」），但 `App.vue` 的 `onRollback` 仍保留了上游 commit `c8e51cc`（"Restore legacy request cards and append rollback text to draft"）的 `appendTextToDraft(rollbackUserMessage.text)`：

- 点击回退 → 确认后，线程回退成功，**同时被回退的用户消息文本被自动回填进输入框**；
- 用户随后按发送 → 同一文本再次作为新 turn 发出 → 表现为「之前回退的消息还在」。

## 复现与排除

- RPC 层实测（opencode_zen / codex-cli 0.147.0）：`thread/rollback` → `thread/read` / `thread/resume` / `turn/start` 全链路服务端状态正确，被回退的 turn 不会重新物化（含 30s 桥接 turn-page 缓存、live-state 缓存均正确失效）。
- 浏览器实测（Playwright + Edge）：回退确认后 composer 被预填 `"Please reply with: message after rollback"`（被回退消息全文）→ 复现用户现象。
- 修复后复测：回退确认后 composer 保持为空。

## 修复（`App.vue` + `ThreadComposer.vue`）

- `App.vue` `onRollback`：删除 `appendTextToDraft` 回填逻辑，只保留 `rollbackSelectedThread(turnId)`（纯回退语义）。
- `ThreadComposer.vue`：删除随之失去调用的 `appendTextToDraft` 死代码（函数定义 + `ThreadComposerExposed` 类型 + `defineExpose` 条目）。
- `tests/git-worktrees-rollback/rollback-no-longer-fills-composer-input.md`：替换旧文档 `rollback-appends-rolled-back-user-text-into-composer-input.md`（记录的是 bug 行为），`index.md` 同步更新。

## 验证

- `vue-tsc --noEmit` 通过；`pnpm run test:unit`：340 通过 + 2 环境性失败（`codexAppServerBridge.archive.test.ts` 的 POSIX 文件权限断言，Windows 基线已知失败，与本次改动无关）；`useDesktopState.test.ts` 79 用例全过。
- Playwright 实测（真实线程，HMR 生效后）：回退确认后 composer 为空；回退仍正常移除对应 turn。

## 涉及文件与提交

- `src/App.vue`（`onRollback` 去除回填）
- `src/components/content/ThreadComposer.vue`（删除死代码 `appendTextToDraft`）
- `tests/git-worktrees-rollback/rollback-no-longer-fills-composer-input.md` + `tests/git-worktrees-rollback/index.md`
- `codex-mobile-handover/rounds/round-36-feedback.md`（本文档）
- 提交：待提交

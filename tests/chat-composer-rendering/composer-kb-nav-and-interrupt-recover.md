# Composer popover 键盘导航 + 中断回填（需求 9 UI 优化）

2026-08-07 遗留项补齐：①plan/approval（及 attach）popover 键盘导航——打开时焦点移入面板，↑/↓ 循环移动焦点、Home/End 首末、Enter/Space 原生触发选择、Esc 关闭；②需求 9 UI 优化——中断一个「尚未产出任何 agent 输出」的 turn 后，服务端整体移除该 turn（含用户消息），前端检测后把未提交文本回填输入框并显示提示条，避免用户以为消息丢失。对应交接文档《遗留项补齐（2026-08-07）》。

## Prerequisites

- dev server 运行在 `127.0.0.1:4173`（TRAE 沙箱内需 `CODEX_HOME` 指向项目内 `.codex/`）
- Playwright（本机 Edge channel）用于 DOM 断言；回归脚本留存于 `output/playwright/r19-kbnav-interrupt-check.cjs`，截图 `r19-*.png`

## 1. 改动清单

| 文件 | 内容 |
|---|---|
| `src/components/content/ComposerPopover.vue` | 打开时 `watch(isOpen)` + `nextTick` 把焦点移入面板（`tabindex="-1"`）；panel `@keydown`：↑/↓ 在可见可点击 `button` 间循环移动焦点、Home/End 首末、Esc emit `update:open false`；`button:focus-visible` 蓝色 outline |
| `src/composables/useDesktopState.ts` | `interruptSelectedThreadTurn` 中断前按服务端语义判定被中断 turn 是否无 agent 输出（agentMessage/commandExecution/toolCall/worked/fileChange/plan/plan.live/compaction.done/turnError 任一存在即有输出，reasoning/live 不算）；判定成立则中断成功后存 `InterruptRecoverPayload`（text/images/fileAttachments/skills）到 `interruptedUnsubmittedByThreadId`；新增 `interruptedUnsubmittedMessage` computed、`clearInterruptedUnsubmittedMessage`；随 `pruneThreadStateMap` 清理 |
| `src/App.vue` | watch `interruptedUnsubmittedMessage`：有文本则 `threadComposerRef.hydrateDraft` 回填 + 显示 `.interrupt-recovered-banner`（sky 色，6s 自动消失 + 手动关闭按钮），一次性消费后 `clearInterruptedUnsubmittedMessage` |
| `src/composables/useUiLanguage.ts` | 新增 2 个 key：Stopped: message not submitted, restored to input. / Stopped: message not submitted. |
| `src/style.css` | `.interrupt-recovered-banner` / `.interrupt-recovered-dismiss` 暗色覆盖 |

## 2. 验证步骤

### 2.1 静态检查

```powershell
pnpm exec vue-tsc --noEmit   # 通过
pnpm exec vitest run         # 304 通过（2 个既有 Windows 环境性失败与本次无关）
pnpm run build               # vite build + tsup 通过
```

### 2.2 键盘导航（`r19-kbnav-interrupt-check.cjs`）

1. 打开 mock 线程（idle），点击 `.thread-composer-plan-trigger` → popover 打开（焦点已移入面板）
2. `ArrowDown` → 第一个 `.thread-composer-menu-item` 获得焦点；再 `ArrowDown` → 第二个（Plan mode）；`Enter` → 选择生效、popover 关闭、trigger 文本更新（Default→Plan mode）
3. 重新打开 → `Escape` → popover 关闭
4. 打开 `.thread-composer-approval-trigger` → `ArrowUp` 回绕到最后一项（Never）；`Escape` 关闭

### 2.3 中断回填（mock in-progress 线程，turn 仅含 user 消息）

1. RPC 拦截：`thread/list` 与 `thread/read` 返回 in-progress 线程（turn `status: 'inProgress'`，仅 1 条 user 消息）；`turn/interrupt` 返回成功并切换后续 `thread/read` 返回空 turns
2. 打开线程 → 停止按钮 `.thread-composer-stop` 出现 → 点击
3. 断言 `.interrupt-recovered-banner` 出现（文本含 "not submitted"/「未提交」）
4. 断言 `.thread-composer-input` 值 = 原用户消息文本（回填成功）
5. 点击 `.interrupt-recovered-dismiss` → 提示条关闭

## 3. 回滚 / 清理

- 回填载荷为一次性消费（`clearInterruptedUnsubmittedMessage` 消费即清），无持久化状态
- mock 线程仅存在于 RPC 拦截层，不落库；脚本退出即清理
- 删除本功能 = 移除 `ComposerPopover.vue` 的 panel keydown/focus 逻辑、`useDesktopState` 的中断判定与 `interruptedUnsubmittedByThreadId`、`App.vue` 的 watch 与 banner、`style.css` 暗色块

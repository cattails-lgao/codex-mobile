# round-169 · 批 4 后半：内联编辑框 + 编辑重发（turnTrigger）

> 用户指令「继续批 4 下一轮」。承接 round-168（批 4 #1/#3），本轮落地 #4（编辑入口升级为原地内联编辑框）+ #2（编辑重发带 `turnTrigger: 'edit_user_message'`）。提交 `<(见 git log)>`。

## 一、改动清单

1. **协议层** `src/api/gateway/threads.ts`：`startThreadTurn` 增第 9 参 `turnTrigger?: string`。schema 确认 `turn/start.turnTrigger` 是「发起方分类」自由字符串（`string|null`，steering 场景被忽略）；仅在有值时 `params.turnTrigger = trimmed`，普通发送保持净载荷（不带该键）。
2. **状态层** `useDesktopState.ts`：`sendMessageToSelectedThread` / `startTurnForThread` 增 `turnTrigger` 穿参。queue / steer 分支不带——编辑重发发生在 revert 后线程空闲，恒走 `startThreadTurn` 正常路径；模型 fallback 重试同样携带。**参数个数敏感坑**：恒传第 9 参 `undefined` 会打破 3 个既有 `toHaveBeenCalledWith` 断言（Vitest 严格比对参数个数）⇒ 改条件展开 `...(turnTrigger ? [turnTrigger] : [])`。
3. **组件层** `ThreadConversation.vue`：编辑入口从「确认框 + 回退 + 回填草稿」升级为**原地内联编辑框**——`editingMessage` 单编辑态（同一时刻最多一条）、textarea 预填原文、Save/Cancel + Esc 关闭、watch + nextTick 聚焦置尾；**文本未改动保存 = no-op**（零 RPC）；`PendingEditConfirm` 确认框分支删除（`pendingConfirm` 只剩 file-change）。新 i18n 键 `Saving rolls this turn back and resends it with your changes. Later replies will be removed.`；死键清理：`Rollback this message` / `Rollback this turn?` / `This rolls the thread back…`（MessageToolbar 按钮 title/aria 改 `Edit this message`，键原已存在）。样式全部走既有 token（s/ink/line-focus；主按钮用 `bg-s-inv`/`text-ink-inv` 反色模式——主题**无 accent token**，规则「颜色只表示状态」）。
4. **编排层** `App.vue`：`onEditMessageResend({ turnId, text })` = `await rollbackSelectedThread(turnId)`（完整清理链：interrupt → revert → 文件回退 → thinking 存档成对清 → syncFromNotifications）→ 守卫（`rollbackSelectedThread` 吞错 ⇒ 用「回退后目标轮仍在列表 ⇒ 不重发」判定失败；round-141 本地对齐路径会把目标轮剔出列表，重发照常）→ `sendMessageToSelectedThread(text, …, 'edit_user_message')`。

## 二、验证

- 单测 **1053/1053**（92 文件；基线 1050/91 + `threads.turnTrigger.test.ts` 3 例：传值上车 / 不传无键 / 空白无键）；vue-tsc 0；vite build + tsup 过。
- 运行时探针 `tmp/r169-edit-probe.cjs` **8/8**（真实桥 4190 + 拦截 RPC，fixture 3 轮）：
  S1 保存 ⇒ 编辑器预填原文、`thread/revert{beforeTurnId:t2}` 先于 `turn/start`、`turnTrigger='edit_user_message'`、input 含新文本、编辑器关闭（5 断言）；S2 取消 ⇒ 零 RPC；S3 未改动保存 ⇒ 零 RPC。
  探针注意：`thread/turns/list` 同时服务 round-141 的 missing 预检与 revert 水合 ⇒ 拦截器按 `state.reverted` 动态返回（回退前全量、回退后截断）。⚠️ 坑复踩：**同文档 hash goto 不重载文档** ⇒ 每场景 goto 带会变的查询串。
- 全闸门：uic 59 / fonts 13 / an 56 / media 44 / theme 15 / hot 6 / bl 4。

## 三、边界与备注

- 可编辑集合保持我方既有口径（**所有**带 turnId 且有文本的用户消息），比桌面端「硬 assert 仅限最新一条」宽：revert 截断到该轮前、编辑后的文本成为最新轮，截断语义对任意轮一致；老轮次编辑 = 「截断到彼时 + 重发」。
- 探针非 CI 资产（`tmp/`）；`turnTrigger` 的消费方在上游服务端（列表来源区分），桥端零改动 ⇒ 未 bump `SHARED_BRIDGE_VERSION`。
- 批 4 四项至此**全部落地**（#1/#3 round-168、#2/#4 round-169）。

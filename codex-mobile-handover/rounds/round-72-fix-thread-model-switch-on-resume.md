# round-72：修复线程模型切换后 resume 被服务端旧模型覆盖（v0.1.117）

## 现象
- 未完成线程在 UI 上把模型从已下线/删除的旧模型（如 `deepseek-v4.1-flash-expires-on-0910`）切成可用新模型（先 `deepseek-v4-flash-command-code` 再 `gpt-5.6-terra`）后，紧接着发出请求的请求体里仍是旧模型 ID，全部被 LiteLLM 400 拒绝。
- 界面「线程设置已切换」并未真正改变该线程恢复后发消息所用模型；线程历史保留的旧模型 ID 被继续拿去请求。

## 根因
`startTurnForThread` 对「本会话尚未 resume 过的线程」发首个 turn 前，会 `await resumeThread(threadId)`，然后**无条件**用服务端线程持久化的 `model` 覆盖 UI 选择：

```ts
if (resumedThread.model) {
  setThreadModelId(threadId, resolveThreadModelForProvider(threadId, resumedThread.model, resumedThread.modelProvider))
}
```

时序还原：
1. UI 切到 `gpt-5.6-terra` → `setSelectedModelIdForThread(threadId, gpt)` 写入 `selectedModelIdByContext[threadId]`（键即线程 id，与发送读取的键一致，UI 写入本身没问题）。
2. 该线程首个 turn，`resumedThreadById[threadId] !== true` → 触发 `resumeThread`。
3. `resume` 返回服务端线程当初建线程时持久化的旧模型 `deepseek-v4.1-flash-expires-on-0910`。
4. `setThreadModelId(threadId, deepseek-...)` **覆盖掉 gpt**。
5. `readModelIdForThread(threadId)` 读回旧模型 → 请求体带旧模型 → 400。

## 修复
新增判别 `hasThreadModelSelection(threadId)`（`src/composables/useDesktopModelPreferences.ts`）：仅当该线程上下文已有**显式**选择（写入线程自身键，非新线程兜底）才为真。在 resume 覆盖前加门控（`src/composables/useDesktopState.ts` `startTurnForThread`）：

```ts
const existingThreadModel = hasThreadModelSelection(threadId)
const resumedThread = await resumeThread(threadId)
if (resumedThread.model && !existingThreadModel) {
  setThreadModelId(threadId, resolveThreadModelForProvider(threadId, resumedThread.model, resumedThread.modelProvider))
}
```

- 线程有显式 UI 选择 → resume 不再覆盖，用 UI 型号发请求。
- 线程从未显式选过 → 仍用 resume 的服务器 model 初始化（保持原有兜底，无回归）。

## 涉及文件
- `src/composables/useDesktopModelPreferences.ts`：新增 `hasThreadModelSelection` 并导出。
- `src/composables/useDesktopState.ts`：`startTurnForThread` resume 覆盖加门控。
- `src/composables/useDesktopModelPreferences.test.ts`：新增回归测试 4 例。
- `tests/providers-models/thread-model-switch-persists-on-resume.md` + `tests/providers-models/index.md`：手测文档。

## 变更范围与约束
- 仅触碰 `startTurnForThread` 的 resume 分支与其判别点；新线程、fork、fallback（`retryPendingTurnWithFallback`）路径不变。
- 高推理/过滤/摘要路径不受影响。

## 验证
- `useDesktopModelPreferences.test.ts` 4/4 通过。
- `useDesktopState.test.ts` 93 通过、`useDesktopStateContext.test.ts` 通过。
- `vue-tsc --noEmit` 无错误。
- 手测步骤见 `tests/providers-models/thread-model-switch-persists-on-resume.md`（请在本地 dev 4173 验证后放行发布）。

## 发布
- 版本 `0.1.116 → 0.1.117`。git tag `v0.1.117` 与 GitHub Release 由维护者创建；`codex-mobile-re@0.1.117` 由用户 publish 至 npm 官方源完成闭环。
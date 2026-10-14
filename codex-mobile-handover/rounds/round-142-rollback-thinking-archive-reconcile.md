# Round-142：回退后「思考块又回来」——思考存档侧对账（2026-10-14）

> **背景：** round-141 之后用户报 **「回退成功了，那一轮消息也从消息列表移除了，但是刷新后那个回退的消息还在消息列表」**（线程 `01a13083-68df-7650-b4a5-5e5c8f436d06`），
> 并补上决定性线索：**「我是在 Thinking 的时候点击了停止，进行了回退」**。
>
> 基线：`1a903dca`（round-141 末次提交，`package.json` = `0.1.131`）。
>
> **后续（round-143）** 把这条症状真正定位到了**服务端 rollout 页**（用户实测「清空浏览器存储后仍在」）。
> 本轮修的是**另一条通路**（本地 + 桥层镜像的思考存档）。两条通路都保留，**完整修复 = 142 + 143**。

---

## 一、这条通路是什么

1. **Thinking 时点停止** ⇒ 该轮已流出的思考内容被**归档**：`persistedReasoningByThreadId` → localStorage `codex-web-local.thread-reasoning.v1`，
   并**镜像到桥层**（`PUT /codex-api/thread-reasoning`，落 app-server 全局状态文件的 `thread-reasoning` 键，供换浏览器/刷新后恢复——round-23）。
2. **回退成功路径**当时只清了 live（`setLiveAgentMessagesForThread(threadId, [])` + `clearLiveReasoningForThread(threadId)`），**没有**清存档。
3. 刷新后 `mergePersistedReasoning` 把**没有 `turnIndex` 的旧存档**当作「无锚点思考」**兜底追加到列表末尾** ⇒ 那条思考块又出现。

---

## 二、修复（2 处，均在客户端）

| 文件 | 改动 |
| --- | --- |
| `src/composables/useDesktopStateUtils.ts` | `mergePersistedReasoning` 新增 `knownTurnIds`（当前消息流里的 `turnId` 集合）；**无 `turnIndex` 分支**加守卫：**带 `turnId` 而该轮不在消息流里 ⇒ 不追加**。存档条目本身不删，只是不渲染；该轮经分页重新出现时会照常插回 |
| `src/composables/useDesktopState.ts` | `rollbackSelectedThread` **成功路径**新增 `dropPersistedReasoningForRemovedTurns(threadId, removedTurnIds, minRemovedTurnIndex)`：把被移除轮次的思考存档**成对清掉**（与 `interruptSelectedThreadTurn` 里成对清理的做法一致） |

---

## 三、验证

- `vue-tsc --noEmit` **EXIT=0**；全量 Vitest 当时为 **820/820（81 文件）**；`check-ui-contract.cjs` **53/53**。
- 新增用例：`mergePersistedReasoning` 的孤儿守卫用例 + 状态级用例
  `rollbackSelectedThread clears the thinking archive of removed turns`（用 `installTestWindow` 预置存档、`mockReset()` 自包含、显式
  `resumeThread.mockReset().mockResolvedValue(null)`）。
- 产物入口 hash：`index-ClI-fbXf.js`（0.1.131）→ **`index-DU30mGd-.js`**。

**测试教训（已并入总入口的「Vitest 陷阱」）**：`vi.clearAllMocks()` **既不清 `mockResolvedValueOnce` 队列、也不清实现** ⇒
追加在文件末尾的用例会被前面用例的残留桩污染；且 `loadMessages` 走 `resumeThread ?? getThreadDetail`，
残留的非空 resume 桩会让它读到空 messages。⇒ 依赖的 mock 先 `mockReset()` 再设桩。

---

## 四、诚实边界

1. **本轮改动的那条通路在本例中未被观测到有残留。** round-143 的线上取证显示：桥层思考存档里该线程 **0 行**
   （存档里只有另一条线程 `01a009af-…`）⇒ 用户当时看到的残留**来自服务端 rollout 页**，不是本地存档。
   保留本轮的改动是**防御性**的：①回退成功路径确实没清存档，这是客观缺口；②它是「换浏览器/刷新后思考块残留」的唯一解释；
   ③新增的孤儿守卫让「turnId 已不在消息流」的存档一律不渲染——两条修复叠加后，**两条通路都不会再把回退掉的内容送回来**。
2. **未部署**：本轮与 round-143 一起等一次部署（改了 `src/server/**`，必须 `vite build` **+** `tsup`）。

# round-188：编辑器原地化 + 编辑保存 120s 超时兜底 + 思考块同文重复两层去重（补档）

> **本档为补档（2026-11-18 回填）**。本轮工作发生在 2026-10-29（3 个代码提交 + 1 个 bump），当时会话结束**未写轮次文档**，
> 快照停在 round-186 / 0.1.137。补档时按当前检出的代码重新验证并如实记录读数。

## 一、三项改动

### 1.1 编辑保存链路加 120s 超时与 catch 兜底（`6c882a8e`，`src/App.vue`）

round-184 收口了「失败不可见」，但失败**判定**仍依赖异常抛出：`rpcCall` 的 fetch 与 `response.text()` 都没有超时，
`onEditMessageResend` 也没有 catch —— 桥侧 handler 等不到 app-server 回包时（挂死形态，不抛错），
`editSaving` 永远不清 ＝「保存中」卡死；抛错则逸出成 unhandled rejection，失败原因依旧不可见。

修法：`withEditSaveTimeout(promise, message)` 给 `rollbackSelectedThread` 与 `sendMessageToSelectedThread` 两跳
各包一层 120s 上限；超时/抛错统一走 `reportEditFailure`（round-184 的可见失败通道），`finally` 必清 `editSaving`。

### 1.2 编辑器原地化（`20a863ec`，`src/components/content/ThreadConversation.vue`）

点编辑后正文被 textarea **原地取代**（`.message-inline-editor-inplace`，渲染在用户气泡 `.message-card` 内部），
自动聚焦；保存/取消/失败提示收在气泡内；编辑中隐藏该消息工具条防再点 Edit 重置输入。删除原 toolbar 下方的
独立编辑器块 —— 编辑器与消息气泡合体后，交互焦点不再在两个视觉容器之间跳。

### 1.3 思考块同文重复两层去重（`c548bf41`，`useDesktopStateUtils.ts` + `ReasoningBlock.vue`）

自带 summary 的 provider（litellm/deepseek 一类）会让同一轮出现两块「差不多内容」的思考：本地流式存档
（原始增量文本，可能因 summary/text 双增量通道重复拼接）与服务端 reasoning item（干净 summary）互含。
两层修复：

1. `mergePersistedReasoning` 前置去重：同 turnId 内、与干净 summary **互含**（归一化压空白+小写后互相
   `includes`）的本地条目丢弃，保留服务端副本；`<20` 字符不比（防短文本误判），不跨轮。
2. `ReasoningBlock` 渲染去重：summary 与 `message.text` 压空白比对一致时跳过摘要段
   （真·摘要+原始思考不同文时仍两者都渲染）。

### 1.4 bump 0.1.138（`d1df78a9`）

`package.json` 0.1.137 → **0.1.138**，范围 `v0.1.137..d1df78a9`（1.1/1.2/1.3 三笔）。**未发版**：
无 tag、无 Release、npm 上无此版本（截至补档时刻 2026-11-18，npm latest 仍为 0.1.137）。

## 二、验证（补档时实测 2026-11-18）

- `vue-tsc --noEmit` 0 错（在 `d1df78a9` 检出上跑）。
- 全量单测 **1113/1113（101 文件）**——与 round-186 基线持平（本轮三笔提交当时未新增用例）。
- **性能走查**（补档补记）：三笔均为 O(1)/O(n) 局部改动 —— 超时是纯 Promise 包装；原地化是 DOM 结构替换
  （删除一个块、不减反少一层嵌套）；去重在同 turnId 内做互含比对、有 20 字符下限与轮内过滤，量级为
  单轮思考条数 × 服务端条数，实测无热点。无重复请求 / 无新阻塞 / 无缓存失效面变化。

## 三、诚实边界

1. **当时未带用例**（补档补齐一半）：三笔提交均无单测。补档时已为 1.3 的 `mergePersistedReasoning`
   前置去重补一条用例（`2da8dad4`，互含丢弃 / 短文本豁免 / 跨轮豁免三断言）；1.1 的 `withEditSaveTimeout`
   是纯定时器包装、1.2 是纯 UI 结构调整，按「最小检查」约定不再单独立测。
2. **原地化编辑器未做浏览器级验收**：本轮（2026-10-29 会话）无取证记录，补档也未跑浏览器闸门对
   `.message-inline-editor-inplace` 的聚焦/取消路径实测。
3. **0.1.138 未发版**：无 tag / Release / npm 版本。发版流程按既定「stage + approve」走，见交接记忆
   `npm stage publish` → `npm stage approve`。

## 四、提交清单

| 提交 | 内容 |
| --- | --- |
| `6c882a8e` | fix(edit): 编辑保存链路加 120s 超时与 catch 兜底（`src/App.vue` +32/−2） |
| `20a863ec` | feat(edit): 编辑器原地化 —— 用户消息气泡直接变输入框（`ThreadConversation.vue` +52/−34） |
| `c548bf41` | fix(reasoning): 思考块同文重复两层去重（`ReasoningBlock.vue` +11/−2、`useDesktopStateUtils.ts` +31） |
| `d1df78a9` | chore(release): bump 0.1.138（`package.json`） |
| `2da8dad4`（补档） | test(reasoning): 补 1.3 的去重用例（36 行） |

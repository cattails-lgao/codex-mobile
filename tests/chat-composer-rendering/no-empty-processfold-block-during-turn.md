# No empty processFold blocks during a turn

2026-09-08（round-70）。修复「本轮过程中会出现空的 `data-message-type="processFold"` 块、没有内容」。

## 根因

- 折叠分组 `buildProcessFolds` 按「**同轮次**连续命令/工具」成组（跨轮命令各自独立）。
- 命令分组 `groupedCommandsByLatestId` 按「**连续命令**（不区分轮次）」分组，仅保留该连续段最新一条命令，其余命令进入 `hiddenGroupedCommandIds` 被隐藏。
- 当相邻两轮末尾/开头各有命令时（如轮 N 末尾 `cmdA,cmdB`，轮 N+1 开头 `cmdC`），不区分轮次的命令分组以 `cmdC` 为最新命令，`cmdA,cmdB` 全被隐藏；而轮 N 的 `cmdA,cmdB` 又恰好组成了一个折叠 → 折叠两个成员**全部被隐藏**，渲染出一个只有折叠头、无任何成员的**空 `processFold` 块**。

## 改动

- `src/utils/conversationFolds.ts`：新增纯函数 `isProcessFoldEmpty(fold, isHidden)`——所有成员都被上层隐藏（命令分组 / 文件变更摘要）时判为空折叠。
- `src/components/content/ThreadConversation.vue`：新增 `emptyFoldStartIds`，模板 `v-if="isFoldStart(message)"` 追加 `&& !emptyFoldStartIds.has(message.id)`，跳过空折叠的 `<li>` 渲染。其成员内容已在跨轮命令块或文件变更摘要中展示，丢弃空容器不丢数据。

## Prerequisites

- dev server 运行在 `127.0.0.1:4173`。
- 一个多轮、相邻轮末尾/开头各带命令执行的线程（如多次改进同一代码的线程）。

## 验证步骤

1. 打开 App，进入一个多轮多命令的线程。
2. 向下浏览各轮「本轮过程」区域，观察命令折叠条。
3. 关注相邻两轮：轮 N 末尾有 ≥2 条命令、轮 N+1 开头有 ≥1 条命令的场景。

## 期望结果

- 不出现没有任何成员、空荡荡的 `data-message-type="processFold"` 折叠头块。
- 相关命令仍在界面可见（折叠在下一轮的 command 块，或工具在文件变更摘要中）。
- 命令/工具在折叠内正常展示的常规场景不受影响（`isProcessFoldEmpty` 仅在全成员隐藏时生效）。

## 自动化

- `src/utils/conversationFolds.test.ts`：新增 `isProcessFoldEmpty` 两条用例（全隐藏 → true；至少一条可见 → false）。

## 回滚

- 撤销 `ThreadConversation.vue` 的空折叠守卫与 `conversationFolds.ts` 的 `isProcessFoldEmpty` 即可回到旧的（会在上述边界产生空折叠头）行为。
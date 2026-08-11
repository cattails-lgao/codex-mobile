# Round-35：fileChange 行布局右对齐 + 长路径省略（2026-08-11）

> **背景：** round-34 发布后用户反馈两条：① 文件变更块 `data-message-type="fileChange"` 每行的变更数字和撤销按钮应放在**最右边**（round-34 误放到了最左边）；② 文件名过长时没有超出隐藏（省略号）。

## 问题一：变更数字与撤销按钮应放最右边

**根因（round-34 方向相反）：** round-34 将 `.file-change-delta` 与 `.file-change-file-undo-button` 移到行首（badge 之前），但用户要求是行尾（最右），与摘要行 `file-change-summary-status` 的位置一致。

**修复（`FileChangeSummaryBlock.vue`）：** 每行元素顺序调整为 `badge → 路径组（path → arrow → moved path）→ delta → 撤销按钮`；`.file-change-delta` 加回 `ml-auto` 推到行最右，撤销按钮紧贴其右（自身不再带 `ml-auto`）。

## 问题二：文件名过长未省略

**根因：** `.file-change-item` 使用 `flex-wrap`，长路径会折行而不是截断。

**修复（`FileChangeSummaryBlock.vue`）：** `.file-change-item` 去掉 `flex-wrap` 保持单行；新增 `.file-change-path-group`（`flex min-w-0 flex-1`）承接弹性空间；`.file-change-path-button` 加 `truncate`（`text-overflow: ellipsis` + `nowrap` + `overflow: hidden`）+ `min-w-0`。

## 验证

- Playwright DOM 断言（线上 rollout 复现）：亮/暗色下 delta、撤销按钮均在行最右、紧贴路径之后、撤销紧贴 delta（间距 < 12px）；注入超长路径后 `truncates: true`（scrollWidth 1040 > clientWidth 627），行不换行、delta/撤销仍钉最右。
- `vue-tsc --noEmit` 通过；`vite build` 成功。

## 涉及文件与提交

- `src/components/content/FileChangeSummaryBlock.vue`（行布局 + 省略）
- `tests/chat-composer-rendering/round35-file-change-row-right-align-and-long-path-ellipsis.md`（手动测试文档 + 索引登记）
- 提交：`17a92a0`（已推送）

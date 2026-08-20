# 组件化第四期：Composer / Conversation 展示层抽取

2026-08-20。依据 `docs/componentization-plan.md` 第四期目标，将 `ThreadComposer.vue` 与 `ThreadConversation.vue` 中的纯展示层区块迁入独立组件。目标仅减化文件、不改变状态所有权、网络调用、API 契约或用户可见行为。

## 变更清单

**ThreadComposer.vue（2875 行）→ 4 个子组件**（父组件仍持有全部状态与回调）

| 子组件 | 迁出区块 |
|---|---|
| `ThreadComposerPlanPanel.vue` | 计划面板（header + 步骤 popover + Implement 按钮） |
| `ThreadComposerAttachments.vue` | 图片/文件夹/文件/技能附件 chips 与删除事件 |
| `ThreadComposerModelControls.vue` | 模型选择 + 推理努力程度下拉 |
| `ThreadComposerAttachMenu.vue` | 「+」附加菜单（照片/文件/文件夹/拍照 + 进行中发送 + 移动端计划模式/审批策略） |

**ThreadConversation.vue（3452 行）→ 1 个子组件**

| 子组件 | 迁出区块 |
|---|---|
| `MessageInlineContent.vue` | markdown 段落/标题/引用/任务项/表格单元格中重复 6 次的内联片段渲染（text/bold/italic/strike/file/url/code） |

## Prerequisites

- dev server 运行在 `127.0.0.1:4173`；沙箱内 `CODEX_HOME` 指向项目内 `.codex/`，PATH 含 fnm node 与 `AppData\Local\pnpm\bin`
- 历史线程含富文本消息（段落/标题/引用/无序/任务/有序列表/表格/内联代码/文件链接）与一条含计划面板的消息

## 验证步骤

### 1. 静态检查

```powershell
node node_modules/vue-tsc/bin/vue-tsc.js --noEmit -p tsconfig.json   # 通过
node node_modules/vite/bin/vite.js build                              # 通过（既有 chunk 大小警告，非本轮引入）
```

### 2. 富文本消息渲染等价性（MessageInlineContent）

1. 进入含以下内容的线程：
   - 段落含 **加粗**、*斜体*、~~删除线~~、`内联代码`
   - 文件链接 `` `src/foo.ts` `` 与 URL 链接
   - 标题、blockquote、任务列表、有序/无序列表、带表头与多行的表格
2. 逐项断言渲染结构还原：`<strong class="message-bold-text">`、`<em class="message-italic-text">`、`<s class="message-strikethrough-text">`、`<code class="message-inline-code">`、文件/URL 均渲染为 `<a class="message-file-link">`，表格 `th`/`td` 内联片段正确
3. 断言文件链接 `href` 为 `toBrowseUrl(path)`、URL 链接 `href` 为目标 URL，且 `target="_blank"` 保留

### 3. Composer 控件（桌面 + 浅色）

1. 任一线程中点击「+」：弹出附加菜单，含 Add photos & files / Add folder / Take photo / In-progress send(Steer/Queue)
2. 点模型下拉：候选列模型名（`gpt` 前缀显示为 `GPT`），可选择；点推理控件可选低/中/高（受模型支持的 effort 过滤）
3. 选择图片/文件夹/文件/技能后出现对应 chips，点 chips 上的 × 可移除并触发父级移除逻辑

### 4. 移动端（375×812）

1. 打开 Composer「+」菜单：额外出现 Plan mode 与 Approval policy 两个分区，选择状态高亮 `is-active`；审批出错/提示文本（`.thread-composer-menu-error` / `.thread-composer-approval-tip`）按原逻辑展示
2. 页面无横向溢出

### 5. 深色主题

1. `localStorage['codex-web-local.dark-mode.v1']='dark'` 后刷新
2. Composer「+」触发器、附加菜单、模型/推理下拉、富文本消息文字在深色下可读，无出现浅色表面

## 回滚

- 无数据变更；测试注入的深色偏好（`codex-web-local.dark-mode.v1`）可清除
- 抽取为机械迁移：父组件状态与回调、渲染条件（`isFoldStart`/`isReasoningMessage`/`item.presentation` 分支、`v-memo` 依赖）均保留于父组件；`MessageInlineContent` 仅接收 `segments` 数组与 `toBrowseUrl` 回调，不持有父级缓存
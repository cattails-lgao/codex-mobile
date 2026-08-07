# 第三轮验收调整（2026-08-05 提出）

> **2026-08-05 第三轮进展：** 6 条调整已全部实现（本轮工作区改动，待 commit 后推送）。涉及 `App.vue`、`ThreadComposer.vue`、`ComposerSlashMenu.vue`、`slashCommands.ts`。

1. **右侧面板可拖动宽度 + 可收起（桌面端）**：`App.vue` 新增 `rightPanelWidth`（localStorage 持久化 `codex-web-local.right-panel-width.v1`，范围 260-640px）与左侧边缘拖拽手柄 `.content-right-panel-resize-handle`；桌面端新增收起/展开（`isRightPanelCollapsed`，头部侧栏按钮与面板内 `×` 均可收起）
2. **右侧面板 tab 默认只有 Git**：移除头部 Terminal tab 按钮，仅保留 Git tab；终端面板通过 `+` popover 添加
3. **审批策略移到输入框下方，4 个 tab 切换**：设置对话框中的审批策略区整体移除；`ThreadComposer` 新增 `approvalPolicy*` props 与 `update:approval-policy`/`save-approval-policy` 事件，输入框下方渲染 4 个策略 tab（Only untrusted commands / After a command fails / When Codex requests it / Never），点击即保存；`App.vue` 挂载时 `refreshApprovalPolicy()` 预载
4. **移除输入框下的技能下拉（已并入斜杠命令）**：删除 `ComposerSearchDropdown` 组件及 prompts 相关死代码（`getComposerPrompts`/`createComposerPrompt`/`removeComposerPrompt`、`savedPrompts`、`skillDropdownOptions`、`reloadPrompts` 等）
5. **斜杠命令选中技能后恢复输入框上方技能 chips**：恢复 `.thread-composer-skill-chips` 渲染与 `removeSkill`/`skillMarkdownPath`/`openSkillMarkdown` 函数及样式
6. **斜杠命令技能组完整显示技能名称 + 系统技能加入**：`ComposerSlashMenu` 技能名改用不截断样式（`.thread-composer-slash-skill-name`）；`buildSkillSlashCommands` 改为按路径去重（同名不同 scope 的技能全部保留，系统技能不再被同名技能顶掉）


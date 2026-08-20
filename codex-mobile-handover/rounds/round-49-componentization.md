# Round-49：前端大文件组件化系列完成（2026-08-20）

> **背景：** 依 `docs/componentization-plan.md`（round-48 方案）推进，目标是减化最大的前端视图文件，不改 API 契约、持久化状态、路由或用户可见行为。本轮实现并提交全部四个阶段，并补齐验证与手测文档。

## 完成情况

**第一阶段 · Sidebar 线程行复用**
- 新增 `src/components/sidebar/SidebarThreadRow.vue`（263 行），钉住/时间序/项目分组/无项目 Chat 四类列表复用同一行组件。
- 行组件仅持有重复行表面（选择态、状态指示、行内删除确认、标题、worktree 标记、自动化徽标、待回复徽标、相对时间、hover 菜单触发器）；选择态、菜单定位、hover/contextmenu、自动化查询、归档、项目拖拽等仍由 `SidebarThreadTree.vue` 持有。
- 子组件 emits `select/inline-delete/menu-toggle/row-leave/row-contextmenu`；菜单锚点 ref 经 `setMenuWrapRef` 回调回传父级，固定 Teleport 菜单定位不变。
- 提交：`4fa26ba`（含 skills 视图一并迁移）；`SidebarThreadTree.vue` 3718 行 → 3388 行。

**第二阶段 · DirectoryHub Tab 拆分**
- 沿现有 tab 边界拆出 `DirectoryPluginsTab.vue` / `DirectoryAppsTab.vue` / `DirectoryComposioTab.vue` / `DirectorySkillsTab.vue`。
- 各 Tab 接收已加载数据与 loading/error 状态，经事件回调父级操作；详情弹窗保留在父级 `DirectoryHub.vue`（2603 行 → 2210 行）。
- 提交：`e28db82`（apps/plugins）与同一批 skills/composio 提交。

**第三阶段 · App.vue 设置/账号面板抽取**
- 新增 `src/components/settings/SettingsAccountsPanel.vue`，账户列表/刷新/登录/切换/删除从 `App.vue`（6945 行）迁出，状态与回调保留父级。

**第四阶段 · Composer / Conversation 展示层抽取**
- `ThreadComposer.vue`（2875 行）→ `ThreadComposerPlanPanel.vue` / `ThreadComposerAttachments.vue` / `ThreadComposerModelControls.vue` / `ThreadComposerAttachMenu.vue`。
- `ThreadConversation.vue`（3452 行）→ `MessageInlineContent.vue`（合并段落/标题/引用/任务项/表格中重复 6 次的内联片段渲染）。
- 提交：composer plan panel / attachments chips / model+reasoning controls / attach menu / inline markdown content。

## 验证

- `node node_modules/vue-tsc/bin/vue-tsc.js --noEmit -p tsconfig.json`：通过（EXIT 0）。
- `node node_modules/vite/bin/vite.js build`：通过；存在既有 `chunk>500kB` 警告，非本轮引入。
- 新增手测文档并登记索引：
  - `tests/chat-composer-rendering/componentization-round-49-composer-conversation.md`
  - `tests/projects-sidebar-new-chat/componentization-round-49-sidebar-thread-row-and-directory-tabs.md`
- 涉及文件：上述新增组件 + 对应父组件（热路径）减量，未改变任何网络调用或状态同步。

## 收尾验证口径

- `vue-tsc --noEmit`：通过
- `vite build`：通过
- 全量单测：本次为机械迁移，未新增单测；相关行为由既有 `tests/thread-loading-state/`、`tests/projects-sidebar-new-chat/`、`tests/skills-plugins-integrations/` 手测文档覆盖
- 新增文件清单（含手测文档）见上文各阶段

## 未完成 / 说明

- `messages view` 的 Process-fold 算法优化为独立性能任务，非本组件化系列范围。
- `useDesktopState.ts` / `codexGateway.ts` / `codexAppServerBridge.ts` 按方案排除在 Vue 视图抽取之外。
- 各阶段手测文档为数值/行为回归清单；Docker/NPX 类验证按仓库既有规则在需要时另行执行。
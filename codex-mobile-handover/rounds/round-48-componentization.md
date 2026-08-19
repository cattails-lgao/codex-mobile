# Round-48：前端大文件组件化（侧栏线程行 + Directory Hub 标签页）（2026-08-19）

> **背景：** 用户要求排查行数很大的源码文件并评估能否组件化，随后要求先出方案文件、按方案处理，并在完成首批后先提交再继续剩余部分。本轮聚焦前端视图层拆分，不触碰状态管理与服务端桥接层。

## 需求/方案

**需求（用户原话）：** 「你需要排查一下哪些文件他的行数很大？看能不能组件化」「你出个方案文件，按照方案文件进行处理」「先提交，在继续处理剩余部分」。

**方案（`docs/componentization-plan.md`）：** 按收益与风险排序，分四期处理：

- 第一期：侧栏线程行复用（`SidebarThreadTree.vue` 四处重复行收敛为一个组件）。
- 第二期：Directory Hub 按 `plugins/apps/composio/skills` 标签拆分。
- 第三期：`App.vue` 设置与账号面板。
- 第四期：`ThreadComposer.vue` 与 `ThreadConversation.vue` 展示层。

`useDesktopState.ts`、`codexGateway.ts`、`codexAppServerBridge.ts` 明确排除在组件化之外，需按领域模块化，不混入本轮。

## 实施

### 第一期：侧栏线程行复用

**根因（代码确认）：** `SidebarThreadTree.vue` 中 pinned、chronological、project-group、projectless chat 四处列表各有一份几乎完全相同的线程行模板（约 90 行 × 4），重复度高、后续维护需同步改多处。

**修复（涉及文件）：**

- 新增 `src/components/sidebar/SidebarThreadRow.vue`：只持有线程行展示结构（选中态、状态指示、内联删除确认、标题、worktree 标记、自动化徽标、pending 徽标、相对时间、hover 菜单触发），通过 props 接收显示数据与回调，通过事件上抛 `select` / `inline-delete` / `menu-toggle` / `row-leave` / `row-contextmenu`。
- `SidebarThreadTree.vue`：四处列表改用 `SidebarThreadRow`；菜单锚点 ref 通过回调 prop 传回父组件，保持既有固定 Teleport 菜单定位不变；父组件继续持有选择、菜单定位、hover/右键行为、自动化查询、归档、项目拖拽。
- 将仅服务线程行的 scoped 样式随组件迁移，并补齐深色主题样式；项目标题仍使用的自动化徽标样式保留在父组件。

### 第二期：Directory Hub 标签页

**根因（代码确认）：** `DirectoryHub.vue` 约 2600 行，四个标签的模板、状态与操作高度集中；其中 Skills 标签的 MCP 展示、Apps 标签的卡片列表、Plugins 标签的卡片 + Marketplace 管理均有清晰 UI 边界。

**修复（涉及文件）：**

- 新增 `src/components/content/DirectorySkillsTab.vue`：SkillsHub + MCP 折叠区展示；父组件继续持有 MCP 数据、加载/刷新、展开状态与登录操作。
- 新增 `src/components/content/DirectoryAppsTab.vue`：Apps 搜索/排序/卡片操作展示；父组件继续持有加载、启用/禁用、Try、外部 URL 打开。
- 新增 `src/components/content/DirectoryPluginsTab.vue`：Plugins 搜索/排序/卡片 + Marketplace 管理展示；父组件继续持有加载、安装/卸载、Marketplace 增删升级、详情弹窗。
- `DirectoryHub.vue`：三个标签模板替换为对应子组件；`<style scoped>` 改为 `<style>`（全局），使目录专属样式在子组件内仍生效，保持所有标签与详情弹窗现有外观。

## 验证

- `pnpm exec vue-tsc --noEmit`：通过。
- `pnpm run build:frontend`：通过（既有主 chunk 大小警告，非本轮引入）。
- `git diff --check`：通过。
- 性能审计：均为视图层抽取，未新增 API 请求、轮询、缓存失效或状态同步路径；`DirectoryHub` 子组件不含 `fetch`/`list*` 调用。生产构建主入口约从 595.31 kB 降至 593.44 kB，主要收益是消除重复模板与降低维护复杂度。

## 提交

- `4fa26ba` refactor: extract sidebar and skills views（方案 + 侧栏线程行 + Skills 标签 + 对应手测）。
- Apps / Plugins 标签改动尚未提交（本轮结束时工作区仍有未提交改动）。

## 收尾验证说明

- `vue-tsc --noEmit`：通过。
- `pnpm run build:frontend`：通过。
- 全量单测：本轮未运行（视图层抽取，未改逻辑；如需可后续补跑）。
- Playwright：未运行（用户未要求浏览器自动化验证；Playwright Chromium 此前下载卡住）。
- 涉及文件清单：
  - 新增：`docs/componentization-plan.md`、`src/components/sidebar/SidebarThreadRow.vue`、`src/components/content/DirectorySkillsTab.vue`、`src/components/content/DirectoryAppsTab.vue`、`src/components/content/DirectoryPluginsTab.vue`
  - 修改：`src/components/sidebar/SidebarThreadTree.vue`、`src/components/content/DirectoryHub.vue`、`tests/projects-sidebar-new-chat/thread-context-menu-and-recycle-bin.md`、`tests/skills-plugins-integrations/codex-app-style-plugins-directory.md`

## 遗留

- Composio 标签尚未抽取（第二期剩余项）。
- 第三期 `App.vue` 设置/账号面板、第四期 Composer/Conversation 展示层尚未开始。
- 工作区 `.zcode/` 为既有未跟踪内容，与本任务无关，未纳入提交。

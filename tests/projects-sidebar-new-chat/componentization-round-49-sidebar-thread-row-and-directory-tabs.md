# 组件化第一期+第二期：Sidebar 线程行 / DirectoryHub Tab

2026-08-20。依据 `docs/componentization-plan.md` 第一、二期目标完成机械迁移，仅减化文件、不改 API 契约、持久化、路由或用户可见行为。父组件仍持有全部状态所有权。

## 变更清单

**SidebarThreadTree.vue（3718 行 → 3388 行）→ `SidebarThreadRow.vue`（263 行）**

钉住 / 时间序 / 项目分组 / 无项目 Chat 四类列表共用同一 `<SidebarThreadRow>`。行组件仅持有重复行表面：

- 选择态、状态指示、行内删除确认、标题、worktree 标记、自动化徽标、待回复徽标、相对时间、hover 菜单触发器

父子契约（`SidebarThreadTree.vue` 经 props/events 持有全部导航与交互状态）：

- props：`thread/selected/pinned/menuOpen/showStatusIndicator/threadState/inlineDeleteConfirming/automationCount/automationTooltip/requestLabel/relativeTime` + 各文案 label + `setMenuWrapRef` 回调
- emits：`select / inline-delete / menu-toggle / row-leave / row-contextmenu`
- 菜单锚点 ref 经 `setMenuWrapRef` 回传父级，固定 Teleport 菜单定位不变

**DirectoryHub.vue（2603 行 → 2210 行）→ 四个 Tab 组件**

- `DirectoryPluginsTab.vue` / `DirectoryAppsTab.vue` / `DirectoryComposioTab.vue` / `DirectorySkillsTab.vue`
- 每个 Tab 接收已加载数据与 loading/error 状态，经事件回调父级操作（`update:search-query`/`update:sort-mode` 等）；详情弹窗仍留在父级

## Prerequisites

- dev server 运行在 `127.0.0.1:4173`；已有覆盖钉住 / 项目分组 / 时间序 / Chat 四类列表、含 worktree/自动化/待回复状态的线程集；已配置至少一个 MCP 与插件/应用

## 验证步骤

### 1. 静态检查

```powershell
node node_modules/vue-tsc/bin/vue-tsc.js --noEmit -p tsconfig.json   # 通过
node node_modules/vite/bin/vite.js build                              # 通过（既有 chunk 警告，非本轮引入）
```

### 2. SidebarThreadRow 等价性（四类列表）

1. 切换线程视图模式为 `project` / `chronological`，并展开 Chats 与 Pinned 区；四类列表渲染的每行结构一致且行为不变
2. 点击行任一空白处 → 选中线程（`data-active` 高亮）；点击行内主按钮同样触达（`@click.stop` 不冒泡到外层）
3. 右键行 → 触发 `contextmenu`；悬停行露出「⋮」菜单触发器，点击弹出固定定位菜单，其锚点位置与原一致
4. 悬停行出现行内删除按钮，点击进入「Confirm delete」确认态，二次点击删除、移开取消；Esc 或离开行恢复正常
5. 行标题后的 worktree 图标、自动化徽标（`thread-row-automation-chip`，count>1 显示数字）、待回复徽标（`thread-row-request-chip` data-state=approval/response）按原条件显示

### 3. DirectoryHub Tab 等价性

1. 依次打开各 Tab，`activeTab` 路由状态保持不变
2. Plugins：搜索/排序、marketplace add/remove、详情弹窗；Apps：搜索/排序、Enable/Disable、Try、详情；Composio：连接器列表/搜索/Load more/CLI 安装与登录；Skills：MCP section 展开折叠、认证状态徽标
3. 各 Tab 内下拉/搜索状态在 Tab 切换后按原逻辑保留或重置（取决于父级 ref 归属）

### 4. 主题与响应式

1. 浅色 + 深色（`codex-web-local.dark-mode.v1=dark`）下 Sidebar 线程行与四个 Directory Tab 无浅色表面
2. 桌面与 375×812 移动宽度无横向溢出，侧栏折叠/重排正常

## 回滚

- 无数据变更；测试注入的深色偏好可清除
- 抽取为机械迁移：选择、菜单定位、hover/contextmenu、自动化查询、归档、项目拖拽等逻辑与 `setMenuWrapRef`/各回调均保留于父组件；Tab 子组件仅新增纯展示 props/events
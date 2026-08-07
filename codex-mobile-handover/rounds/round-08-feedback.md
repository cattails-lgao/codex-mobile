# 第五轮反馈（2026-08-05 提出）

> **2026-08-05 第五轮进展：** 8 条需求已全部实现并验证（vue-tsc / build / 单测 216 通过，2 个失败为 Windows 基线环境性失败与改动无关；Playwright 用本机 Edge channel 8/8 通过，截图见 `output/playwright/round5-*.png`）。本轮改动涉及 `ThreadComposer.vue`、`ComposerDropdown.vue`、`ComposerSlashMenu.vue`、`codexAppServerBridge.ts`、`localBrowseUi.ts`、`httpServer.ts`、`vite.config.ts`、`codexGateway.ts`、`App.vue`、`style.css`，并新增 `ComposerPopover.vue`、`RightFilesPanel.vue`、`IconTablerFiles.vue`。

1. **模型列表没有模型**：根因：审批策略写入器匹配正则不匹配自己写的行（写入 `approval_policy = "..."` 带空格，匹配用 `approval_policy=` 无空格），每次保存追加重复 key，最终 TOML 解析失败 → `config/read`、`provider-models`、`skills/list` 全挂。`writeApprovalPolicyToConfigFile` 改为 `APPROVAL_POLICY_ASSIGNMENT = /^approval_policy\s*=/u`：删除所有现有赋值行去重后把 key 放文件顶部（避免落入 `[table]`）；同时手动修复被破坏的 `.codex/config.toml`（删除 5 个重复 key）。验证后恢复审批策略为 untrusted，确认写入幂等
2. **popover 抽取为公用组件**：新增 `ComposerPopover.vue`（受控 `open`/`update:open`、`align` start|end、`width` md|lg、`panelClass`、`ariaLabel`，trigger slot 暴露 `toggle`/`isOpen`）；`ThreadComposer` 的 attach/plan/approval 三个菜单重构为 `ComposerPopover`，删除旧 `attachMenuRootRef` 等 ref 与旧菜单样式类；`onDocumentClick` 改用 `.composer-popover-anchor` 判断点击内外
3. **审批策略选中提示改为 tip**：保存后不再弹出长文案通知，改为按钮上方悬浮 tip（`.thread-composer-approval-tip` 圆角胶囊，`role="status"`，2200ms 自动消失）；`App.vue` 提示文本用 `t('Approval policy saved')`，明暗主题样式同步到 `style.css`
4. **斜杠命令中技能组不见了**：与需求 1 同根因：config.toml 损坏导致 `skills/list` 失败，技能组随配置层一起挂掉；配置修复后技能组恢复（验证 10 行技能，含系统/用户/仓库 scope）
5. **技能组每项描述最多两行，超出隐藏**：`.thread-composer-slash-desc--skill` 加 `-webkit-line-clamp: 2; overflow: hidden; white-space: normal; overflow-wrap: anywhere`
6. **每组每项宽度不能超过 popover 宽度**：`.thread-composer-slash-row` 加 `min-w-0 max-w-full overflow-hidden`；`.thread-composer-slash-skill-name` 加 `min-w-0` 与 `overflow-wrap: anywhere`；`.composer-popover` 加 `min-w-0 max-w-full overflow-x-hidden`（Playwright 实测行宽 ≤ popover 宽）
7. **模型按钮和模型强度改为和规划模式按钮一样的样式**：`ComposerDropdown` 新增 `variant?: 'plain' | 'pill'`；模型与模型强度两个下拉用 `variant="pill"`，走与规划模式按钮同款 pill 样式（`.composer-dropdown-trigger--pill`：`h-8 rounded-full border border-zinc-200 bg-white px-2.5 text-xs`），dark 主题同步
8. **右边栏添加显示文件功能（显示工作区文件，作用域在工作区）**：`localBrowseUi.ts` 新增 `listWorkspaceFiles`（忽略 `.git/node_modules/dist/build/out/.next/.nuxt/coverage/__pycache__/.cache/.turbo/target/.venv/venv/.idea/.vscode/output`，目录优先 + 字母排序，maxEntries 2000 / maxDepth 8）；`GET /codex-local-files?path=` 路由（`httpServer.ts` + `vite.config.ts` dev 中间件）；`codexGateway.listWorkspaceFiles(cwd)`；新增 `RightFilesPanel.vue`（搜索过滤、按顶层目录分组折叠、点击文件 `window.open('/codex-local-browse'+encodeURI(path))`）与 `IconTablerFiles.vue`；`App.vue` 右侧栏新增 Files tab 与 `+` 菜单项（验证 1080 文件 / 11 组）

> **验证说明：** 需求 1/4 属于同一配置层损坏的根因修复，其余为 UI 改造；Playwright（`chromium.launch({ channel: 'msedge' })`）8/8 断言通过：pill 触发按钮 ≥2、模型下拉选项 >0、斜杠菜单 Skills 组存在、行宽不超 popover、描述两行截断（实测高度断言）、approval 菜单、tip 文本、Files tab 文件列表；明暗主题截图齐全。


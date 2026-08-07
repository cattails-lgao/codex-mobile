# 第六轮交接需求（2026-08-05 提出）

> **2026-08-05 第六轮进展：** 2 条需求已全部实现并验证（`vue-tsc --noEmit` 通过；单测 214 通过，4 个失败为 Windows 基线环境性失败与改动无关），本轮改动已 commit 并推送（`b71bbaf`）。涉及 `localBrowseUi.ts`、`httpServer.ts`、`vite.config.ts`、`codexGateway.ts`、`RightFilesPanel.vue`、`useUiLanguage.ts` 及 20+ 组件，并新增 `FilePreviewModal.vue`。

1. **右侧文件面板中，点击文件需要进行文件预览**：`localBrowseUi.ts` 新增 `getFilePreview()`（文本截断 512KB）；`GET /codex-local-preview?path=` 双通道注册（`httpServer.ts` Express + `vite.config.ts` dev 中间件）；`codexGateway.previewLocalFile(path)`；新增 `FilePreviewModal.vue`（文本用 `pre` 等宽块展示、图片 `<img>` 内联、二进制显示提示 + 「Open in browser」按钮 `window.open('/codex-local-browse' + encodeURI(path))`、超过 512KB 显示截断提示、ESC/关闭按钮/点击遮罩均可关闭）；`RightFilesPanel.vue` 点击文件行改为打开面板内预览弹窗，不再新开浏览器页
2. **项目中的中英文翻译不全**：采用「扫描清单 → 加字典 key → 逐组件包 `t()` → vue-tsc 验证」循环补齐 `useUiLanguage.ts` 中文字典并覆盖各界面硬编码文案：①首轮补主要模板文本约 100 条；②脚本扫描 `script` 字符串字面量（token 统计、额度、插件/技能/自动化 toast、RRULE 等）约 70 条；③右键菜单（复制聊天/创建聊天分叉/固定线程/取消固定线程/重命名项目/重命名线程等）、编辑消息确认弹窗（编辑此消息？/撤销、重做文件变更及说明、命令状态标签、6 个审批标题）、自动化面板（新建/刷新/心跳/项目/总计/空状态）、技能面板（搜索/加载/安装/卸载/更新失败提示）、Git 面板（分支/提交/检出/重置/复制提交引用/脏状态长警告/current·remote 徽章）、Review 面板（Added/Deleted/Renamed/Modified）等约 90 条；修复后中文模式下上述界面已无英文残留（仅保留 `ID` 等技术性标识）

> **验证说明：** 需求 2 的右键菜单残留经全量 grep 复查后清零（`SidebarThreadTree.vue` 的 Copy chat / Create chat fork / Pin thread / Unpin thread / Rename project / Open this chat before copying，`ReviewPane.vue` 的 `formatOperation`）；`vue-tsc` 无重复 key、无类型错误；手动测试文档新增一节（`tests/theme-layout-terminal/composer-fifth-round-feedback.md`）。


# 第八轮：上游 PR 移植（2026-08-06）

> **2026-08-06 进展：** 从上游 `friuns2/codex-mobile` 精选 5 个 PR 全部移植完成并推送（commit `3823011`，19 个文件，+563/-78）。验证：`vue-tsc --noEmit` 通过、`pnpm run build` 通过、相关单测 82/82 通过（全量 227 通过，2 个失败为既有 Windows 环境性失败，与本次改动无关）。未使用 `upstream-sync-curator` 技能，评估后 5 个 PR 均可 1:1 移植，无结构冲突。

1. **`#202` 平台相关侧边栏快捷键**：`App.vue` `onWindowKeyDown`：Mac 上仅响应 Cmd+B、非 Mac 仅响应 Ctrl+B，新增 `isMacPlatform()` 辅助函数；PR 顺带的 `terminalShortcutLabel` 重构因本地无该变量而跳过（纯外观）。验证：vue-tsc + 手动键盘测试
2. **`#199` 纯附件线程兜底标题**：`useDesktopState.ts` `requestThreadTitleGeneration` 新增 `resolveFallbackThreadTitle`（附件标签 / `[Image]` / Untitled thread），调用点传入 `imageUrls`/`fileAttachments`。验证：单测 + 附件线程发消息看标题
3. **`#212` Windows 本地浏览路径**：`localBrowseUi.ts` `decodeBrowsePath` 新增平台参数（剥掉 `/C:/` 前多余斜杠）、新增 `normalizeLocalRoutePath`，`toBrowseHref`/`toEditHref` 改为导出；新增 `localBrowseUi.test.ts`（6 例）+ 手动用例文档。验证：单测 6/6 通过
4. **`#206` 定时器泄漏 + HTML 消毒**：新增 `src/utils/sanitizeHtml.ts`（DOMParser 白名单，去除 script/iframe 等危险标签与 `on*`/`javascript:` 属性）；`ThreadConversation.vue` 三个渲染函数、`SkillDetailModal.vue` readme 渲染包一层 sanitize；`DirectoryHub.vue`/`SkillsHub.vue` 加 `onBeforeUnmount` 清理 timer；PR 里未使用的 `SafeHtml.vue` 按 YAGNI 跳过。验证：vue-tsc + 手动渲染含恶意 HTML 的 markdown 消息
5. **`#209` GPT-5.6 max/ultra 推理等级**：`types/codex.ts` 新增 `REASONING_EFFORTS` 目录 + `isReasoningEffort`；`codexGateway.ts` 新增 `getAvailableModels`（带模型级 `supportedReasoningEfforts`/`defaultReasoningEffort`），旧 `getAvailableModelIds` 改为包装；`useDesktopState.ts` 新增模型感知的推理等级钳制（切换不支持当前等级的模型时回退到默认等级）；`ThreadComposer.vue` Thinking 下拉按模型过滤选项；`App.vue` 绑定新 prop；两处测试文件 mock 改写 + 新增用例（共 3 个新测试）。验证：单测 3 文件 82/82 通过

> **环境注意：** 本机 PATH 中无 `node.exe`（fnm 管理），直接运行 `pnpm` 会报「node 无法识别」。验证命令需先加入 node 目录：`$env:PATH = 'C:\Users\<用户名>\AppData\Roaming\fnm\node-versions\v24.18.1\installation;' + $env:PATH`。另外本会话添加了 `upstream` remote（`friuns2/codex-mobile`），直连 fetch 超时未成功，未影响使用。


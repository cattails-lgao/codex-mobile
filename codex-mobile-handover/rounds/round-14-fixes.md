# 第十轮交接需求（2026-08-06 提出）

> **2026-08-06 第十轮进展：** 3 条需求已全部实现并验证（`vue-tsc --noEmit` 通过、`vite build` 通过、Playwright 桌面/H5 双视口断言 14/14 通过），截图见 `output/playwright/round10-{sidebar-desktop,h5}.png`。涉及 `App.vue`、`ThreadComposer.vue`。

1. **左侧栏底部设置和回收图标各占一半宽度，图标增大**：`App.vue`：`.sidebar-settings-actions` 去掉 `justify-center`；`.sidebar-settings-icon-button` 改 `h-10 flex-1`（两个按钮均分整行宽度）；`.sidebar-settings-icon` 由 `w-4.5 h-4.5` 增至 `w-6 h-6`（24px）
2. **输入框下模型切换按钮固定宽度，超出省略**：`ThreadComposer.vue`：模型 `ComposerDropdown` 增加 `thread-composer-model-control` 类，根节点 `w-40 min-w-0`（H5 下 `w-32`），触发按钮 `w-full`，配合既有 `.composer-dropdown-value` 的 `truncate` 实现超出省略
3. **H5 模式下模型/模型强度/上下文按钮改小**：`ThreadComposer.vue` 新增 `@media (max-width: 767px)`（与 `useMobile` 断点一致）：pill 触发按钮 `h-7 px-2 text-[11px]`、chevron `h-3 w-3`、`.thread-composer-context-usage-inline` `h-7 px-2 text-[11px]`

> **验证说明：** Playwright（本机 Edge channel）桌面 1280×800 与 H5 375×812 双视口断言通过：侧栏底部 2 个图标按钮均宽 120px（各占一半）、高 40px、图标 24×24；模型触发按钮桌面 160px / H5 128px，value 计算样式 `text-overflow: ellipsis`；H5 下模型/模型强度/上下文按钮高 28px、字号 11px。上下文按钮为数据驱动的条件渲染（`v-if="contextUsageView"`，依赖 `thread/tokenUsage/updated` 服务端通知写入的 `threadTokenUsage`，无数据或 `modelContextWindow` 无效时返回 null 不显示），空闲纯文本会话截图上看不到属预期；向 localStorage（`codex-web-local.thread-token-usage.v1`）注入模拟 usage（含 `modelContextWindow: 200000`）后桌面/H5 均正常渲染「85% · 40k / 200k」，高度桌面 32px / H5 28px，H5 缩小样式生效。过程中发现 4173 dev server 对 `ThreadComposer.vue` 的样式转换缓存过期（模板更新但 CSS 未刷新），按交接文档沙箱启动方式（`CODEX_HOME` 指向项目内 `.codex/`）重启 dev server 后恢复。


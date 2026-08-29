# Round-64：v0.1.109 发布（回收站固定高度 / 思考强度默认 medium / H5 附加菜单可见性修复）

> **范围：** 收录今天三处改动，随 v0.1.109 一起发布。GitHub Release 与 git tag 由维护者（agent）创建，npm publish 由用户执行。`vue-tsc` 通过、`pnpm run build` 通过（web + CLI）。

## 本轮提交

| 提交 | 内容 |
| --- | --- |
| `71e7cd8` | ①回收站弹窗固定高度（`recycle-bin-content` 容器 `h-64 overflow-y-auto`）；②推理强度无显式选择时默认 `medium`；③`ComposerPopover` 面板由 `absolute` 相对定位改为 viewport `fixed` 定位，逃避 `.thread-composer-controls` 移动端 `overflow-x-auto` 滚容器裁剪，修复 H5 下「+」附加菜单打开后不可见；同步更新推理默认断言与 H5 附加菜单手工用例；bump 版本 0.1.109 |

## 改动要点

1. **回收站固定高度**：[SidebarThreadTree.vue](../src/components/sidebar/SidebarThreadTree.vue) 回收站内容容器 `@apply h-64 overflow-y-auto`，固定高度、内容超出滚动，面板不随列表长度伸缩。
2. **思考强度默认 medium**：[useDesktopModelPreferences.ts](../src/composables/useDesktopModelPreferences.ts) 无用户显式选择时以 `'medium' as const` 作为默认推理强度；测试随更新（`expect(...).toBe('medium')`）。
3. **H5 附加菜单可见性**：根因是移动端 `.thread-composer-controls` 的 `overflow-x-auto` 使 float 变成裁剪式滚动容器，`ComposerPopover` 原先 `absolute` 向上弹出的菜单被裁剪；改为 viewport `fixed` 定位（与 `ComposerDropdown#updateMenuPosition` 同思路），并保留 `align` 对齐与 resize/scroll/orientationchange 重算。`ThreadComposer` 点击外部关闭仍依赖 `.composer-popover-anchor`，无回归。

## 验证

- `pnpm exec vue-tsc --noEmit`：通过。
- `pnpm run build`：通过（web + CLI）。
- Browser Use 移动端视口（约 603×714，仍触发 `max-width:767px` 的 `overflow-x-auto`）实测：①「+」菜单可正常弹出可见，含 Add photos & files / Add folder / Take photo 等；②回收站面板为固定高度容器；③推理强度按钮显示 Medium。

## 发布状态

- 版本 bump → 提交 `71e7cd8` 已推送至 `origin/main`；tag `v0.1.109` 指向该提交。
- GitHub Release `v0.1.109`：https://github.com/cattails-lgao/codex-mobile/releases/tag/v0.1.109
- `codex-mobile-re@0.1.109`：npm publish 由用户执行，发布后在 npm 官方源确认成为 `latest`。

## 交接注意事项

- 移动端 `.thread-composer-controls` 是 `overflow-x-auto` 裁剪容器：任何在其中向上弹出的浮层（`ComposerPopover`）必须使用 viewport `fixed` 定位，不能再用 `absolute`，否则 H5 下被裁剪不可见。
- `ComposerPopover` 已是 fixed 定位组件，三个菜单（附加/计划/审批）共用；面板保持在 `.composer-popover-anchor` 的 DOM 子级，`ThreadComposer` 的点击外部关闭逻辑依赖该 class，勿把面板 teleport 到 body。
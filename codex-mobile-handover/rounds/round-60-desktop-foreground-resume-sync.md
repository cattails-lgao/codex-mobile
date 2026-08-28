# Round-60：桌面前后台恢复同步修复（2026-08-27）

> **背景：** 前台恢复同步此前只在移动端执行。桌面浏览器标签页在后台停留后返回时，线程列表和当前线程可能维持旧状态；本轮将同一受控恢复路径扩展到桌面与移动端。代码提交 `01ab0b4` 与交接文档提交 `cbc1846` 均已完成并推送。

## 现象

移动端已有基于 `visibilitychange`、`pageshow` 和 `focus` 的恢复同步，但入口由 `isMobile` 限制。桌面标签页从后台返回时不会调用 `refreshAll({ includeSelectedThreadMessages: true })` 或按路由重新同步线程选择，恢复后的侧栏或当前会话可能滞后。

## 根因

`src/App.vue` 的恢复逻辑使用 `mobileHiddenAtMs`、`mobileResumeReloadTriggered` 和 `maybeSyncAfterMobileResume()` 等仅移动端命名及 `isMobile.value` 前置条件。事件监听本身已同时注册在 `document` 与 `window`，因此桌面端缺少的不是浏览器事件，而是共享恢复条件和同步入口。

## 修复

- 新增 `src/utils/foregroundResume.ts`，集中判断恢复同步条件：页面重新可见、存在后台起点、后台时长不少于 400 ms，且该后台周期尚未触发同步。
- `src/App.vue` 将移动端专属状态和函数更名为前台恢复语义，移除 `isMobile.value` 限制，使桌面和移动端共用同一套 `visibilitychange`、持久化 `pageshow`、`focus` 事件收敛逻辑。
- 每个后台周期只允许一次同步；同步仍复用既有 `refreshAll({ includeSelectedThreadMessages: true })` 与 `syncThreadSelectionWithRoute()`，不新增 API、存储或后台轮询。
- 新增 `src/utils/foregroundResume.test.ts`，覆盖达到 400 ms 阈值时允许一次同步，以及 hidden、短暂切换、缺少后台起点和已处理恢复等拒绝路径。
- 手动测试新增 [Foreground resume sync on desktop and mobile](../../tests/thread-loading-state/foreground-resume-sync-on-desktop-and-mobile.md)，并登记到线程加载/状态索引。

## 验证状态

- 单元测试：91/91 通过。
- `vue-tsc --noEmit`：通过。
- 生产构建：通过。
- 当前无浏览器标签；桌面端与移动端手动测试尚待执行。
- 代码提交 `01ab0b4` 与交接文档提交 `cbc1846` 均已完成并推送。

## 性能审计

恢复同步只会在一次后台周期满足 400 ms 阈值后触发一次，`visibilitychange`、`pageshow` 与 `focus` 的重复信号由 `foregroundSyncTriggered` 合并。复用原有刷新路径，不增加请求种类、持久化、轮询、缓存体积或无界扇出；尚未采集浏览器 profile。当前无浏览器标签，桌面/移动端手测及浏览器侧请求重复验证待后续执行。

## 涉及文件

- `src/App.vue`
- `src/utils/foregroundResume.ts`
- `src/utils/foregroundResume.test.ts`
- `tests/thread-loading-state/foreground-resume-sync-on-desktop-and-mobile.md`
- `tests/thread-loading-state/index.md`
- `codex-mobile-handover/codex-mobile-handover.md`
- `codex-mobile-handover/rounds/round-60-desktop-foreground-resume-sync.md`

## 交接注意事项

- 400 ms 以下的短暂焦点或可见性波动不应触发恢复刷新。
- 不要为 `pageshow` 或 `focus` 单独补一条刷新链路；三类浏览器事件必须继续由同一后台周期标记收敛，避免当前线程重复请求。
- 当前工作区另有 `.zcode/` 未跟踪目录，不属于本轮提交范围。

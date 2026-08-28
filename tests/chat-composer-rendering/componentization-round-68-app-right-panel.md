# Componentization round-68: App.vue right-panel state hook

Refactor of `App.vue` (no user-visible behavior change). The self-contained right-panel UI-state cluster was extracted as a local hook:

**`useRightPanel.ts`** — `createRightPanel(deps)` factory, injecting three read-only getters (`isMobile`, `canShowRightPanel`, `isVirtualKeyboardOpen`) and owning:
- state: `activeRightPanelTab`, `filePreviewTabs` / `activeFilePreviewTabKey` / `activeFilePreviewTab`, `isRightPanelMenuOpen`, `isMobileRightPanelOpen`, `isRightPanelCollapsed`, `rightPanelWidth` (persisted to `codex-web-local.right-panel-width.v1`), plus the terminal keyboard-focus pair `isTerminalInputFocused` / `isTerminalKeyboardFocusFallbackActive` and the private `terminalKeyboardFocusFallbackTimer`;
- methods: `onRightResizeHandleMouseDown` (drag-resize, persists on release), `toggleRightPanelTerminal` (keyboard `j`), `selectRightPanelTab`, `onOpenFilePreview` / `selectFilePreviewTab` / `closeFilePreviewTab`, `onCloseRightPanel`, `onToggleRightPanelToggle`, `onHideRightPanelTerminal`, `onTerminalFocusChange` (virtual-keyboard-aware 1500 ms fallback), `resetTerminalKeyboardFocusState`, `clearTerminalKeyboardFocusFallbackTimer`.

`App.vue` destructures the hook result; the shared `activeRightPanelTab`, `isTerminalInputFocused`, `isTerminalKeyboardFocusFallbackActive`, `resetTerminalKeyboardFocusState` and `clearTerminalKeyboardFocusFallbackTimer` are still read/written by the leftover orchestration that must stay in the component (the `isRightPanelTerminalActive` / `isTerminalKeyboardLayoutActive` computeds, the `watch(isVirtualKeyboardOpen)` reset, `onDocumentPointerDown`, `refreshThreadTerminalStatus`, the unmount `clearTerminalKeyboardFocusFallbackTimer()`).

## Prerequisites / Setup

- App installed and running on the dev server (127.0.0.1:4173).
- A current thread (so the right panel is available) and at least one file you can open from the file tabs.

## Actions and Expected Results

### Tab switching and menu
1. Click the right-panel tabs (Git / Files) and the "+" overflow menu (Terminal / Git / Files). Expected: the active tab switches, the menu closes after a selection, and the panel expands if it was collapsed.
2. Press `j` (thread route, composer has a cwd). Expected: the panel toggles between the terminal and git tabs.

### Terminals focus fallback
3. Focus the terminal input on a desktop viewport. Expected: the virtual-keyboard focus fallback engages and clears itself ~1.5 s later.
4. Click outside the terminal panel (e.g. into the conversation). Expected: terminal input focus and the fallback flag reset.

### File previews
5. Open two different files from the file tab. Expected: two preview tabs appear; opening an already-open path focuses the existing tab instead of adding a duplicate.
6. Close the active preview tab. Expected: the next/inline fallback tab becomes active; closing the last preview returns to the Files tab.

### Collapse / close / mobile
7. Desktop: click the right-panel close/expand toggle. Expected: panel collapses; reload — width persistence holds for the drag-resize handle (drag the left edge to resize, release, reload).
8. Mobile viewport (375 px): open the panel; close it. Expected: only the mobile overlay opens/closes, not the desktop collapse state.

## Verification / Cleanup Notes

- No behavior change; guards against extracting the App.vue right-panel UI-state cluster.
- Rollback: covered by `useRightPanel.test.ts` (16 cases: default desktop state, width load + clamp from localStorage, tab select (desktop + mobile + non-terminal reset), terminal toggle (+ no-op when panel hidden), preview open/dedupe/close-fallback/unknown-key, desktop/mobile close + toggle, hide-terminal, `onTerminalFocusChange` virtual-keyboard + false-reset, reset state, resize + persist on release) plus `vue-tsc` and the production build; revert `App.vue`'s `createRightPanel()` wiring if any surface above misbehaves.
- Cleanup: no state mutated on disk; the right-panel width preference is app-owned and reversible from the UI.

## Playwright 移动端回归（375×812，2026-08-28）

移动端抽屉行为已用 Playwright CJS 在 375×812 视口下回归（`scripts/verify-mobile-375.cjs`）。浏览器选择策略：优先以系统已安装浏览器启动（先探测 Edge → Chrome 常见安装路径），找不到任何系统浏览器时才回退 Playwright 自带 chromium——无需强制下载浏览器二进制。

- **进入会话后的抽屉可用性**：打开移动端 "Open side panel" 抽屉按钮 → 抽屉以 overlay 出现（按钮 aria-label 切换为 "Close side panel"）；Git / 文件 / Terminal tab 均切换成功。
- **关闭**：点击抽屉内部 "Close panel" 按钮 → `.content-right-panel.is-mobile-open` class 移除、抽屉关闭（截图确认右侧回归单面板全宽）。
- **断言口径**：移动端面板容器常驻 DOM、以 `.is-mobile-open` class 表征开合（由 `isMobileRightPanelOpen` 驱动）；因此 Playwright 判断开合应检查该 class 是否移除，而非 `isVisible()`（transform 移出视口的元素 `isVisible()` 仍为 true，会误报）。
- **错误**：全程无 console / page error。
- 截图：`output/playwright/mobile-375-before-drawer.png`、`mobile-375-drawer-open.png`、`mobile-375-drawer-closed.png`。
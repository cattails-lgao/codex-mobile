# Componentization Plan

## Purpose

Reduce the largest frontend view files without changing API contracts, persisted state, routing, or user-visible behavior. Each phase keeps state ownership in the existing parent until the extracted surface has stable props and events.

## Scope

The initial inventory identifies these frontend files as the highest-value candidates:

| File | Lines | Direction |
| --- | ---: | --- |
| `src/App.vue` | 6945 | Extract settings, account, and project setup surfaces. |
| `src/components/sidebar/SidebarThreadTree.vue` | 3718 | Reuse a single thread-row component across pinned, project, chronological, and chat lists. |
| `src/components/content/ThreadConversation.vue` | 3452 | Separate render adaptation and remaining message-template branches. |
| `src/components/content/ThreadComposer.vue` | 2875 | Extract plan panel, attachments, and configuration controls. |
| `src/components/content/DirectoryHub.vue` | 2603 | Split the existing plugins, apps, Composio, and skills tabs. |

`src/composables/useDesktopState.ts`, `src/api/codexGateway.ts`, and `src/server/codexAppServerBridge.ts` are excluded from component work. They require domain-level module boundaries and should not be refactored in the same series as Vue view extraction.

## Principles

- Preserve parent ownership of network calls, persisted state, menus, dialogs, drag state, and routing during the first extraction.
- Extract repeated markup before extracting shared state.
- Give children typed display props and explicit events; do not expose parent refs or mutate props.
- Keep existing CSS class names where possible so the visual change is limited to component ownership.
- Complete one view at a time and verify it before beginning the next view.

## Phase One Sidebar Thread Rows

Create `src/components/sidebar/SidebarThreadRow.vue` and replace the four duplicated rows in `SidebarThreadTree.vue`:

- pinned threads
- chronological threads
- project-group threads
- projectless chat threads

The row owns only the repeated visual structure: selection state, status indicator, inline delete confirmation, title, worktree marker, automation badge, pending-request badge, relative time, and hover menu trigger. `SidebarThreadTree.vue` continues to own selection, menu placement, hover/context-menu behavior, automation lookup, archiving, and project drag handling.

The child emits `select`, `inline-delete`, `menu-toggle`, `row-leave`, and `row-contextmenu`. The menu-anchor ref remains in the parent through a callback prop so the existing fixed Teleport menu positioning remains unchanged.

## Phase Two Directory Tabs

Split `DirectoryHub.vue` along its existing tab boundary:

- `DirectoryPluginsTab.vue`
- `DirectoryAppsTab.vue`
- `DirectoryComposioTab.vue`
- `DirectorySkillsTab.vue`

Each tab receives its loaded data, loading/error state, and invokes parent-owned operations through events. Detail dialogs remain in `DirectoryHub.vue` during this phase. Move a tab's local search and sort refs only after its template has been extracted and verified.

## Phase Three Root Surfaces

Extract settings and account panels from `App.vue` before moving any initialization flow:

- `SettingsDialog.vue`
- `SettingsGeneralPanel.vue`
- `SettingsAccountsPanel.vue`
- project setup or import dialogs when their event surface is stable

`App.vue` remains responsible for route synchronization, startup initialization, polling, and state composition. No behavior should move into a global store merely to reduce line count.

## Phase Four Composer And Conversation

For `ThreadComposer.vue`, extract presentation-first areas: plan panel, attachment chips, attachment menu, and model/reasoning controls. Keep submission, upload, drag-and-drop, IME, and mention search state in the parent initially.

For `ThreadConversation.vue`, retain existing `ThreadTurn.vue`, reasoning, tool, diff, and file-change components. Target only the remaining message-template branching and render-adaptation helpers. Process-fold algorithm improvements are a separate performance task, not part of this componentization work.

## Verification

For every phase:

1. Add or update the matching manual test document under `tests/` with prerequisites, actions, expected behavior, and cleanup notes.
2. Run `pnpm exec vue-tsc --noEmit` and `pnpm run build`.
3. Verify the changed surface in light and dark themes at desktop and mobile widths when browser verification is available.
4. Audit the changed code path for duplicate requests, blocking work, unbounded rendering, payload changes, and cache invalidation. View-only extraction must not introduce requests or state synchronization.

## Completion Criteria

The initial componentization series is complete when the sidebar has one shared thread-row implementation, Directory Hub tabs are independently owned components, and extracted files preserve existing behavior under typecheck, build, and targeted manual verification.

# Componentization round-67: App.vue sidebar UI-state hook

Refactor of `App.vue` (no user-visible behavior change). The self-contained sidebar UI-state cluster was extracted as a local hook:

**`useSidebarUi.ts`** — `createSidebarUi()` factory (zero injected deps), owning:
- state: `isSidebarCollapsed` (persisted to localStorage `codex-web-local.sidebar-collapsed.v1`), `isAccountsSectionCollapsed` (persisted to `codex-web-local.accounts-section-collapsed.v1`), `sidebarSearchQuery`, `isSidebarSearchVisible`, `sidebarScrollableRef`, `sidebarSearchInputRef`, plus the private `sidebarScrollTop` / `sidebarScrollRestoreRequestId` / `isRestoringSidebarScroll`;
- methods: `setSidebarCollapsed` (records scroll on collapse, persists, restores on expand), `toggleSidebarSearch` / `clearSidebarSearch` / `onSidebarSearchKeydown` (Escape), `onSidebarScroll` (records scroll while open, ignores during restore), `restoreSidebarScrollPosition` (bounded rAF poll with requestId guard), `toggleAccountsSectionCollapsed` (persists).

The `onSidebarScroll` DOM-global check now guards `HTMLElement` existence (same rationale as the file-link context-menu guard) so the hook runs under Vitest's node environment; browser behavior is unchanged.

## Prerequisites / Setup

- App installed and running on the dev server (127.0.0.1:4173).
- Several conversations so the sidebar list scrolls, plus a collapsed-`accounts` preference and a desktop viewport (to see the collapse toggle).

## Actions and Expected Results

### Sidebar collapse + persistence
1. Click the sidebar collapse toggle. Expected: the sidebar collapses; reload the page — it stays collapsed (localStorage persisted).
2. Expand again on a long list, scroll down, collapse, expand. Expected: the sidebar restores the previous scroll position (the recorded `sidebarScrollTop` is re-applied on expand).
3. Collapse while already collapsed (click nothing / repeat toggle). Expected: no-op — the saved preference is not re-written (write only on an actual state change).

### Sidebar search
4. Open the search toggle and type a term. Expected: search bar focuses and the query is used to filter the list.
5. Press Escape. Expected: the search bar closes and the query clears.
6. Clear-search affordance (×). Expected: query empties and the input keeps focus.

### Accounts section collapse
7. Toggle the accounts section in the settings dialog. Expected: it collapses/expands; on reload the preference persists.

## Verification / Cleanup Notes

- No behavior change; guards against extracting the App.vue sidebar UI-state cluster.
- Rollback: covered by `useSidebarUi.test.ts` (9 cases: server-safe defaults, localStorage load of both prefs, setSidebarCollapsed + persistence + idempotency, scroll record + expand restore, search toggle/clear, Escape close/clear + non-Escape ignore, accounts collapse + persistence) plus `vue-tsc` and production build; revert `App.vue`'s `createSidebarUi()` wiring and the `onSidebarScroll` guard if any surface above misbehaves.
- Cleanup: no state mutated on disk; localStorage prefs are app-owned and reversible from the UI.
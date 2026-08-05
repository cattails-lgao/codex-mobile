### Feature: Settings Hooks panel (P2-1)

#### Prerequisites
- App running from this repository with a Codex CLI that exposes `hooks/list` in the method catalog (run `curl http://127.0.0.1:4173/codex-api/meta/methods` and confirm `hooks/list` is listed).
- The working folder has a `~/.codex/hooks.json` (or project `.codex/hooks.json`) with at least one registered hook to see populated rows; an empty hooks file still verifies the empty state.

#### Steps
1. Open the app and click the `Settings` button at the bottom of the sidebar.
2. Locate the `Hooks` section directly under the Accounts section.
3. Verify the section shows `Reload`, and either hook rows (event name, command, enabled/disabled badge) grouped by folder, or `No hooks registered.` when none exist.
4. Click `Reload` and confirm the button is disabled while loading, then re-renders the list.
5. Register or edit a hook in the config file while the panel is open, then trigger it (e.g. run a turn) and confirm the list refreshes after `hook/started`/`hook/completed` notifications without a manual reload.
6. Switch UI language to 简体中文 and confirm the section labels translate (Hooks / 未注册任何 Hooks。 etc.).
7. Repeat steps 2-3 in dark mode and on a 375x812 mobile viewport (expand the sidebar first via the toolbar icon).

#### Expected Results
- Hooks section renders only when `hooks/list` is in the method catalog; otherwise it shows `当前 Codex 版本不支持 Hooks。` (feature-detect degrade).
- Hook rows show event, command, and enabled/disabled state; per-folder grouping is shown when multiple folders register hooks.
- `hook/started` and `hook/completed` notifications trigger a background list refresh.
- Light/dark themes and mobile layout keep the section readable (dark overrides live in `src/style.css`).

#### Rollback/Cleanup
- Remove any test hooks from the hooks config file afterwards; no app state is persisted for this panel.

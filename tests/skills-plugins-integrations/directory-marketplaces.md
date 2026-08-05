### Feature: Directory Marketplaces management (P2-2)

#### Prerequisites
- App running from this repository with a Codex CLI that exposes `marketplace/add`, `marketplace/remove`, `marketplace/upgrade` in the method catalog.
- Network access to a Git remote to fully exercise add (it clones the marketplace source).

#### Steps
1. Open the app and navigate to the Skills Hub (`Skills` sidebar link), then switch to the `Plugins` tab.
2. Verify the `Marketplaces` section renders between the toolbar and the plugin grid, showing `Upgrade all`, the configured marketplace list, and the `Add` URL input.
3. With no marketplaces configured, confirm `No marketplaces configured.` shows.
4. Paste a reachable marketplace Git URL into the input and press Enter or click `Add`; confirm the button shows `Adding...`, a success toast appears, the input clears, and the plugin list refreshes.
5. With a marketplace present, confirm the row shows its display name and path with a `Remove` button; click it and confirm the row disappears after a reload.
6. Click `Upgrade all` and confirm `Upgrading...` state, then a success toast (`Upgraded ...`) or an error toast listing upgrade errors.
7. Verify the section hides entirely on a CLI whose catalog lacks `marketplace/*` methods (feature-detect degrade).
8. Repeat steps 2-6 in dark mode and on a 375x812 mobile viewport.

#### Expected Results
- Marketplace add/remove/upgrade call the RPC directly and reload the plugin list afterwards.
- Each action shows loading state on its own button and disables the others while in flight.
- Failed operations (e.g. unreachable Git URL) surface an error toast and keep the panel usable.
- Light/dark themes keep the section readable.

#### Rollback/Cleanup
- Remove any test marketplace via its `Remove` button afterwards; no app state is persisted for this panel.

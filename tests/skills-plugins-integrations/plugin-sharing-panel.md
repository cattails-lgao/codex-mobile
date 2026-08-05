### Feature: Plugin sharing panel (P2-3)

#### Prerequisites
- App running from this repository with a Codex CLI that exposes `plugin/share/save`, `plugin/share/list`, `plugin/share/delete` in the method catalog.
- At least one installed plugin (install one from the Plugins tab if needed).
- ChatGPT authentication for the remote plugin catalog to fully exercise save/list; without it the panel must degrade with an error message.

#### Steps
1. Open the app, navigate to the Skills Hub (`Skills` sidebar link), and switch to the `Plugins` tab.
2. Open the detail modal of an installed plugin and confirm a `Share` button appears in the footer (it must NOT appear for uninstalled plugins, and must hide entirely on CLIs whose catalog lacks `plugin/share/*`).
3. Click `Share`; confirm the "Plugin shares" panel opens with a loading state, then either the share list or an error message.
4. With remote auth available: click `Share this plugin`, confirm `Sharing...` state, a success toast, and the new share row (with share URL link) appearing.
5. On a share row, click `Checkout` and `Remove` and confirm each shows its own loading state and updates the list.
6. Without remote auth: confirm the panel shows the auth-required error (`chatgpt authentication required...`) and stays usable (Close works).
7. Repeat steps 2-5 in dark mode and on a 375x812 mobile viewport.

#### Expected Results
- Share entry is gated by both `plugin/share/*` feature detection and `plugin.installed`.
- Save/list/delete/checkout call the RPC directly; each action has an in-flight state on its own button.
- Remote-service unavailability (404/502/auth) degrades to an inline error instead of a blank or broken panel.
- Light/dark themes and mobile layout keep the panel readable.

#### Rollback/Cleanup
- Remove any test plugin shares via the `Remove` button and uninstall any test plugins afterwards.

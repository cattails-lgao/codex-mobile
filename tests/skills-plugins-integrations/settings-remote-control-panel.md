### Feature: Settings Remote control panel (P2-4)

#### Prerequisites
- App running from this repository. On CLIs whose method catalog lacks `remoteControl/*`, the panel must degrade; on a CLI that exposes the methods, full management is available.

#### Steps
1. Open the app and click the `Settings` button at the bottom of the sidebar.
2. Locate the `Remote control` section under the Hooks section.
3. On a CLI without `remoteControl/*` methods: confirm the section shows the enable/disable toggle in the disabled state and the message `当前 Codex 版本不支持远程控制。` (feature-detect degrade), and no RPC calls are made.
4. On a CLI with the methods: toggle the switch and confirm the label flips between `Enabled`/`Disabled` and a transient notice appears.
5. With remote control enabled, click `Pair a new device` and confirm a pairing code appears.
6. In `Paired devices`, click `Reload` to refresh the list, then `Revoke` on a device and confirm it is removed.
7. Trigger a `remoteControl/status/changed` notification (e.g. from another client) and confirm the panel refreshes without a manual reload.
8. Repeat steps 2-7 in dark mode and on a 375x812 mobile viewport.

#### Expected Results
- The section is gated by `getMethodCatalog()` feature detection; missing methods show the degrade message instead of failing.
- Toggle/pairing/client actions call the RPC with in-flight states and keep the panel usable on failure.
- `remoteControl/status/changed` notifications refresh the panel.
- Light/dark themes and mobile layout keep the section readable.

#### Rollback/Cleanup
- Disable remote control and revoke any test-paired devices afterwards; no app state is persisted for this panel.

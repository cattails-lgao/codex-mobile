# What To Test

## Skills & Apps Directory

- [ ] Open `#/skills` and verify the `Skills` tab is selected by default.
- [ ] Open `#/skills?tab=plugins` and verify the `Plugins` tab is selected.
- [ ] Click the `Skills` tab from another tab and verify the URL updates to `#/skills?tab=skills`.
- [ ] Verify normal Skills tab navigation lists MCPs without triggering an MCP reload; the top `Refresh` button should be the only explicit reload path.
- [ ] Verify the `Installed skills (...)` section appears below MCPs and contains local installed skills.
- [ ] Verify installed skill cards do not show redundant `Installed`, `Disabled`, or repeated `local` labels.
- [ ] Verify installed skill cards show descriptions parsed from local `SKILL.md` files.
- [ ] Search for `kotlin` in `Find skills` and verify results come from `npx skills find`.
- [ ] Verify installed search results keep registry owner/details and show an `Installed` badge.
- [ ] Open an installed search result and verify the modal switches to the local installed skill with `Uninstall`, `Disable`, `Try it!`, and local content.
- [ ] Verify Find skills result cards do not show the local folder browse icon.
- [ ] Install a not-yet-installed registry skill and verify the install runs noninteractively with `npx skills add <source> --yes --global`.
- [ ] After install, verify the backend returns a non-empty local `SKILL.md` path and the installed list refreshes from local data.
- [ ] Verify failed installs do not show the remote registry card as installed.
- [ ] Verify light theme and dark theme screenshots for the Skills tab and installed-result modal.

## Composio Directory

- [ ] Open the Composio tab and verify unauthenticated, authenticated, and unavailable CLI states show clear actions.
- [ ] Verify Login opens the CLI auth URL in a new browser tab.
- [ ] Verify connector search/list includes expected connectors such as Instagram when available from the CLI/API source.
- [ ] Open a connector detail and verify useful tools, connection state, auth action, dashboard link, and `Try it!` behavior.
- [ ] Verify Composio cards and modals are readable in dark theme.

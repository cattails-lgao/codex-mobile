### Codex.app-style Plugins Directory

#### Feature/Change Name
The `#/skills` route shows a full Skills & Apps directory with Plugins, Apps, Composio, and a Skills tab where an `MCPs(count)` section appears just before `Installed skills (count)`.

#### Prerequisites/Setup
1. Dev server running at `http://127.0.0.1:4173`
2. Codex CLI available in `PATH`
3. Optional: a Codex CLI version with `plugin/list`, `app/list`, and `mcpServerStatus/list` app-server APIs

#### Steps
1. Open `http://127.0.0.1:4173/#/skills`
2. Verify the page title is `Skills & Apps` and the tab row contains `Plugins`, `Apps`, `Composio`, and `Skills`
3. On `Plugins`, verify plugin cards load, the default sort is `Popular`, and `A-Z`, `Date`, and search controls work
4. Open a plugin card when one is available and verify description, capabilities, included apps/skills/MCPs, and install/uninstall or enable/disable actions are visible
5. For an installed plugin with bundled MCP servers, such as Cloudflare, verify each MCP row shows auth status (`Logged in`, `Bearer token`, `Login required`, `Auth unsupported`, or `Status unknown`)
6. If a bundled MCP server shows `Login required`, click `Authenticate` and verify the browser opens the returned MCP OAuth authorization URL
7. Switch to `Apps` and verify app cards load, or the unavailable/empty state appears without breaking the page
8. On `Apps`, verify the default sort control is `Popular`, app icons render, connected apps show `Manage`, and disconnected apps show `Login`
9. Click a disconnected app `Login` button and verify it opens the app login/manage URL
10. Click `Try it!` for a connected and enabled app and verify a new thread opens with an auto-submitted prompt asking what the app can do
11. While the app `Try it!` request is starting, click the button repeatedly and verify only one new thread is created
12. Open an installed/enabled plugin detail, click `Try it!`, and verify a new thread opens with an auto-submitted plugin test prompt
13. Open an installed/enabled skill detail, click `Try it!`, and verify a new thread opens with an auto-submitted skill test prompt and the skill attached
14. Install a plugin whose install response includes `appsNeedingAuth`, and verify the first required app login/manage URL opens automatically
15. Open a plugin whose detail lists a required app that is absent from the Apps catalog for the current account, such as Gmail on an account without Gmail app access, and verify the footer shows a disabled `ChatGPT Plus` action instead of `Install`
16. Switch Apps sorting to `A-Z` and verify apps reorder alphabetically; switch to `Date` and verify app-server catalog order is restored; switch back to `Popular` and verify casual-user relevant apps are prioritized and capped to 100 when no search is active
17. Search Apps and verify matching results are not capped to the Popular top 100 list
18. Switch to `Composio` and verify the workspace summary card shows the current installed Composio CLI login state, or a clear not-installed / not-authenticated message appears
19. If Composio CLI is not installed, click `Install Composio` and verify the app installs the CLI to `~/.composio/composio` using the official Composio installer
20. If Composio is available but not authenticated, click `Login` and verify the app opens a new tab, starts the installed `composio login --no-browser -y`, captures the returned auth URL, and navigates the new tab to that URL
21. Verify Composio connector cards show real connector details such as tool counts, trigger counts, auth mode, and connection state instead of only aggregate totals
22. In Composio search, type `instagram` and verify the Instagram connector appears first when it is returned by the connector source, ahead of description-only matches such as Meta Ads
23. Open a disconnected Composio connector and click `Connect` or `Reconnect`; verify the returned `connect.composio.dev` authorization URL opens
24. Open a connected Composio connector and verify connection rows show account identifiers and statuses such as `Active` or `Expired`
25. Click `Try it!` on a connected or no-auth Composio connector and verify a new thread opens with a Composio-specific prompt and the `composio-cli` skill attached
26. On Composio, verify that if more than one page exists, `Load more` appears and appends additional connectors while keeping prior results visible
27. In Composio search, verify the page state resets (the list returns to the first result page and stale pagination is cleared)
28. Switch to `Skills` and verify the view shows an `MCPs(count)` collapsible section immediately before the `Installed skills (count)` section
29. Expand `MCPs(count)` and verify server cards show auth status and tool/resource counts, or the unavailable/empty state appears without breaking the page
30. Click header `Refresh` while on `Skills` and verify MCP state reloads (it should perform MCP reload behavior on this tab instead of using a separate `Reload MCPs` button)
31. Verify no separate `Reload MCPs` button is shown in the header or inside the MCP section body
32. Verify the `MCPs(count)` section does not show its own search or sort controls
33. Verify MCP cards use the same visual card/grid layout pattern as Installed skills cards (avatar circle, title row, badge, secondary text)
34. Verify the `Installed skills (count)` section below MCPs still supports the existing Skills Hub behavior
35. Verify both light and dark themes render Composio cards and status/detail actions with readable contrast
36. In dark mode, verify MCP cards use the same dark card surface styling as Installed skills cards (not a light/white card)

#### Expected Results
- The directory tabs render without a full-page error
- Plugin/app/Composio API failures are isolated to their tab
- Existing Skills Hub behavior remains available under the `Skills` tab, with MCPs presented just before Installed skills
- App and plugin enable/disable actions update their local card state after a successful config write
- Plugin detail shows bundled MCP login state and can launch MCP OAuth for `notLoggedIn` servers
- Disconnected apps are labeled `Login`; connected apps are labeled `Manage`
- The Composio tab uses the installed Composio CLI, preferring `CODEXUI_COMPOSIO_COMMAND` when set and otherwise `~/.composio/composio` or `composio` on `PATH`
- The Composio install action uses the official installer and produces a working `~/.composio/composio` binary
- The Composio login action opens a new tab from the click, starts the installed `composio login --no-browser -y`, then navigates that tab to the returned auth URL
- Composio connector cards and detail views show concrete connector details, connection rows, and useful tool samples
- Composio search prioritizes exact slug/name matches above connectors that only mention the query in their description
- Unit coverage verifies that Composio exact query matches outrank description-only matches and that gateway connector search sends `query`, `cursor`, and `limit` params expected by the server
- Connected or no-auth Composio connectors expose `Try it!`, creating a new chat with the `composio-cli` skill attached
- Composio pagination supports page-by-page loading with a clear `Load more` path and cursor-based page continuation
- Plugin install opens the first required app login/manage page before falling back to bundled MCP OAuth login
- Plugin install is blocked with `ChatGPT Plus` when the plugin requires an app that is absent from the Apps catalog for the current account
- Connected and enabled apps, plus installed/enabled plugins/skills, expose `Try it!`, creating a new chat with an auto-submitted test prompt
- Repeated `Try it!` clicks during startup are ignored until the first request resolves, so duplicate threads are not created
- Plugins, Apps, and the Skills-tab MCP section default to local popularity-style ordering because app-server does not expose numeric popularity fields
- The Skills tab presents MCPs in the same section style as Installed skills, just above Installed skills, instead of using a separate top-level MCP tab
- `Date` uses the app-server/catalog order as the available freshness proxy because app/plugin/MCP APIs do not expose created or published timestamps
- Popular views show only the top 100 when no search is active; search results can show all matches

#### Rollback/Cleanup
- Re-enable any app or plugin disabled during testing
- Uninstall any plugin installed only for this test

---

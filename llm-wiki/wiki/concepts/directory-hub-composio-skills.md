# Directory Hub, Composio, and Skills Search

This page documents the current Directory Hub behavior under `#/skills`, especially the native Skills tab, Composio connector browsing, and registry-backed Skills search.

## Route Model

- `#/skills` opens the Directory Hub with the `Skills` tab selected by default.
- The active tab is URL-addressable with `?tab=plugins`, `?tab=apps`, `?tab=composio`, or `?tab=skills`.
- The Directory route name remains `Skills`; the inner surface title remains `Skills & Apps`.
- The first-launch Plugins card explicitly opens `?tab=plugins`.

## Skills Tab

The Skills tab is ordered for local use:

1. GitHub Skills Sync controls.
2. Find skills registry search.
3. MCP section.
4. Installed skills section.

Important behavior:

- MCPs appear immediately before installed skills.
- Normal tab navigation only lists MCPs; the top-level `Refresh` button is the explicit MCP reload path.
- Installed skill cards are local-first: no repeated `local`, `Installed`, or `Disabled` labels on the card grid.
- Installed card descriptions are parsed from local `SKILL.md` files.
- Installed entries are built concurrently so description reads do not add one round trip per skill.

## Skills Registry Search

The Find skills panel is backed by the published skills CLI:

- Search runs `npx skills find`.
- Install runs `npx skills add <source> --yes --global`.
- Install success is only valid when a local installed `SKILL.md` path is returned and validates.
- If install does not produce a local path or the post-refresh installed list does not include the skill, the UI treats it as failure.

Search result identity is intentionally hybrid:

- Cards keep registry owner/source details.
- Installed matches get local path/enabled state.
- Opening an installed result switches to the local installed skill detail and actions.
- Search result cards hide the local folder browse icon; local browse remains available in installed skill details.

## Composio

The Composio tab is CLI-backed and should feel like a native Directory section.

- Prefer `npx --yes composio`; fall back to the installed CLI only when needed.
- Login runs `composio login --no-browser -y`.
- The UI opens a browser tab from the click, then navigates it to the CLI auth URL.
- The workspace card shows account/org/backend status.
- Connector cards show real details: tool counts, descriptions, connection status, and auth actions.
- Connector detail shows overview, connections, useful tools, dashboard link, connect/login action, and `Try it!` when usable.

Search ranking has a specific edge-case rule:

- Exact slug/name matches outrank description-only matches.
- Example: searching `instagram` should show the `Instagram` connector before `Meta Ads`, even though Meta Ads mentions Instagram and may have more tools.

## Testing Lessons

Use assertions, not screenshots alone.

Recommended checks:

- `#/skills` defaults to Skills.
- `?tab=` routes to the selected tab.
- Normal Skills navigation does not call MCP reload.
- The refresh button only says `Refreshing...` during explicit manual refresh.
- Installed search results open local detail actions.
- Failed installs do not create installed UI state.
- Composio search sends `query`, preserves pagination params, and ranks exact matches first.
- Light and dark screenshots should include both the Skills page and long installed-skill modal content.

Unit tests now cover:

- Composio exact query ranking over description-only matches.
- Connected Composio connector ordering without a query.
- Gateway query/cursor/limit params for Composio connector search.

## Related Pages

- [Entity: codex-web-local](../entities/codex-web-local.md)
- [Concept: Skills route UI](./skills-route-ui.md)
- [Overview](../overview.md)
- [Source: Directory Hub Composio and Skills Search](../../raw/features/directory-hub-composio-skills-search.md)

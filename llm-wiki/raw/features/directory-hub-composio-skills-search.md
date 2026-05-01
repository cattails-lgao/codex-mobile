# Directory Hub Composio and Skills Search Source

Date: 2026-05-02

## Scope

This source records the Directory Hub work that made `#/skills` a native Skills/Apps surface with:

- a default `Skills` tab,
- MCPs shown immediately before installed skills,
- registry search backed by `npx skills find`,
- registry install backed by `npx skills add <source> --yes --global`,
- Composio connector browsing/auth/detail flows,
- stronger light/dark verification and edge-case tests.

## Skills Tab Behavior

- `#/skills` defaults to the `Skills` tab.
- Other directory tabs are shareable through `?tab=plugins`, `?tab=apps`, `?tab=composio`, and `?tab=skills`.
- The first-launch Plugins card still routes to `?tab=plugins`.
- The top-level `Refresh` button only shows `Refreshing...` for explicit user-triggered refreshes.
- Opening or switching to the Skills tab lists MCPs without forcing an MCP reload; explicit `Refresh` performs the reload behavior.
- MCPs are shown above installed skills and use the same card/grid section style.

## Installed Skills and Registry Search

- The Find skills panel calls `/codex-api/skills-hub/search`, which runs `npx skills find`.
- Installed detection uses the same installed skills source as the Skills Hub list, including RPC/plugin/shared skills.
- Search result cards preserve registry identity while carrying installed local state.
- Opening an installed search result switches to the local installed skill record/content/actions.
- Find skills cards hide the local folder browse affordance to avoid mixing remote registry identity with local-only controls.
- Installed skills cards hide redundant `Installed`, `Disabled`, and repeated `local` labels.
- Installed skills cards show descriptions parsed from local `SKILL.md` files.
- Installed entries are assembled concurrently when reading local descriptions.
- Registry installs run `npx skills add <source> --yes --global`.
- Install success requires a non-empty, validated local `SKILL.md` path; the UI treats missing path or missing post-refresh local skill as failure instead of showing a remote registry card as installed.

## Composio Directory Behavior

- The Composio tab prefers `npx --yes composio` and falls back to the installed CLI only when needed.
- Login uses `composio login --no-browser -y`; the UI opens a browser tab from the click and navigates it to the returned auth URL.
- The Composio workspace card shows current account/org/backend status.
- Connector cards show connector details such as tool counts, auth/connection state, and concrete descriptions.
- Connector details show overview chips, connection rows, useful tools, dashboard action, connect/login action, and `Try it!` where applicable.
- Composio search sends the server query parameter as `query`.
- Search ranking prioritizes exact connector slug/name matches above connectors that only mention the query in their descriptions; this keeps `Instagram` ahead of `Meta Ads` for `instagram`.

## Test Coverage and Artifacts

- Unit coverage was added for Composio connector sorting:
  - exact slug/name query matches outrank description-only matches,
  - connected connectors rank first when no query is active.
- Gateway unit coverage verifies Composio connector search sends `query`, `cursor`, and `limit`.
- Manual/browser verification captured light and dark screenshots for:
  - Skills tab,
  - installed skill modal,
  - Composio connector search/detail.
- Remaining `whatToTest.md` items require environment states that are not always safe to force:
  - unavailable Composio CLI when neither `npx --yes composio` nor installed CLI can run,
  - final login URL navigation in a real unauthenticated browser flow.

## Important Commits

- `d18776b9` - optimized Skills tab default and query-tab routing.
- `1f67ba71` - required local skill path after install.
- `6fa62670` - showed local skill descriptions.
- `21217108` - streamlined Skills tab loading and avoided implicit MCP reload.
- `5cedb0c8` - clarified refresh state and Composio search ranking.
- `3c8e3823` - added Directory edge-case tests.

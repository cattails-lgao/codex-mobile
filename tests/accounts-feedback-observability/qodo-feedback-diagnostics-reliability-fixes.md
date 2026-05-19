### Qodo feedback diagnostics reliability fixes

#### Feature/Change Name
Feedback diagnostics startup hardening, project automation delete failure handling, and coalesced composer overflow measurement.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev --host 127.0.0.1 --port 4173`)
2. At least one sidebar project with a configured project automation
3. Light theme and dark theme both available from the appearance switcher

#### Steps
1. In light theme, temporarily make `DELETE /codex-api/project-automation` fail, for example by stopping the local API bridge or forcing a 500 response in a development proxy.
2. Open the project menu for a project with an automation and click Remove.
3. Confirm the sidebar does not trigger an unhandled promise rejection and shows a small project automation error message.
4. Restore the API bridge and refresh project automations.
5. Confirm the automation chip/server state is reloaded instead of staying optimistically removed.
6. Open the app in an environment where `window.fetch` is missing or read-only and confirm the app still mounts.
7. Trigger a chat send failure and click Send feedback next to the chat error.
8. Confirm Chrome or the OS opens the configured `mailto:` handler with `brutalstrikedevs@gmail.com`, diagnostics, bounded visible page text, and summarized browser/app state prefilled.
9. Type a long draft in the composer and confirm the expand control still appears when the textarea overflows.
10. Switch to dark theme and repeat steps 2-9.

#### Expected Results
- Project automation delete failures are caught, recorded in feedback diagnostics, and surfaced as a visible sidebar error.
- Automation state is restored or reloaded after a failed delete.
- Feedback diagnostics never prevent app startup when fetch cannot be patched.
- Chat and Skills Hub error feedback links use native `mailto:` anchor handling so Chrome can open the configured email handler, while static link `href` values stay minimal until click.
- Feedback email bodies include bounded visible page text alongside diagnostics.
- Feedback email bodies include localStorage/sessionStorage state, route/hash, online state, language, and platform, with sensitive-looking storage values omitted and oversized values summarized.
- Composer overflow checks remain functional without scheduling duplicate same-tick measurements.
- The sidebar error message remains readable in light theme and dark theme.

#### Rollback/Cleanup
- Restore any temporary API failure/proxy change.

---

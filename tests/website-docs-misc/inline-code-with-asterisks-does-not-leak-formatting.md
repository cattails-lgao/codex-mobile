### Inline code with asterisks does not leak formatting

#### Feature/Change Name
Inline code parsing preserves asterisks inside code spans without affecting later prose.

#### Prerequisites/Setup
1. Start local Vite: `pnpm run dev --host 127.0.0.1 --port 4173`.
2. Open a thread that can display a rendered assistant or user message.

#### Steps
1. In light theme, render or send a message containing: ``generated `composio-*.md` connector documentation and starts the thread without attaching `composio-cli` as a skill``.
2. Confirm only `composio-*.md` and `composio-cli` render as bold inline text without a grey box.
3. Confirm `connector documentation and starts the thread without attaching` remains normal prose.
4. Repeat in dark theme and confirm the same two inline-code spans are bold inline text with readable dark contrast.

#### Expected Results
- Asterisks inside inline code do not open italic parsing.
- Inline code does not show a grey box or spill styling over later prose when wrapping on a mobile-width viewport.
- Light and dark themes both keep normal prose and inline code visually distinct.

#### Rollback/Cleanup
- Stop the temporary Vite server if it was only used for this check.
- Remove the temporary isolated `CODEX_HOME` if it is no longer needed.

---

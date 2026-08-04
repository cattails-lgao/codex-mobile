# Composer / Slash Command Menu

## Prerequisites

- A local Codex app-server is running and a thread is selected (or the home route is active).
- App UI language can be English or Simplified Chinese; descriptions render via the existing `useUiLanguage` map.

## Actions

1. Focus the composer input and type `/`.
2. Observe the command menu opens above the input, listing commands grouped by kind label (`Action` / `Prompt` / `Local`): compact, review, rename, archive, fork, new, skills, init, help, mention, diff, clear.
3. Type `/com` and press `ArrowDown` / `ArrowUp`; the highlighted row cycles within the filtered list; press `Escape` to close the menu.
4. Type `/compact` and press `Enter` (or click the row); the menu closes and the context-compaction button enters its pending "Compacting…" state on the sidebar context row.
5. Type `/review` and press `Enter`; the review pane opens.
6. Type `/rename` and press `Enter`; the rename-thread dialog opens with the current thread title prefilled.
7. Type `/archive` and press `Enter`; the current thread archives and the UI switches away.
8. Type `/fork` and press `Enter`; a fork of the current thread is created.
9. Type `/new` and press `Enter`; the UI navigates to a new chat with the current project cwd.
10. Type `/skills` and press `Enter`; the skills route opens.
11. Type `/init` and press `Enter`; the command token is replaced by the AGENTS.md generation prompt text (input stays focused, text remains editable).
12. Type `/clear` and press `Enter`; the input is cleared.
13. Type `/` then press `Enter` while a non-command row (e.g. `/zzz` no match) is highlighted; menu closes without action.
14. Type `/` and then type `@src`; the file-mention popup opens and the slash menu closes (popups are mutually exclusive).
15. Type `@` then backspace and type `/`; the slash menu opens and the file-mention popup closes.
16. Toggle dark theme and repeat step 2; the menu surface uses the dark background and readable text (no light surface remnant).

## Expected Results

- Menu opens/closes with the same keyboard interaction as the `@` file mention popup (Esc, Arrow keys, Enter/Tab, click).
- RPC commands dispatch to the matching existing UI action; prompt commands expand to text in the input; `/clear` empties the input.
- Slash and mention popups never appear at the same time.
- Commands and descriptions match the official Codex TUI command names to avoid a second vocabulary.

## Rollback / Cleanup

- No persistent state is written; close the menu with `Escape` or continue typing.
- Archived/forked threads from steps 7–8 can be removed via the sidebar thread menu.

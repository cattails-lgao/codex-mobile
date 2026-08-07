# Round 16: message visual consistency, thinking blocks, rollback button, and interrupt cleanup

Feature/change: 9 feedback items from the round-16 review — interrupt cleanup after stop, thinking width/alignment, plan popover restyle, thinking block stability, rollback toolbar button, muted command blocks.

**Prerequisites/setup:** dev server running on `127.0.0.1:4173` with a codex app-server behind it; a thread that contains at least one `reasoning` item, one `commandExecution`, one `plan` item, and one user message. Playwright mock harness available at `output/playwright/r21-verify.cjs` (mock thread `r21-diagnose-thread`).

## 1. Stop no longer leaves the interrupted user message in the list

- Prerequisites: a thread whose active turn has a user message but **no** agent output yet (only thinking).
- Actions: send a message, then click **Stop** while it is still thinking.
- Expected:
  - The interrupted user message disappears from the message list (server removes the whole turn; the UI now removes it locally too).
  - The text is restored into the composer input with the sky banner「已停止：消息未提交，已回填到输入框。」.
  - The thinking archive for that turn is removed too (no orphan reasoning block).
- Rollback/cleanup: unit test `interruptSelectedThreadTurn removes the unsubmitted turn locally` locks both branches (unsubmitted turn dropped + composer payload filled; turn with agent output untouched).

## 2. Thinking blocks stay left-aligned and match message width

- Actions: open a thread with multiple reasoning turns (one with ≥2 commands so a Process Fold also exists).
- Expected:
  - Every「Thinking process」block renders flat (not inside the fold); the fold bar shows only commands/tools, e.g.「已处理 · 2 个命令」.
  - The block's left edge aligns with normal message text (same `x`).
  - The live overlay thinking text uses the same max width as message cards (not the full chat column width).
- Verification: `r21-verify.cjs` asserts `reasoning-block` x equals `.message-text` x and fold text never contains「思考」/“Thinking”.

## 3. Plan popover content matches the approval/question panel styling

- Actions: open a thread whose latest plan message is visible, click the plan panel header above the composer.
- Expected:
  - Steps render as cards: `rounded-xl` with a border and white background (zinc-800 in dark).
  - Summary renders as a gray card (`bg-zinc-100`, `bg-zinc-800/70` in dark).
  - The Implement button is a full-width pill (`rounded-full`, 40px tall).
  - Header row keeps `🗒 Plan N/M` with a bottom divider.

## 4. Thinking blocks are stable (no more disappearing)

- Actions: complete a turn that includes thinking, then refresh the page.
- Expected: the archived「Thinking process」block stays in the message list (persisted to `codex-web-local.thread-reasoning.v1`), never hidden by a Process Fold.
- Note: the live "Thinking" preview during generation disappears when the agent starts replying — that is expected; the archived block is the persistent record.

## 5. User-message toolbar shows on hover and reads「回退」

- Actions: hover a user message.
- Expected:
  - The toolbar fades in (previously stuck at `opacity: 0.01` because the scoped `:global(.message-row:hover)` rule was compiled onto `.message-row` itself — the rule now lives in global `style.css`).
  - The first button reads「回退」(Rollback) with a back-arrow icon; clicking it shows「回退到该轮？」confirmation and rolls the thread back to that turn.

## 6. Command blocks are muted

- Actions: look at a completed command work block.
- Expected: no 4px colored left border; a thin 1px zinc border around the whole block, lighter background, neutral step dot with a soft status tint (amber/emerald/rose at reduced saturation), dimmed status text.

## Rollback/cleanup

- Verification commands:
  - `pnpm exec vue-tsc --noEmit`
  - `pnpm exec vitest run` (308 passed, 2 new interrupt tests)
  - `node output/playwright/r21-verify.cjs` (33 assertions, desktop light/dark + H5)
- Screenshots land in `output/playwright/r21-*.png`.

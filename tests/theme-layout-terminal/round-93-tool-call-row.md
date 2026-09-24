### Feature: Tool-call rows — mono command, honest metrics, OK/RUN badge

#### Prerequisites
- Production build served locally (`vite build`, then the packaged CLI on a free port), or the dev server.
- A thread that actually contains command executions and MCP tool calls. The audit thread `01a04679-d12b-7350-b560-9013a9a7dee1` renders 78 command rows and 50 MCP tool rows; the old default audit thread contains none, so nothing would be visible there.
- Both themes reachable (the app follows the system theme, or set the theme explicitly).

#### Steps
1. In the **dark** theme, open the tool-rich thread and scroll to a command row (a card with a dot, a mono command, a size reading and a badge).
2. Compare the row against the pre-round shape: the header used to read "step number + the word *Command* + a localized status label", with the real command visible only after expanding.
3. Expand the row by clicking its header; then collapse it again.
4. Find an MCP tool row (format `server · tool`) and compare its width with a command row.
5. Look for a failed command (`FAIL` badge) and a running one (`RUN`, breathing dot) if the thread has any.
6. Run `node scripts/check-ui-contract.cjs`.
7. Re-run `PROFILE_BASE_URL=<url> node scripts/ui-audit-shots.cjs` then `node scripts/check-token-equivalence.cjs`.
8. Switch to the **light** theme and repeat steps 1–6.

#### Expected Results
- Step 1–2: each command row is a **quiet card** (10px radius, hairline border, `--s2` surface) holding a **status pip**, the **real command in monospace** (truncated), a **byte reading** (`11.2 KB`, mono + tabular numerals) and an **uppercase mono badge** (`OK` / `FAIL` / `EXIT n` / `SKIP` / `STOP`). The pip and the badge share one status colour: green `--ok`, amber `--live`, red `--alert`. No emoji, no `#737373`, no naked amber/emerald/rose classes.
- Step 3: expanding still reveals the dark output block with the full command on top; collapsing costs no vertical space. The localized status text is not lost — it now lives in the row's tooltip / aria-label.
- Step 4: the MCP row is the **same card language** and the **same width** as command rows (706px in the desktop column; before the fix it shrank to fit its content, 216–239px). Its metric is the real `durationMs` (`823ms` / `1.9s`).
- Step 5: `FAIL`/`EXIT n` render in `--alert`, `RUN` in `--live` with a breathing pip plus a 22% halo (still under `prefers-reduced-motion: reduce` the animation is off). Command rows have no duration reading by design — the protocol does not carry one, and the round refused to invent data.
- Step 6 reports **26/26 passed**, including the two new assertions: `工具调用行状态色只用状态 token（amber/emerald/rose 裸类与 #737373 已清）` and `工具调用行命令名 / 读数 / 徽记都用等宽（机器口径）`. The `text-[Npx]` count must still be **147**.
- Step 7 must report **684 of 684 properties byte-identical** against the re-armed baseline. The baseline now includes two tool-thread pages sampling seven tool-row selectors; when this round's change was measured against the pre-round baseline it reported **36 deltas, all on those seven selectors, zero leakage**.
- Step 8: light mode uses its own status values (`--ok #1d7d54`, `--alert #c62b2b`); the card reads as a white surface with a hairline border, nothing unstyled.

#### Rollback/Cleanup
- No cleanup required. A revert is a normal code revert.
- If the card look is rejected (it tensions with the round-16 "de-card" feedback): delete the `rounded-[10px] border border-line-1 bg-s2` declarations on `.work-block` / `.tool-call-block` and the `:hover` / running border rules — the pip, mono command, metric and badge survive as plain rows.

#### Related automation
- `node scripts/check-ui-contract.cjs` — no browser needed; now also gates the tool-row colour and mono rules above.
- `PROFILE_BASE_URL=<url> node scripts/ui-audit-shots.cjs` then `node scripts/check-token-equivalence.cjs` — the audit gains `desktop-dark-tools` / `desktop-light-tools` pages (thread `01a04679…`) and seven tool-row sampling points.
- Local-only probes (`tmp/`, not committed): `tmp/probe-toolrows.cjs` counts rendered rows per thread; `tmp/shoot-toolrows.cjs` takes the per-element evidence crops in both themes.

#### Notes for the next phase (not covered by this test)
- The equivalence gate only samples the **first** row per page, so the badge it records is the `OK` state; `RUN`/`FAIL` badge styles and the new pip/metric elements are watched only by the static contract assertions.
- Command rows show bytes, never a duration: the protocol carries no timing for command executions. Adding one means recording timestamps in the bridge between `inProgress` and `completed` — a feature change, deliberately not done here.
- Readings and badges are 12px (`text-xs`), not the mockup's 11px/10px: the `text-[Npx]` gate. Waits for the typography scale.
- `ToolBatchBlock.vue` (the folded "N tool calls" header, still emoji + zinc classes) and the dark output block (`bg-zinc-900` floor) are untouched — the code-block floor is the next conversation item.
- The typography scale and the light token values remain deferred/undecided as before.

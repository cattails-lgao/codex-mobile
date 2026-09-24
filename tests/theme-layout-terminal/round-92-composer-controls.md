### Feature: Composer controls — model first, secondary switches grouped, one primary button

#### Prerequisites
- Production build served locally (`vite build`, then the packaged CLI on a free port), or the dev server.
- A thread route (`#/thread/<id>`) so the composer's config row is enabled. On the home route the composer has no active thread, so those controls are disabled — that is expected, not a bug.
- Both themes reachable (the app follows the system theme, or set the theme explicitly).

#### Steps
1. In the **dark** theme, open a thread and look at the composer's control row, left to right.
2. Compare the four config controls: the model, the reasoning effort, the collaboration mode, and the approval policy.
3. Open each of the four menus and pick a different value.
4. Click into the textarea and watch the composer's outline; then click away.
5. Type nothing and look at the send button; then type a character and look again.
6. Run `node scripts/check-ui-contract.cjs`.
7. Re-run `PROFILE_BASE_URL=<url> node scripts/ui-audit-shots.cjs` then `node scripts/check-token-equivalence.cjs`.
8. Switch to the **light** theme and repeat steps 1–6.

#### Expected Results
- Step 1–2: the model is **first** among the four, and it is the only one wearing **violet** (`--model`): tinted border, tinted background and a small dot before the name. The other three are neutral **mono chips** (equal-width digits, 6px radius, hairline border, no fill). They must no longer be four identical pills — that is the whole point of this round; before it all four sampled as the same `background` and the same full-pill radius.
- Step 2: the collaboration mode and the approval policy sit inside **one shared hairline box** with a hairline divider between them, i.e. they read as one group rather than two peers of the model chip. They must **not** be hidden behind a "more" menu — grouping here is visual only.
- Step 3: all four still work exactly as before; no item moved into a submenu, and nothing gained an extra click.
- Step 4: the composer shows an **amber focus ring** (`--line-focus`) plus a 3px halo while focused, and returns to a normal hairline when blurred.
- Step 5: with an empty draft the send button is an **outline** (border + muted arrow, no fill); with content it becomes a **filled button in the brightest ink** (`--ink-1`) — not an accent colour. Amber stays reserved for machine state.
- Step 6 reports **24/24 passed**, including the four new assertions: `输入区：模型控件排在协作模式 / 审批策略之前`, `输入区：模型芯片用 --model 标示（不与其余三个中性芯片同款）`, `输入区：发送按钮用最亮墨色（--ink-1）而非强调色`, `输入区：队列态用 --live token（不再是裸 amber-600）`. The light baseline must report **1088** naked palette classes (it was 1107) and `text-[Npx]` must still be **147** — the count is not allowed to grow.
- Step 7 must report **444 of 444 properties byte-identical** against the re-armed baseline. Note the baseline now samples the five composer controls (13 points on a desktop thread page); before this round it sampled only `.thread-composer textarea`, so a change here was invisible to the gate.
- Step 8: light mode has its own `--model` value (`#6d4ad6`) rather than a filter or opacity; nothing looks unstyled.

#### Rollback/Cleanup
- No cleanup required. Both themes are verified, so a revert would be a normal code revert.
- If a future round needs the old appearance back: restore the deleted `:root.dark` composer block in `src/style.css`, restore the `h-8 rounded-full … zinc` rules for `--pill` and the plan/approval triggers, and move `<ThreadComposerModelControls>` back below the two popovers in `src/components/content/ThreadComposer.vue`.

#### Related automation
- `node scripts/check-ui-contract.cjs` — no browser needed. Gates token completeness, "no naked palette class in the dark layer", contrast floors, status-colour legibility, the sidebar-glyph rule, and now the four composer rules above.
- `PROFILE_BASE_URL=<url> node scripts/ui-audit-shots.cjs` then `node scripts/check-token-equivalence.cjs` — captures real pages and diffs computed styles against `docs/ui-audit/current-computed-styles.json`. The audit now waits for the composer's model control to become enabled, so the sampling state is pinned instead of depending on how fast the thread data loaded.
- A local-only crop probe (`tmp/shoot-composer-chips.cjs`, not committed) screenshots just the composer surface in both themes and prints each control's resolved font, size, colour, background, border and radius.

#### Notes for the next phase (not covered by this test)
- The **enabled** state of the send button is not covered by the equivalence gate: sampling happens with an empty draft, so it records the disabled state. Only the static contract assertion (`bg-ink-1`) watches the enabled rule.
- Chips are 12px (`text-xs`), not the mockup's 11px: the contract forbids growing the `text-[Npx]` count, so this waits for the typography scale.
- The secondary group box is 30px tall while the chips are 28px (the group carries 1px top and bottom borders); left unforced on purpose.
- Light-token values are still undecided. That already bit this round: the light `--s3` is `#ffffff`, so a filled `disabled:bg-s3` send button vanished on the white composer — hence the outline treatment.
- The typography scale is still untouched by decision (it lands after the P1 main-interface review).

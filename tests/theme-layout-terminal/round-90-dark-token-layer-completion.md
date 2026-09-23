### Feature: Design tokens reach the component styles too (dark layer complete)

#### Prerequisites
- Production build served locally (`pnpm run build`, then the packaged CLI on a free port), or `pnpm run dev`.
- At least one thread with expanded command/tool rows, so the modal and panel surfaces below are reachable.

#### Steps
1. Switch to the dark theme, then open each of these: a thread conversation (expand a tool call), the Skills Hub detail modal, the project export/ZIP modal, Settings → Accounts, and the App Directory.
2. Look at the surfaces those screens use: modal body, search field, list rows, borders, secondary text (timestamps, counts, hints).
3. Switch to the light theme and walk through the same screens.
4. Run `node scripts/check-ui-contract.cjs`.

#### Expected Results
- Steps 2 and 3 look exactly as they did before this change: this round only renamed color classes that resolve to the identical value, so **neither theme may shift**. Dark is the theme to judge most carefully, because that is the layer that moved.
- Nothing renders as an unstyled or wrong-theme surface (a single missed class in a dark override shows up as one light-colored block inside an otherwise dark panel).
- Step 4 reports **18/18 passed**, the dark-layer assertion says it scanned **56 CSS units** (style.css + every `.vue` `<style>` block, not just `style.css`), and the light baseline is reported as 1112 occurrences.
- For a stronger, mechanical version of step 2/3: `node scripts/check-token-equivalence.cjs` compares computed styles against the pre-change baseline and must report **222 of 222 properties byte-identical**.

#### Rollback/Cleanup
- No cleanup required.

#### Related automation
- `node scripts/check-ui-contract.cjs` — no browser needed; gates "no naked palette class in the dark layer", token completeness, contrast floors, and `@reference` pointing at the project stylesheet.
- `PROFILE_BASE_URL=<url> node scripts/ui-audit-shots.cjs` then `node scripts/check-token-equivalence.cjs` — captures a real page and diffs computed styles against `docs/ui-audit/current-computed-styles.json`.

#### Notes for the next phase (not covered by this test)
- This round deliberately leaves the **light baselines** alone: they are still hardcoded `slate`/`zinc` (1112 occurrences, measured by the contract check). Converting them is not mechanical, because the light token values currently committed in `src/style.css` do **not** equal what light renders today — the palette has to be chosen first, which belongs with the P1 redesign.

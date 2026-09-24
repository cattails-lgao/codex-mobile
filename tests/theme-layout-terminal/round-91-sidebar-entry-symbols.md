### Feature: Sidebar tool entries use distinct glyphs and quiet tiles

#### Prerequisites
- Production build served locally (`vite build`, then the packaged CLI on a free port), or the dev server.
- At least one project with threads so the sidebar tool entries are rendered (they hide when the sidebar is collapsed).
- Both themes reachable (the app follows the system theme, or set the theme explicitly).

#### Steps
1. In the **dark** theme, look at the two sidebar tool entries: **Skills** and **Automations**.
2. Squint, or take a grayscale screenshot of just those two rows.
3. Open `#/skills`, then `#/automations`: check the icon in the page header on each route.
4. Stay on `#/skills` and look at the selected entry's left edge and surface.
5. Hover each entry, then switch to the **light** theme and repeat steps 1–5.
6. Run `node scripts/check-ui-contract.cjs`.

#### Expected Results
- Step 2: the two entries remain tellable apart **with colour removed**. That is the whole point of this round — they used to share one lightning glyph and be separated by emerald vs amber only. Expected glyphs: three stacked lines for Skills, a clock for Automations.
- Each entry carries a **22×22 plate with a 6px radius** and a **15% tint** of the accent (`--ok` / `--live`), not a solid saturated square. The 40×40 solid tiles and the colour-only distinction are the defect being fixed.
- No **gradient** appears on either row in dark mode, and the header icons have **no coloured glow shadow**. Before this round the two rows shared an emerald gradient card and a green border.
- Step 4: the selected row shows a **neutral** 2px rail plus a raised (`--s2`) surface. The rail must never be amber — amber is reserved for "the machine is running".
- Step 5: nothing looks unstyled in light mode; the plates are pale tints there too (light has its own accent values by design, not a filter or opacity).
- Step 6 reports **20/20 passed**, including the two new assertions: `状态色对 s1/s2 ≥3:1（两套主题）` and `技能库与定时任务用不同字形（不能只靠颜色区分）` (which prints the four glyph names). The light baseline is reported as **1107** occurrences and the status-colour count as **245** — both below their baselines.
- For the mechanical version: `node scripts/check-token-equivalence.cjs` must report **288 of 288 properties byte-identical** against the re-armed baseline. Note the baseline now samples `.sidebar-skills-link`, `.sidebar-automations-link-icon` and `.skills-route-header-icon`; before this round it sampled nothing below `.sidebar-root`, so a change here was invisible to the gate.

#### Rollback/Cleanup
- No cleanup required. Both themes are verified, so a revert would be a normal code revert.
- If a future round needs the old appearance back, restore the `:root.dark .sidebar-skills-link` block in `src/style.css` and swap the two icon components back in `src/App.vue`.

#### Related automation
- `node scripts/check-ui-contract.cjs` — no browser needed. Gates token completeness (22 per theme), "no naked palette class in the dark layer", contrast floors, status-colour legibility, and now "the two tool entries must not share a glyph".
- `PROFILE_BASE_URL=<url> node scripts/ui-audit-shots.cjs` then `node scripts/check-token-equivalence.cjs` — captures a real page and diffs computed styles against `docs/ui-audit/current-computed-styles.json`.
- A local-only crop probe (`tmp/shoot-sidebar-tools.cjs`, not committed) renders just those two rows in both themes and prints the plate size, radius and resolved colours.

#### Notes for the next phase (not covered by this test)
- Dark is still the P0-equivalent zinc ladder; the plan's graphite surface values are **not** landed. That switch is not a variable edit: P0 mapped `text-zinc-400/500/600` all onto `ink-4`, while the target `--ink-4` is below AA (2.9:1) and banned for text, so the ink levels have to be re-graded by hand.
- The typography scale is still untouched by decision (it lands after the P1 main-interface review), so the subtitle size on these rows is unchanged.
- `src/components/sidebar/SidebarPrimaryNav.vue` is unreferenced dead code; it was left alone this round.

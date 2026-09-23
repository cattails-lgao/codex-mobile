### Feature: Branch list renders a bounded window and grows on scroll

The right Git panel's branch picker used to mount every ref the bridge returned. A repo with thousands of refs cost a >100 ms main-thread insert and left a ~23 000-node subtree behind, which turned the conversation's own `scrollHeight` reads into ~80 ms forced layouts. The list now renders the first page and extends it as the list is scrolled.

#### Prerequisites
- App reachable (dev on `4173`, or a production build on another port).
- A workspace whose repository exposes **more refs than the page size** (the picker is only exercised by a repo with >100 branches/remote-tracking branches; a repo with a handful of branches shows the normal case).
- The right panel on the **Git** tab (`activeRightPanelTab === 'git'`).

#### Steps
1. Open the app and select a thread from the sidebar so the right panel appears.
2. Wait until the branches section is populated.
3. Count the rendered branch rows: `document.querySelectorAll('ul.rgp-branches > li').length`.
4. Count the document nodes: `document.querySelectorAll('*').length`.
5. Scroll the branches list to the bottom (`ul.rgp-branches` → `scrollTop = scrollHeight`), then re-count the rows.
6. Type `zzz-no-such-branch` into the first `.rgp-search` input, then clear it.
7. Optional automated form: `PROFILE_BASE_URL=http://127.0.0.1:4173 node scripts/check-branch-list-budget.cjs`.

#### Expected Results
- Step 3: **≤ 100** rows rendered, regardless of how many refs the repository has (`ul.rgp-branches` visible height is 224px).
- Step 4: document stays in the low thousands (measured 1 049–1 349 with one thread open), not tens of thousands.
- Step 5: row count grows by one page (100 → 200) and every branch stays reachable by continuing to scroll.
- Step 6: the window resets, so a filtered list starts from the first page again; a query with no match shows the "No branches found." row.
- Selecting a branch, scrolling back to the top, and switching the panel between Git/Files/Git all keep working.
- Opening a thread does **not** move focus into the branch search box — the panel no longer focuses it on mount.
- Step 7: all five checks pass, and a regression that removes the window fails on `rendered branch rows <= 100` and `document nodes <= 4000`.

#### Rollback/Cleanup
- No data is written. Resize the panel or switch tabs to restore the default layout.

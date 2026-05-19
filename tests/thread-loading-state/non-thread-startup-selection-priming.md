### Non-thread startup selection priming

#### Feature/Change Name
Home, skills, and automations startup priming clears the active in-memory selected thread without erasing the persisted selected thread id.

#### Prerequisites/Setup
1. Start local Vite: `pnpm run dev --host 127.0.0.1 --port 4173`.
2. Have at least one existing thread available in the sidebar.

#### Steps
1. In light theme, open a thread route and confirm the thread is selected.
2. Navigate to `http://127.0.0.1:4173/#/`.
3. Refresh the page and confirm the home route does not load skills for the previously selected thread context.
4. Navigate back to the prior thread route and confirm it can still be selected normally.
5. Repeat the home-route refresh in dark theme and confirm no thread-loading overlay remains stuck.

#### Expected Results
- Non-thread routes clear the active selected thread for startup request scoping.
- The persisted selected thread id is not removed by the non-thread startup priming path.
- Light and dark themes both finish loading without duplicate startup warnings.

#### Rollback/Cleanup
- Stop the temporary Vite server if it was only used for this check.

---

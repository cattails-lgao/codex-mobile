### API perf log bodyMB uses one decimal place

#### Feature/Change Name
`[codex-api-perf]` log entries format `bodyMB` with one decimal place instead of four.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev`)
2. A request large enough to trigger `[codex-api-perf]` logging

#### Steps
1. Trigger a `/codex-api/` request that exceeds the perf logging threshold
2. Inspect the server log line that includes `bodyMB=...`

#### Expected Results
- `bodyMB` is formatted with one decimal place, such as `bodyMB=3.4`
- The log does not print extra precision such as `bodyMB=3.4489`

#### Rollback/Cleanup
- None

---

### Qodo provider/auth review fixes

#### Feature/Change Name
OpenRouter community-key classification and stalled thread-resume recovery.

#### Prerequisites/Setup
1. Use an isolated `CODEX_HOME`.
2. Start local Vite: `CODEX_HOME=<temp-home> pnpm run dev --host 127.0.0.1 --port 4173`.
3. Prepare one no-auth session that uses the default OpenRouter community/free-mode state and one session with valid Codex auth copied into the same home.

#### Steps
1. In light theme, switch to OpenRouter without entering a user API key.
2. Confirm the saved free-mode state remains community-backed, then copy Codex auth into the same `CODEX_HOME` and restart.
3. Confirm Codex auth suppresses the community OpenRouter fallback instead of treating it as a custom key.
4. Open an existing thread and simulate or observe a stalled `thread/resume`; after the resume coalescing TTL, retry the thread open.
5. Confirm the retry starts a fresh resume request instead of staying pinned behind the original stalled request.
6. Repeat the visible provider switch and thread-open checks in dark theme and confirm errors, composer controls, and model labels remain readable.

#### Expected Results
- Blank OpenRouter provider saves do not turn remembered community keys into `customKey: true`.
- Explicit user OpenRouter keys and previously custom OpenRouter state remain custom.
- A never-settling `resumeThread()` request cannot permanently block future resume attempts for the same thread.
- Light and dark themes both show readable provider, model, and error/retry surfaces.

#### Rollback/Cleanup
- Stop the temporary Vite server if it was only used for this check.
- Remove the isolated `CODEX_HOME` after verification.

---

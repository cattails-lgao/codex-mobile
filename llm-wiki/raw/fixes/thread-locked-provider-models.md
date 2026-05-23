# Thread-Locked Provider Models

Date: 2026-05-14

Codex Web Local threads should capture their provider at creation time. After a thread exists, its composer model menu and outgoing turns should use that thread provider, even if the global provider in Settings changes later.

This fixes a mixed-state failure where a thread created in no-auth OpenCode Zen fallback could later run after Codex auth was added and combine Zen model state with Codex provider state. The expected behavior is:

- A no-auth Zen thread keeps `opencode-zen` and `big-pickle` models after Codex auth appears.
- A new chat created after Codex auth appears uses the current Codex provider and GPT/Codex models.
- A new chat created after switching Settings to OpenRouter uses OpenRouter models.
- A project can contain Zen, Codex, and OpenRouter threads without stale model menus leaking across previously opened threads.

The client-side source of truth is `useDesktopState`: existing threads resolve model menus from the thread's `modelProvider`, while the new-thread context resolves from the current global provider. The server `/codex-api/provider-models` endpoint can be asked for a specific provider so older Zen threads can still show Zen models when the current global provider is Codex.

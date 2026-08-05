# Composer Realtime Voice Conversation Button

## Prerequisites

- Local Codex app-server running with the `realtime_conversation` feature enabled in `.codex/config.toml` (`[features] realtime_conversation = true`).
- A real thread is selected in the sidebar. On the home route (no thread yet) the voice button must be disabled with the "Start a conversation before using voice" tooltip.
- Browser with `getUserMedia` support; the app uses the Codex app-server realtime protocol (`thread/realtime/start` / `appendAudio` / `stop` / `listVoices`).

## Actions

1. On the home route (no thread selected), open the composer and inspect the voice button (lightning bolt icon). Verify it is disabled and its tooltip reads "Start a conversation before using voice".
2. Start a new thread or open an existing one so the composer has a real thread id; the voice button becomes enabled with tooltip "Voice conversation".
3. Click the voice button. Expect a bubble to appear above the actions row: title "Connecting voice..." (or "Voice conversation" once started), a stop button, and a "Listening..." placeholder while no transcript has arrived.
4. Speak into the microphone; transcript parts appear in the bubble as `You: ...` / `Codex: ...` lines (role label localized via `useUiLanguage`).
5. After an assistant turn completes, the audio response plays back through the speakers (output modality audio).
6. Click the stop button in the bubble head (or the same voice button, which now shows a stop icon); the bubble disappears and the session ends.
7. During an active voice session, verify the dictation (microphone) button is hidden and cannot be toggled into conflict.
8. Toggle dark theme and repeat steps 2–6; the voice button, active state (sky accent) and bubble use dark surfaces with readable text (no light remnant).

## Expected Results

- Voice button disabled until a real thread exists; never attempts `thread/realtime/start` with the `__new-thread__` placeholder id.
- Clicking starts a realtime session against the selected thread id (observe `thread/realtime/start` in dev-server logs), button gains the `thread-composer-realtime--active` class, bubble becomes visible.
- Transcript deltas accumulate per role; `transcript/done` replaces the delta text with the final text.
- Stop sends `thread/realtime/stop`, hides the bubble, and returns the button to the idle state.
- Notifications from other threads are ignored.

## Rollback / Cleanup

- Stop the voice session with the stop button before leaving the thread.
- No persistent state is written; a stopped session leaves no pending RPC on the app-server.

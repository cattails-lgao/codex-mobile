# Tests

This file tracks manual regression and feature verification steps.

## Template

### Feature: <name>

#### Prerequisites
- <required setup>

#### Steps
1. <action>
2. <action>

#### Expected Results
- <result>

#### Rollback/Cleanup
- <cleanup action, if any>

### Feature: Telegram bot token stored in dedicated global file

#### Prerequisites
- App server is running from this repository.
- A valid Telegram bot token is available.
- Access to `~/.codex/` on the host machine.

#### Steps
1. In the app UI, open Telegram connection and submit a bot token.
2. Verify file `~/.codex/telegram-bridge.json` exists.
3. Open `~/.codex/telegram-bridge.json` and confirm it contains a `botToken` field.
4. Restart the app server and call Telegram status endpoint from UI to confirm it still reports configured.

#### Expected Results
- Telegram token is persisted in `~/.codex/telegram-bridge.json`.
- Telegram bridge remains configured after restart.

#### Rollback/Cleanup
- Remove `~/.codex/telegram-bridge.json` to clear saved Telegram token.

### Feature: Telegram chatIds persisted for bot DM sending

#### Prerequisites
- App server is running from this repository.
- Telegram bot already configured in the app.
- Access to `~/.codex/telegram-bridge.json`.

#### Steps
1. Send `/start` to the Telegram bot from your DM.
2. Wait for the app to process the update, then open `~/.codex/telegram-bridge.json`.
3. Confirm `chatIds` contains your DM chat id as the first element.
4. In the app, reconnect Telegram bot with the same token.
5. Re-open `~/.codex/telegram-bridge.json` and confirm `chatIds` remains present.

#### Expected Results
- `chatIds` is written after Telegram DM activity.
- `chatIds` persists across bot reconfiguration.
- `botToken` and `chatIds` are both present in `~/.codex/telegram-bridge.json`.

#### Rollback/Cleanup
- Remove `chatIds` or delete `~/.codex/telegram-bridge.json` to clear persisted chat targets.

### Feature: PR20 composer attachment audit fixes

#### Prerequisites
- App server is running from this repository.
- A thread with an enabled composer is open.
- One image file and one non-image file are available for drag-and-drop tests.
- Clipboard content that includes both plain text and an image is available.
- A way to hold or fail `/codex-api/upload-file` requests is available, such as browser network tools, a proxy, or a backend breakpoint.

#### Steps
1. Start dragging a file over the composer until the drop overlay appears, then move the pointer outside the window and release without dropping on the composer.
2. Drag one file onto the composer and wait for it to finish attaching.
3. Copy clipboard content that includes both plain text and an image, then paste it into the composer with `Ctrl+V`.
4. Start a multi-file attachment batch with at least two files, then make one upload fail immediately or hold one `/codex-api/upload-file` request open long enough to hit the 60 second timeout while another file succeeds.
5. After the failed batch settles, attach one additional valid file to confirm a new batch still works.

#### Expected Results
- The drag overlay disappears after the cancelled drag and does not stay stuck on the composer.
- A normal file drop still attaches the file successfully.
- Mixed paste keeps the plain text in the textarea and also adds the pasted image attachment.
- Failed or timed-out uploads stop showing as pending, submit becomes available again after all attachment work settles, and the composer shows a mixed-result message such as `1 attached, 1 failed`.
- A follow-up attachment batch can still complete normally after a previous failure summary.

#### Rollback/Cleanup
- Turn off any network blocking, proxy rule, or backend breakpoint used to simulate the failure.
- Remove any temporary attachments from the composer before continuing other tests.
- Stop the app server when finished.

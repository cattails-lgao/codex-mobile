### Projectless new chat folder collisions

#### Feature/Change Name
Projectless new chats continue to create folders after repeated identical first messages.

#### Prerequisites/Setup
1. Use an isolated `CODEX_HOME`.
2. Start local Vite: `CODEX_HOME=<temp-home> pnpm run dev --host 127.0.0.1 --port 4173`.
3. Ensure `~/Documents/Codex/<today>/` already contains many folders for the same prompt slug, for example `hi`, `hi-2`, through `hi-100`.

#### Steps
1. In light theme, open `http://127.0.0.1:4173/#/`.
2. Start a projectless new chat with the message `hi`.
3. Confirm the app creates a new folder under `~/Documents/Codex/<today>/` and opens the new thread without showing `Unable to create a unique new chat folder`.
4. Confirm the created folder keeps the prompt slug and includes a unique timestamp/random suffix after the readable collision range is exhausted.
5. Repeat in dark theme and confirm the new thread opens with readable composer and conversation surfaces.

#### Expected Results
- New projectless chats do not fail after common prompts exhaust the readable sequential suffix range.
- The app preserves readable folder names for early collisions and switches to unique suffixes for later collisions.
- Light and dark theme new-chat and conversation surfaces remain readable.

#### Rollback/Cleanup
- Stop the temporary Vite server if it was only used for this check.
- Remove any temporary collision folders created under `~/Documents/Codex/<today>/` if they are no longer needed.

---

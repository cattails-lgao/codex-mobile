### OpenRouter API format toggle (Responses vs Completions)

#### Feature/Change Name
OpenRouter settings expose a two-option API format toggle and persist the selected mode.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev`)
2. Open Settings panel
3. Select provider `OpenRouter`
4. OpenRouter key configured (community or custom key)

#### Steps
1. In OpenRouter settings, find `API format` toggle
2. Click `Completions`
3. Send `hi` in a thread and wait for response
4. Re-open Settings and confirm `Completions` remains selected
5. Click `Responses`
6. Send `hi` again and wait for response
7. Re-open Settings and confirm `Responses` remains selected

#### Expected Results
- OpenRouter API format control is a segmented toggle with `Responses` and `Completions`
- Both modes save successfully without provider switch errors
- Sending `hi` works in both modes (assistant reply, no `invalid_prompt` error block)
- Selected mode persists in status after refresh/reload

#### Rollback/Cleanup
- Leave OpenRouter on the preferred API format

---

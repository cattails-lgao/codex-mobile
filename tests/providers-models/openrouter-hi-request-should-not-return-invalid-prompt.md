### OpenRouter "hi" request should not return invalid_prompt

#### Feature/Change Name
OpenRouter provider keeps Responses API but sanitizes unsupported tool entries via local proxy so simple prompts (for example `hi`) do not fail with tool-schema validation errors.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev`)
2. OpenRouter provider selected in Settings
3. Valid OpenRouter API key configured (custom key or community key)
4. Any OpenRouter model selected

#### Steps
1. Open any thread
2. Send `hi`
3. Wait for assistant output to complete
4. Check the response area for any JSON error block mentioning `invalid_prompt` or `Invalid Responses API request`

#### Expected Results
- Assistant returns a normal text reply to `hi`
- No `invalid_prompt` error JSON is shown in the message stream
- No message about invalid tool discriminator/type appears

#### Rollback/Cleanup
- Switch provider back to previous setting if needed

---

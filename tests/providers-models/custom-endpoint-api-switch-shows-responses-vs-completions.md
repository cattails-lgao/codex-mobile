### Custom Endpoint API switch shows Responses vs Completions

#### Feature/Change Name
Custom endpoint settings present an API format switch with `Responses API` and `Completions API` options.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev`)
2. Open Settings panel
3. Select provider `Custom endpoint`

#### Steps
1. In Custom endpoint settings, locate `API format` dropdown
2. Open the dropdown
3. Verify available options
4. Select `Completions API`
5. Select `Responses API`

#### Expected Results
- Dropdown options are exactly `Responses API` and `Completions API`
- Selecting either option updates the visible selected value correctly

#### Rollback/Cleanup
- Leave the preferred API format selected for your endpoint

---

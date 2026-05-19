### Custom Endpoint API format uses segmented toggle control

#### Feature/Change Name
Custom endpoint API format is presented as a two-button toggle (`Responses` / `Completions`) instead of a dropdown.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev`)
2. Open Settings panel
3. Select provider `Custom endpoint`

#### Steps
1. Locate `API format` in Custom endpoint settings
2. Click `Completions`
3. Confirm the `Completions` button becomes active
4. Click `Responses`
5. Confirm the `Responses` button becomes active
6. In dark mode, verify active/inactive contrast remains readable

#### Expected Results
- API format control is a segmented two-button toggle
- Exactly two choices are available: `Responses` and `Completions`
- Active option is visually highlighted and switches immediately on click
- Control remains readable in both light and dark themes

#### Rollback/Cleanup
- Keep the desired API format selected

---

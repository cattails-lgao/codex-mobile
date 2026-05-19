### Startup welcome log uses repository GitHub URL

#### Feature/Change Name
Remove the legacy npm package reference from the startup welcome log and point users to the upstream GitHub repository.

#### Prerequisites/Setup
1. Run the app from this repository.

#### Steps
1. Start the app (for example via `pnpm run dev`).
2. Open the browser devtools console.
3. Locate the startup welcome message.

#### Expected Results
- The welcome log points to `https://github.com/friuns2/codexUI`.
- The welcome log does not contain the legacy npm package URL.

#### Rollback/Cleanup
- None

---

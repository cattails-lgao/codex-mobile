### Home route no longer crashes on dev startup

#### Feature/Change Name
Keep the home route mount path working in dev mode.

#### Prerequisites/Setup
1. Run the app from this repository with `npm run dev`.

#### Steps
1. Open `http://localhost:5173/#/`.
2. Wait for the app shell to finish loading.
3. Open the browser devtools console.

#### Expected Results
- The home screen renders instead of a black screen.
- The console does not show an app setup `ReferenceError` during initial mount.

#### Rollback/Cleanup
- None

---

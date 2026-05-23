### Composio logged-out connector preview

#### Feature/Change Name
Logged-out Composio tab shows a promotional connector preview with example integrations and clear login/dashboard actions.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev --host 127.0.0.1 --port 4173`)
2. Composio CLI installed
3. Composio CLI logged out (`~/.composio/composio logout`)
4. Light theme and dark theme both available from the appearance switcher

#### Steps
1. In light theme, open the Directory page and switch to the Composio tab.
2. Confirm the logged-out state shows the connector catalog preview hero instead of a plain empty message.
3. Confirm example connector cards are visible for Gmail, Google Calendar, Reddit, YouTube, Google Drive, and X.
4. Type `reddit` in the Composio search box and confirm the preview cards filter to matching example content.
5. Confirm `Login to Composio` starts the CLI login flow and `Open dashboard` opens the Composio dashboard URL.
6. Switch to dark theme and repeat steps 1-4.

#### Expected Results
- Logged-out users see a richer preview of likely Composio connector value without requiring live catalog data.
- The preview does not claim the example cards are connected; cards are labeled `Preview`.
- Search filters the preview cards while logged out.
- Login and dashboard actions remain available.
- The hero, cards, text, badges, and buttons remain readable in light and dark themes.

#### Rollback/Cleanup
- Re-login to Composio if needed with `~/.composio/composio login --no-browser -y`.

---

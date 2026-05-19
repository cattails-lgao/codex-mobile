### First-launch home card for Plugins and Apps

#### Feature/Change Name
The home route shows a dismissible first-launch card that introduces Plugins and Apps and opens the existing Skills & Apps directory on the Plugins tab.

#### Prerequisites/Setup
1. Dev server running at `http://127.0.0.1:4173`
2. Codex global-state preference `first-launch-plugins-card-dismissed` removed or set to `false` before the first check
3. App loaded on the home/new-thread route

#### Steps
1. Open the app on the home route with the local storage key removed
2. Verify the home screen shows a card with the heading `Plugins are here`
3. Verify the body copy mentions app examples such as Gmail and Calendar
4. Click `Explore Plugins & Apps`
5. Verify the app navigates to the `#/skills` route and the `Plugins` tab is active
6. Return to the home route and verify the card does not reappear
7. Remove the local storage key again, reload the home route, and click `Dismiss`
8. Reload the home route once more

#### Expected Results
- The card appears only when the server-backed dismissal preference is unset or `false`
- The primary CTA hides the card and opens the Skills & Apps directory
- The directory opens with `Plugins` selected by default
- Dismissing the card hides it immediately and keeps it hidden after reload

#### Rollback/Cleanup
- Remove or set `first-launch-plugins-card-dismissed` to `false` in Codex global state if you want to see the card again

---

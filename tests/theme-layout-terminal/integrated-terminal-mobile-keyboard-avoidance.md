### Integrated terminal mobile keyboard avoidance

#### Feature/Change Name
The integrated terminal stays inside the visible viewport when the mobile virtual keyboard opens.

#### Prerequisites/Setup
1. Dev server running on a phone-accessible URL
2. Open a thread or new-chat screen with a selected project folder
3. Integrated terminal available from the header terminal button

#### Steps
1. Open the terminal drawer
2. Tap inside the xterm terminal so the mobile keyboard opens
3. Type `echo terminal-keyboard-ok`
4. Rotate or resize the browser while the keyboard is still open
5. Repeat on a wide/tablet layout where the sidebar remains visible
6. Hide the keyboard, then tap the terminal again

#### Expected Results
- The terminal panel resizes into the visual viewport instead of being covered by the keyboard
- The xterm prompt and typed command remain visible above the keyboard
- The composer/terminal stack stays compact without overlapping the header or conversation
- On wide/tablet layouts, terminal focus still activates the protected keyboard layout even when the mobile breakpoint is not active
- The terminal remains usable after resize/orientation changes

#### Rollback/Cleanup
- Close the terminal tab if the test created a shell session that should not remain running

---

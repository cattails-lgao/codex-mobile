### Terminal focus does not fullscreen panel

#### Feature/Change Name
Terminal focus on mobile keeps the terminal as a bottom panel instead of expanding it to full screen.

#### Prerequisites/Setup
1. Dev server running at `http://127.0.0.1:4173`
2. A thread or new-chat project with the terminal toggle available
3. Mobile viewport or Android device browser

#### Steps
1. Open a thread or new chat with a valid project path
2. Tap the terminal toggle
3. Tap inside the terminal area
4. If the virtual keyboard appears, keep focus in the terminal
5. Hide and reopen the terminal

#### Expected Results
- Terminal remains a bottom panel and does not take over the full viewport
- Conversation/new-chat content is not forcibly hidden by terminal focus
- Composer keeps its normal compact placement instead of stretching above the terminal
- Terminal can still fit within the available viewport when the keyboard changes size

#### Rollback/Cleanup
- Close the terminal panel

---

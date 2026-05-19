### Sidebar thread row edge click selects thread

#### Feature/Change Name
Thread rows now select when clicking anywhere on the highlighted row area (including left/right edge/time area), while pin/menu buttons keep their own actions.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev`)
2. Sidebar contains multiple threads
3. At least one thread has visible time text on the right

#### Steps
1. Hover a thread row and confirm the row highlight appears
2. Click near the left edge (outside the title text and not on pin icon)
3. Click near the right edge/time area (outside the menu button)
4. Click the thread title/body area
5. Click the pin button and menu button to verify their behavior

#### Expected Results
- Steps 2, 3, and 4 all select/open the clicked thread
- Hover highlight and click target area now match user expectations
- Pin button toggles pin state without selecting due to event bubbling
- Menu button opens thread menu without selecting due to event bubbling

#### Rollback/Cleanup
- None

---

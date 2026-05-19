### Automation editor scrolls on small viewports

#### Feature/Change Name
Automation editor small-device overflow handling.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev --host 127.0.0.1 --port 4173`)
2. At least one thread or project automation exists, or create one from a thread/project menu.
3. Browser viewport set to a small device size such as 375x667.

#### Steps
1. In light theme, open a thread or project menu and choose `Manage automations...`.
2. Confirm the `Edit automation` dialog opens inside the viewport and can be vertically scrolled.
3. Confirm `Run now` when available, `Remove`, `Cancel`, and `Save` remain visible at the bottom before scrolling.
4. Scroll through the dialog and confirm the same bottom actions stay visible while the form content moves behind them.
5. Confirm the name input, prompt textarea, schedule controls, status select, notices, and error text do not overlap while scrolling.
6. Switch to dark theme and repeat steps 1-5.

#### Expected Results
- The automation editor does not extend offscreen without a way to reach lower controls on small-height devices.
- Vertical scrolling stays inside the modal, with the page behind the overlay remaining fixed.
- The automation editor action row remains sticky and usable while the form content scrolls.
- Light and dark theme automation editor controls remain readable and usable.

#### Rollback/Cleanup
- Remove any temporary test automation from the automation dialog if one was created for this test.

---

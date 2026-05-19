### Feature: Skills Hub local-only installed skills

#### Prerequisites
- App is running from this repository.
- Open the `Skills Hub` view.

#### Steps
1. Open `Skills Hub`.
2. Confirm the page shows only locally installed skills.
3. Confirm there is no remote skill count such as `6818 skills`.
4. Confirm there are no remote browse cards from the OpenClaw catalog.

#### Expected Results
- Skills Hub does not fetch or display the OpenClaw remote skills catalog.
- Only locally installed skills are shown.
- No remote total-count badge is rendered.

#### Rollback/Cleanup
- None.

---

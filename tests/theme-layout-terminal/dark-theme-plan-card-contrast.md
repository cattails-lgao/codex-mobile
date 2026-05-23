### Dark theme plan card contrast

#### Feature/Change Name
Plan cards in dark mode keep readable contrast and a lighter surface than the surrounding page background, including the `Implement plan` action.

#### Prerequisites/Setup
1. Dev server running at `http://127.0.0.1:4173`
2. A thread contains a visible plan card
3. Appearance is set to `Dark`

#### Steps
1. Open a thread containing a plan card in dark mode
2. Inspect the card background, title, explanation text, headings, lists, inline code, and blockquote styling
3. Verify the `Implement plan` button is readable and visually distinct
4. Hover the `Implement plan` button and confirm the hover state remains visible

#### Expected Results
- The plan card surface is distinguishable from the page background without looking crushed into near-black
- Plan text and headings stay readable in dark mode
- Inline code, file links, and blockquotes keep enough contrast to scan comfortably
- The `Implement plan` button remains readable and clickable in dark mode

#### Rollback/Cleanup
- Reset appearance to the previous user preference

---

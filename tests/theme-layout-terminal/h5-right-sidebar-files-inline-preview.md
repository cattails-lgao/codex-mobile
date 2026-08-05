# H5 Right-Sidebar Compatibility and Inline Image Preview in the Files Tab

Round-7 work: the right-side panel now slides in correctly on H5 viewports (Tailwind v4 `translate` property fix), and image files in the Files tab preview inline inside the tab instead of opening the preview modal.

## Feature: Right-side panel opens on H5 (mobile) viewports

#### Prerequisites
- Dev server at `127.0.0.1:4173`
- A thread with a workspace (so the right panel tabs are available)
- Mobile viewport (375x812)

#### Steps
1. Open a thread, then tap the right-panel toggle (top-right) so the panel opens on mobile.
2. Confirm the panel slides in from the right and is fully visible (not stuck off-screen).
3. Tap the toggle again and confirm it slides out.
4. Repeat on a desktop viewport (1440x900) to confirm no regression.

#### Expected Results
- On H5 the panel becomes visible (previous bug: it stayed at `translate: 100%` off-screen because a `transform` override could not beat Tailwind v4's CSS `translate` property).
- Toggle in/out works both ways; dark theme renders correctly.

#### Rollback/Cleanup
- None required.

## Feature: Image files preview inline in the Files tab (no modal)

#### Prerequisites
- A thread whose workspace contains at least one image file (`.png`, `.jpg`, `.svg`, `.webp`, …)

#### Steps
1. Open the Files tab in the right panel.
2. Locate an image file in the list and click it.
3. Confirm the image renders inside the tab (`.rfp-inline-preview` with a header and close button), not in a modal.
4. Click the close button and confirm the list is shown again.
5. Click a non-image file (e.g. `.ts`, `.md`) and confirm it still opens the existing `FilePreviewModal`.

#### Expected Results
- Image files preview inline; non-image files keep the modal behavior.
- Dark theme renders the inline preview correctly.

#### Rollback/Cleanup
- None required.

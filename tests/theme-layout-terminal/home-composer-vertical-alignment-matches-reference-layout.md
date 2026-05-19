### Feature: Home composer vertical alignment matches reference layout

#### Prerequisites
- Start the app from this repository (`pnpm run dev`).
- Open the `New thread` (home) screen with a selected folder/project.
- Ensure desktop viewport width (for example >= 1280px).

#### Steps
1. Open the home screen and observe the hero block (`Let's build`) and composer placement.
2. Confirm the hero/settings block is vertically centered within the available content area.
3. Confirm the message composer sits in the lower area of the content column (not immediately below top content).
4. Resize window height taller/shorter and re-check vertical placement.
5. Open any thread route and verify thread composer layout remains unchanged.

#### Expected Results
- Home hero block is centered again (not top-anchored).
- Home composer aligns toward the bottom region similar to the reference screenshot.
- Resizing preserves the intended centered-hero + lower-composer structure.
- Thread route composer behavior is unchanged.

#### Rollback/Cleanup
- Revert the `.new-thread-empty` style in [src/App.vue](../../src/App.vue).

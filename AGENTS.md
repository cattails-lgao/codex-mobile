# AGENTS.md

## Completion Verification Requirement

- After completing a task that changes behavior or UI, always run a Playwright verification in headless mode.
- Before taking any screenshot, wait a few seconds to ensure the UI has fully loaded.
- Always capture a screenshot of the changed result and display that screenshot in chat when reporting completion.

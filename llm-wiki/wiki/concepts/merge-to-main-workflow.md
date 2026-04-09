# Concept: Merge-to-main workflow

## Definition
A disciplined flow for integrating feature branches into local `main` with explicit conflict resolution and verification.

## Pattern in this project
- Use `--no-ff` merges for explicit integration points.
- Resolve conflicts manually per file (avoid blanket ours/theirs).
- Run focused verification (`build:frontend` and/or `build:cli`) before finalizing.
- Push `main` after successful merge.

## Why it matters
This reduces silent regressions and preserves auditability for frequent branch sync operations.

## Source links
- [Project entity](../entities/codex-web-local.md)
- [Source snapshot](../../raw/projects/codex-web-local.md)

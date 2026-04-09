# LLM Wiki Schema

This directory is a persistent wiki maintained by an LLM agent.

## Structure
- `raw/`: immutable source notes and captured material.
- `wiki/`: synthesized, interlinked markdown pages.
- `wiki/index.md`: catalog of pages.
- `wiki/log.md`: append-only operation log.

## Conventions
- Never edit files under `raw/` after creation.
- Prefer updating existing pages over creating duplicates.
- Add wiki links using relative markdown links.
- Keep factual claims tied to one or more source files in `raw/`.

## Operations
- Ingest:
  1. Add a source under `raw/`.
  2. Create or update topic/entity pages under `wiki/`.
  3. Update `wiki/index.md`.
  4. Append one entry in `wiki/log.md`.
- Query:
  1. Read `wiki/index.md` first.
  2. Read relevant linked pages.
  3. Synthesize answer and optionally file it back as a page.
- Lint:
  1. Check for orphan pages.
  2. Check for stale or contradictory claims.
  3. Add follow-up questions to the log.

# Source: codex-web-local project snapshot

Date: 2026-04-10
Source type: local repository snapshot
Path: /Users/igor/Git-projects/codex-web-local

## Core facts
- Project name: `codexapp`
- Description: lightweight web interface on top of Codex app-server for browser remote access.
- Main stack: Vue 3 + TypeScript + Vite + Express.
- Package manager: pnpm.
- CLI build: tsup (`dist-cli/index.js`).

## Key scripts
- `pnpm run dev`
- `pnpm run build:frontend`
- `pnpm run build:cli`
- `pnpm run build`

## Notes
- Repository workflow heavily uses merge-to-main with explicit conflict handling.
- `tests.md` is used as an append-only manual verification plan.

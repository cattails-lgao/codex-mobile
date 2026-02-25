# AGENTS.md
This file provides guidance to agents when working with code in this repository.

## Build, Run, and Validation Commands

- Install dependencies: `npm ci`
- Frontend dev server (Vite): `npm run dev`
- Build frontend only (includes typecheck): `npm run build:frontend`
- Build CLI bundle only: `npm run build:cli`
- Full build (frontend + CLI): `npm run build`
- Preview built frontend: `npm run preview`

### Single test / full test suite

- No test runner or test scripts are currently defined in `package.json`.
- No repository-local Jest/Vitest/Playwright test config was detected.

### Lint / formatting

- No lint or formatting scripts/config files were detected (`eslint`/`prettier` configs are not present).
- Use TypeScript checks via: `npm run build:frontend` (runs `vue-tsc --noEmit`) and `npm run build`.

### Useful one-liners

- Rebuild everything after changes: `npm run build`
- Run CLI locally from source output: `node dist-cli/index.js --help`
- Run CLI with explicit settings: `node dist-cli/index.js --port 3000 --password my-secret`
- Run published-style CLI without install: `npx codex-web-local --help`

## Project Overview

- Purpose: a lightweight web UI for Codex app-server that mirrors desktop-like thread workflows and allows browser-based remote access.
- Stack: Vue 3, Vue Router 4, Vite 6, Tailwind CSS v4 (`@tailwindcss/vite`), TypeScript 5 (strict), Node.js >= 18, Express 5, Commander 13, tsup.

### Architecture (inferred from source)

- Single-page Vue app in `src/`.
- Vite dev server includes a custom bridge middleware (`createCodexBridgeMiddleware`) to proxy/bridge Codex app-server communication.
- Production/CLI path serves built SPA from `dist/` and mounts the same bridge middleware in Express.
- State-heavy UI logic is centralized in composables (`src/composables/useDesktopState.ts`) and API gateway modules under `src/api/`.

## Folder Structure

- `src/main.ts`: Vue app bootstrap.
- `src/App.vue`: top-level layout/composition, route-aware content, sidebar/composer orchestration.
- `src/router/`: route definitions (`/`, `/thread/:threadId`, fallback redirects).
- `src/components/`: UI components (`content/`, `sidebar/`, `layout/`, `icons/`).
- `src/composables/`: shared reactive state and workflow logic (`useDesktopState`).
- `src/api/`: gateway/RPC clients, DTOs, normalizers, error mapping.
- `src/server/`: Express server, auth middleware, Codex bridge middleware.
- `src/cli/`: CLI entrypoint and server startup wiring.
- `documentation/`: app-server protocol docs and generated schemas (JSON/TypeScript).
- `dist/`, `dist-cli/`: build outputs (generated).

## Coding Style and Conventions

- TypeScript strict mode is enabled; preserve explicit typing and runtime guards used across API/state layers.
- Vue uses `<script setup lang="ts">` and Composition API.
- Current codebase uses mostly single quotes and semicolons sparingly; follow local file style when editing.
- Prefer small pure helpers for normalization/validation (pattern seen in `useDesktopState.ts` and API normalizers).
- Keep browser-only APIs guarded (`if (typeof window === 'undefined')`) where SSR/non-browser execution may happen.

## Gotchas and Anti-Patterns to Avoid

- Do not bypass existing normalization layers in `src/api/normalizers/`; UI expects normalized shapes.
- Preserve localStorage key compatibility in `useDesktopState.ts`; changing key names breaks persisted UI state.
- In dev mode, keep Vite watch ignore patterns intact (`.omx`, `.cursor`, `.playwright-cli`, `dist`, `dist-cli`) to avoid noisy rebuild loops.
- In server code, middleware order matters: auth -> Codex bridge -> static assets -> SPA fallback.
- Keep CLI/server shutdown handling intact (`SIGINT`/`SIGTERM` with bridge disposal).

## Useful Workflows

- Typical local loop:
1. `npm ci`
2. `npm run dev`
3. Make changes in `src/`
4. Validate with `npm run build`

- Validate CLI path before publishing:
1. `npm run build`
2. `node dist-cli/index.js --help`
3. `node dist-cli/index.js --port 3000 --no-password`

- If changing bridge/server behavior, validate both execution paths:
1. Vite dev path: `npm run dev`
2. Built server path via CLI: `npm run build && node dist-cli/index.js`

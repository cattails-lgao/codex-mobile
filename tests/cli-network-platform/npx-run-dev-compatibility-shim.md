### npx run dev compatibility shim

#### Feature/Change Name
The accidental `npx run dev` command starts the repository dev wrapper instead of failing with a missing `dev` module.

#### Prerequisites/Setup
1. Run from the repository root.
2. Local dependencies are available, or the dev wrapper can install them with `pnpm install`.
3. Port 5173 is free, or Vite can select the next available port.

#### Steps
1. Run `npx run dev`.
2. Confirm the command reaches the existing `scripts/dev.cjs` wrapper and starts Vite.
3. Stop the dev server with Ctrl-C.
4. Repeat with `npx run dev --host 127.0.0.1 --port 4173`.

#### Expected Results
- `npx run dev` no longer fails with `Cannot find module '<repo>/dev'`.
- The command starts the same dev server path as `npm run dev` / `pnpm run dev`.
- Host and port arguments are passed through to Vite.

#### Rollback/Cleanup
- Stop any dev server process started for validation.

---

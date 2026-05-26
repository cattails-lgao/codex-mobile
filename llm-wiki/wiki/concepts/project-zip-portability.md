# Project ZIP Portability

Project ZIP portability lets a user move a local project and its matching Codex chat history between Codex homes.

Source: [project-zip-portability.md](../../raw/features/project-zip-portability.md)

## Export

Project and thread menus expose `Save project`. The exported ZIP contains project files plus matching Codex session JSONL files under `.codex-project/chats/`. Standard heavyweight/local metadata folders such as `.git`, `node_modules`, and `.DS_Store` are excluded by the feature tests.

The manifest may include the source project path because the server is local-user facing and the archive is created by the user for their own portability flow.

Source: [project-zip-portability.md](../../raw/features/project-zip-portability.md)

## Import

The new-thread home screen exposes `Import Project` next to `Create Project`. Import supports either an exported ZIP or a browser folder picker upload.

Imported files are written to a new project folder. Chat JSONL entries under `.codex-project/chats/` are rewritten into the destination `CODEX_HOME` with `cwd` set to the imported project path. Provider/model metadata is rewritten to the current local provider/model so resumed imported threads use the destination configuration.

Project root state is refreshed after import so a newly imported project appears in the sidebar even when it has no threads yet.

Source: [project-zip-portability.md](../../raw/features/project-zip-portability.md)

## Boundaries

`.codex-project/chats/` is the reserved namespace for imported Codex sessions. Other `.codex-project/` files round-trip as normal project files.

The project import/export server endpoints intentionally do not add saved-root allowlists, import parent restrictions, ZIP upload caps, or local path redaction solely to satisfy review-bot comments. Those comments assume a hostile remote caller, while this app server is local-user facing and not meant to be exposed publicly. Treat such comments as rejected unless they show a concrete remote reachability or auth-bypass path.

Source: [project-zip-portability.md](../../raw/features/project-zip-portability.md)

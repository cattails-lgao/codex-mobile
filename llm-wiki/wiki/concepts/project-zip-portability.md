# Project ZIP Portability

Project ZIP portability lets a user move a local project and its matching Codex chat history between Codex homes.

Source: [project-zip-portability.md](../../raw/features/project-zip-portability.md)

## Export

Project and thread menus expose `Save project`. The exported ZIP contains project files, matching Codex session JSONL files under `.codex-project/chats/`, and matching generated thread titles under `.codex-project/chats/thread-titles.json`. Standard heavyweight/generated metadata such as `.git`, `node_modules`, standard Python virtualenv/cache folders, JS framework caches, Gradle/Rust/.NET outputs, coverage folders, `build`, `dist`, `target`, and OS metadata are excluded by the feature tests. When the export source is inside a Git repo, Git-ignored files are also excluded.

The manifest may include the source project path because the server is local-user facing and the archive is created by the user for their own portability flow.

Source: [project-zip-portability.md](../../raw/features/project-zip-portability.md)

## Import

The new-thread home screen exposes `Import Project` next to `Create Project`. Import supports either an exported ZIP or a browser folder picker upload.

Browser folder import preserves every selected file from the picker, including generated folders and OS metadata. It only rejects unsafe relative paths containing `.` or `..` segments.

Imported files are written to a new project folder. Chat JSONL entries under `.codex-project/chats/` are rewritten into the destination `CODEX_HOME` with `cwd` set to the imported project path. Exported title metadata is written into the destination state database and title cache so imported rows keep the original generated titles. Provider/model metadata is rewritten to the current local provider/model so resumed imported threads use the destination configuration.

Project root state is refreshed after import so a newly imported project appears in the sidebar even when it has no threads yet.

Source: [project-zip-portability.md](../../raw/features/project-zip-portability.md)

## Boundaries

`.codex-project/chats/` is the reserved namespace for imported Codex sessions. Other `.codex-project/` files round-trip as normal project files.

The project import/export server endpoints intentionally do not add saved-root allowlists, import parent restrictions, ZIP upload caps, or local path redaction solely to satisfy review-bot comments. Those comments assume a hostile remote caller, while this app server is local-user facing and not meant to be exposed publicly. Treat such comments as rejected unless they show a concrete remote reachability or auth-bypass path.

Source: [project-zip-portability.md](../../raw/features/project-zip-portability.md)

## Docker Validation

Project import/export Docker tests should use the fast reusable test image instead of reinstalling the packed app on every run. Build the base image once from `scripts/docker-fast-test-base.Dockerfile`, then run `scripts/run-docker-fast-test.sh`; the script builds the current repo, mounts it read-only into Docker, reuses a Docker `CODEX_HOME` volume, and starts `node /repo/dist-cli/index.js`.

Use the slower packed-image Docker workflow only when validating package install contents, postinstall behavior, auth/provider startup, or published runtime behavior.

Source: [project-zip-portability.md](../../raw/features/project-zip-portability.md)

### Feature: Nested skill bundles are grouped in discovery

#### Feature/Change Name
Composer skill discovery collapses nested `skills/<subskill>/SKILL.md` entries under their top-level bundle skill when the bundle root skill is also present, including curated plugin skill packs such as `cloudflare:*`.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev`)
2. Open a thread whose cwd can access installed skills
3. At least one installed skill bundle or curated plugin pack contains a top-level/root `SKILL.md` plus additional subskills

#### Steps
1. Open the thread composer skill picker
2. Search for a grouped bundle or plugin root such as `cloudflare`
3. Confirm the grouped root appears once in the picker
4. Search for one nested subskill or prefixed plugin skill name such as `agents-sdk` or `cloudflare:workers-best-practices`
5. Refresh the page or switch threads and reopen the skill picker

#### Expected Results
- The picker shows a single top-level entry for the bundled skill or plugin root
- Nested subskill folder names and plugin-prefixed variants do not appear as separate skill discovery entries when the parent/root entry exists
- Grouped plugin roots render a clean label such as `cloudflare` instead of `cloudflare:cloudflare`
- The grouped result remains stable after refresh or thread switching

#### Rollback/Cleanup
- None

---

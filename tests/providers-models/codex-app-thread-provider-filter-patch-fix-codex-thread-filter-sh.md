### Feature: Codex.app Thread Provider Filter Patch (fix-codex-thread-filter.sh)

#### Prerequisites
- macOS with `/Applications/Codex.app` installed.

#### Steps
1. **Dry-run**: `bash scripts/fix-codex-thread-filter.sh --dry-run`
   - Should extract asar, find `product-name-*.js`, locate `listThreads` pattern, and exit cleanly.
2. **Apply patch**: `bash scripts/fix-codex-thread-filter.sh`
   - Extracts `app.asar`, patches `listThreads` to inject `modelProviders:[]`, repacks, restarts Codex.app.
   - Verify output shows "Patch marker verified in installed asar".
3. **Verify in Codex.app**:
   - Open Codex.app after patch.
   - If threads were created with different model providers (e.g. `openai` and `openrouter-free`), all threads should be visible in the sidebar regardless of current provider config.
4. **Restore**: `bash scripts/fix-codex-thread-filter.sh --restore`
   - Restores the backup `app.asar.bak` and reverts to original behavior.

#### Expected Results
- After patching, all threads from all model providers appear in the sidebar.
- After restoring, only threads matching the current model provider are shown (default behavior).
- Patch survives Codex.app restarts but is overwritten by app updates.

#### Rollback/Cleanup
- Run `bash scripts/fix-codex-thread-filter.sh --restore` to undo.
- Backup is stored at `/Applications/Codex.app/Contents/Resources/app.asar.bak`.

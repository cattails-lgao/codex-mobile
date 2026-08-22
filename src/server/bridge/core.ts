// Shared low-level helpers for the codexAppServerBridge domain slices.
// Extracted first so bridge/*.ts slices never import back into the monolithic
// bridge shell (circular-dependency safety). Add cross-slice shared constants
// and paths here as later slices (git/models/session/zip) land.
import { homedir } from 'node:os'
import { join } from 'node:path'

export function getCodexHomeDir(): string {
  const codexHome = process.env.CODEX_HOME?.trim()
  return codexHome && codexHome.length > 0 ? codexHome : join(homedir(), '.codex')
}
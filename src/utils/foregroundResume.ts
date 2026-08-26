export const FOREGROUND_RESUME_MIN_HIDDEN_MS = 400

export function shouldSyncAfterForeground(
  visibilityState: DocumentVisibilityState,
  hiddenAtMs: number | null,
  syncTriggered: boolean,
  now: number,
): boolean {
  return visibilityState === 'visible'
    && !syncTriggered
    && hiddenAtMs !== null
    && now - hiddenAtMs >= FOREGROUND_RESUME_MIN_HIDDEN_MS
}

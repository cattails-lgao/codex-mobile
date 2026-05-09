export function reconcilePinnedThreadIds(
  pinnedThreadIds: string[],
  loadedThreadIds: Set<string>,
  options: { canPruneMissing: boolean },
): string[] {
  if (!options.canPruneMissing) return pinnedThreadIds
  return pinnedThreadIds.filter((threadId) => loadedThreadIds.has(threadId))
}

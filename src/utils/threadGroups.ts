import type { UiProjectGroup, UiThread } from '../types/codex'

function readUpdatedAtMs(thread: UiThread): number {
  const parsed = Date.parse(thread.updatedAtIso)
  return Number.isFinite(parsed) ? parsed : 0
}

/**
 * 防御性去重：同一次 `thread/list` 里同一个 thread.id 可能出现多行。
 *
 * 背景：paginated 历史的线程在 `thread/revert` 后不重写原 rollout 文件，而是新开一段并以
 * `history_base` 指向前缀；codex app-server 从 sessions/ 目录扫描构建 `thread/list`，会把
 * 同一 session 的多段 rollout 当成多条线程返回（`state_*.sqlite` 里仍是「一 id 一行」）。
 * 根治在 bridge 层 `dedupeThreadListByIdKeepNewest`；这里是渲染层兜底，避免同一个 key
 * 重复渲染以及 Vue 的 duplicate-key 告警。
 *
 * 保留 `updatedAtIso` 最新的一条，并维持该 id 首次出现的位置。没有重复时返回原数组引用，
 * 以免打断下游基于 `===` 的不变性检查。
 */
export function dedupeThreadGroupsById(groups: UiProjectGroup[]): UiProjectGroup[] {
  let duplicateFound = false
  const dedupedGroups = groups.map((group) => {
    const rows: UiThread[] = []
    const indexById = new Map<string, number>()
    for (const thread of group.threads) {
      const existingIndex = indexById.get(thread.id)
      if (existingIndex === undefined) {
        indexById.set(thread.id, rows.length)
        rows.push(thread)
        continue
      }
      duplicateFound = true
      if (readUpdatedAtMs(thread) > readUpdatedAtMs(rows[existingIndex])) {
        rows[existingIndex] = thread
      }
    }
    return rows.length === group.threads.length ? group : { ...group, threads: rows }
  })

  return duplicateFound ? dedupedGroups : groups
}

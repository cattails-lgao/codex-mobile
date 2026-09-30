import type { DirectoryComposioConnector } from '../../api/codexGateway'

export type DirectorySortMode = 'popular' | 'name' | 'date'

const POPULAR_COMPOSIO_NAME_BONUSES: Array<[RegExp, number]> = [
  [/(gmail|google calendar|google docs|google sheets|google drive|github|slack|notion|linear|outlook|supabase)/i, 140],
  [/(email|calendar|document|sheet|drive|repo|issue|message|project|database|crm|deploy)/i, 50],
]

function normalizeSearch(value: string): string {
  return value.trim().toLowerCase()
}

function bonusForName(name: string, rows: Array<[RegExp, number]>): number {
  return rows.reduce((score, [pattern, bonus]) => score + (pattern.test(name) ? bonus : 0), 0)
}

function composioPopularScore(connector: DirectoryComposioConnector): number {
  return (
    (connector.activeCount * 1_000) +
    (connector.isNoAuth ? 300 : 0) +
    (connector.toolsCount * 3) +
    (connector.triggersCount * 4) +
    bonusForName(`${connector.name} ${connector.slug} ${connector.description}`, POPULAR_COMPOSIO_NAME_BONUSES)
  )
}

function composioQueryScore(connector: DirectoryComposioConnector, query: string): number {
  const normalized = normalizeSearch(query)
  if (!normalized) return 0
  const name = connector.name.toLowerCase()
  const slug = connector.slug.toLowerCase()
  if (name === normalized || slug === normalized) return 1_000_000
  if (name.replace(/\s+/gu, '') === normalized.replace(/\s+/gu, '')) return 900_000
  if (name.startsWith(normalized) || slug.startsWith(normalized)) return 800_000
  if (name.includes(normalized) || slug.includes(normalized)) return 700_000
  return 0
}

function composioConnectionRank(connector: DirectoryComposioConnector): number {
  if (connector.activeCount > 0) return 0
  if (connector.totalConnections > 0) return 1
  if (connector.isNoAuth) return 2
  return 3
}

export function sortComposioConnectors(
  rows: DirectoryComposioConnector[],
  sortMode: DirectorySortMode,
  query = '',
): DirectoryComposioConnector[] {
  const normalizedQuery = normalizeSearch(query)
  const queryRank = (connector: DirectoryComposioConnector) => composioQueryScore(connector, normalizedQuery)
  if (sortMode === 'name') {
    return [...rows].sort((a, b) => (
      (queryRank(b) - queryRank(a)) ||
      (composioConnectionRank(a) - composioConnectionRank(b))
    ) || a.name.localeCompare(b.name))
  }
  if (sortMode === 'date') {
    return [...rows].sort((a, b) => (
      (queryRank(b) - queryRank(a)) ||
      (composioConnectionRank(a) - composioConnectionRank(b))
    ) || a.name.localeCompare(b.name))
  }
  return [...rows].sort((a, b) => (
    (queryRank(b) - queryRank(a)) ||
    (composioConnectionRank(a) - composioConnectionRank(b))
  ) || (composioPopularScore(b) - composioPopularScore(a)) || a.name.localeCompare(b.name))
}

// Directory try-item（App 的 onTryDirectoryItem）开新线程时要带上被点选的技能项，
// 而技能输入项里的 path 是绝对路径（UserInput 的 skill 变体里 path 必填）。历史上
// 这里写过作者本机的绝对路径，换台机器就失效——所以改为只传名字，由调用方拿
// app-server 返回的已安装技能列表解析真实路径。
export type DirectoryTrySkillRequest = { name: string; path?: string }
export type DirectoryTrySkill = { name: string; path: string }
export type InstalledSkillPathRef = { name: string; path: string }

// 技能名可能带插件前缀（例如 `browser-use:browser`），所以除了全名相等，再按
// 最后一段匹配一次。
function findInstalledSkillPath(name: string, installedSkills: InstalledSkillPathRef[]): string {
  const separator = name.lastIndexOf(':')
  const leaf = separator >= 0 ? name.slice(separator + 1) : name
  const match =
    installedSkills.find((skill) => skill.name === name) ??
    installedSkills.find((skill) => skill.name === leaf || skill.name.endsWith(`:${leaf}`))
  return match?.path?.trim() ?? ''
}

// 解析不到就丢掉这一项——带一个不存在的路径只会让消息里记录一个假来源。
export function resolveTryItemSkills(
  requested: DirectoryTrySkillRequest[],
  installedSkills: InstalledSkillPathRef[],
): DirectoryTrySkill[] {
  const resolved: DirectoryTrySkill[] = []
  for (const skill of requested) {
    const name = skill.name.trim()
    if (!name) continue
    const resolvedPath = (skill.path ?? '').trim() || findInstalledSkillPath(name, installedSkills)
    if (!resolvedPath) continue
    resolved.push({ name, path: resolvedPath })
  }
  return resolved
}

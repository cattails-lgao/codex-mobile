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

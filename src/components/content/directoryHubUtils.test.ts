import { describe, expect, it } from 'vitest'
import type { DirectoryComposioConnector } from '../../api/codexGateway'
import { sortComposioConnectors } from './directoryHubUtils'

function connector(overrides: Partial<DirectoryComposioConnector> & Pick<DirectoryComposioConnector, 'slug' | 'name'>): DirectoryComposioConnector {
  return {
    slug: overrides.slug,
    name: overrides.name,
    description: overrides.description ?? '',
    logoUrl: '',
    latestVersion: '',
    toolsCount: overrides.toolsCount ?? 0,
    triggersCount: overrides.triggersCount ?? 0,
    isNoAuth: overrides.isNoAuth ?? false,
    enabled: true,
    authModes: overrides.authModes ?? [],
    activeCount: overrides.activeCount ?? 0,
    totalConnections: overrides.totalConnections ?? 0,
    connectionStatuses: overrides.connectionStatuses ?? [],
  }
}

describe('sortComposioConnectors', () => {
  it('prioritizes exact name matches over popular description-only matches', () => {
    const rows = [
      connector({
        slug: 'metaads',
        name: 'Meta Ads',
        description: 'Create ads across Facebook, Instagram, Messenger, WhatsApp and more.',
        toolsCount: 50,
      }),
      connector({
        slug: 'instagram',
        name: 'Instagram',
        description: 'Instagram Business and Creator account actions.',
        toolsCount: 29,
      }),
      connector({
        slug: 'superchat',
        name: 'Superchat',
        description: 'Messaging for WhatsApp, Instagram Direct, and more.',
        toolsCount: 17,
      }),
    ]

    expect(sortComposioConnectors(rows, 'popular', 'instagram').map((row) => row.slug)).toEqual([
      'instagram',
      'metaads',
      'superchat',
    ])
  })

  it('keeps connected connectors ahead when there is no query', () => {
    const rows = [
      connector({ slug: 'slack', name: 'Slack', toolsCount: 100 }),
      connector({ slug: 'github', name: 'GitHub', activeCount: 1, toolsCount: 10 }),
    ]

    expect(sortComposioConnectors(rows, 'popular').map((row) => row.slug)).toEqual(['github', 'slack'])
  })
})

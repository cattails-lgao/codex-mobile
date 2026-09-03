import { afterEach, describe, expect, it, vi } from 'vitest'
import { addDirectoryMarketplace, checkoutPluginShare, clearProviderModelsCache, compactThread, deletePluginShare, getAvailableModelIds, getAvailableModels, getCurrentModelConfig, getThreadDetail, listDirectoryComposioConnectors, listHooks, listPluginShares, listRemoteControlClients, normalizeFuzzyFileSearchResults, readRemoteControlStatus, removeDirectoryMarketplace, resumeThread, revokeRemoteControlClient, savePluginShare, setRemoteControlEnabled, startFuzzyFileSearchSession, startRemoteControlPairing, startThreadTurn, updateFuzzyFileSearchSession, upgradeDirectoryMarketplaces } from './codexGateway'

function mockRpcFetch(): { requests: Array<{ method: string, params: Record<string, unknown> }> } {
  const requests: Array<{ method: string, params: Record<string, unknown> }> = []

  vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = typeof init?.body === 'string'
      ? JSON.parse(init.body) as { method: string, params: Record<string, unknown> }
      : { method: '', params: {} }

    requests.push(body)

    return new Response(JSON.stringify({
      result: {
        turn: {
          id: `turn-${requests.length}`,
        },
      },
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }))

  return { requests }
}

describe('startThreadTurn collaboration mode payloads', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends default collaboration mode explicitly after a plan turn', async () => {
    const { requests } = mockRpcFetch()

    await startThreadTurn('thread-1', 'make a plan', [], 'gpt-5.4', 'medium', undefined, [], 'plan')
    await startThreadTurn('thread-1', 'implement it', [], 'gpt-5.4', 'medium', undefined, [], 'default')

    expect(requests).toHaveLength(2)
    expect(requests[0].method).toBe('turn/start')
    expect(requests[0].params.collaborationMode).toEqual({
      mode: 'plan',
      settings: {
        model: 'gpt-5.4',
        reasoning_effort: 'medium',
        developer_instructions: null,
      },
    })
    expect(requests[1].method).toBe('turn/start')
    expect(requests[1].params.collaborationMode).toEqual({
      mode: 'default',
      settings: {
        model: 'gpt-5.4',
        reasoning_effort: 'medium',
        developer_instructions: null,
      },
    })
  })

  it('passes GPT-5.6 ultra reasoning through to Codex', async () => {
    const { requests } = mockRpcFetch()

    await startThreadTurn('thread-1', 'solve it', [], 'gpt-5.6-sol', 'ultra', undefined, [], 'default')

    expect(requests[0].params.effort).toBe('ultra')
    expect(requests[0].params.collaborationMode).toEqual({
      mode: 'default',
      settings: {
        model: 'gpt-5.6-sol',
        reasoning_effort: 'ultra',
        developer_instructions: null,
      },
    })
  })
})

describe('getCurrentModelConfig', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it.each(['max', 'ultra'] as const)('keeps the GPT-5.6 %s reasoning level', async (reasoningEffort) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      result: {
        config: {
          model: 'gpt-5.6-sol',
          model_provider: 'openai',
          model_reasoning_effort: reasoningEffort,
        },
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })))

    await expect(getCurrentModelConfig()).resolves.toMatchObject({
      model: 'gpt-5.6-sol',
      reasoningEffort,
    })
  })
})

describe('listDirectoryComposioConnectors', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends search queries as query params expected by the server', async () => {
    const requests: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      requests.push(String(input))
      return new Response(JSON.stringify({
        data: [],
        nextCursor: null,
        total: 0,
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      })
    }))

    await listDirectoryComposioConnectors('instagram', '50', 25)

    expect(requests).toEqual(['/codex-api/composio/connectors?query=instagram&cursor=50&limit=25'])
  })
})

describe('getAvailableModelIds', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    clearProviderModelsCache()
  })

  it('uses provider models without waiting for model/list when provider models are required', async () => {
    const requests: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      requests.push(String(input))
      if (String(input) === '/codex-api/provider-models') {
        return new Response(JSON.stringify({
          data: ['big-pickle', 'deepseek-v4-flash-free'],
          exclusive: true,
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      throw new Error(`unexpected request ${String(input)}`)
    }))

    await expect(getAvailableModelIds({
      includeProviderModels: true,
      requireProviderModels: true,
    })).resolves.toEqual(['big-pickle', 'deepseek-v4-flash-free'])
    expect(requests).toEqual(['/codex-api/provider-models'])
  })

  it('requests models for an explicit thread provider', async () => {
    const requests: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      requests.push(String(input))
      if (String(input) === '/codex-api/provider-models?provider=opencode-zen') {
        return new Response(JSON.stringify({
          data: ['big-pickle', 'ring-2.6-1t-free'],
          exclusive: true,
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      throw new Error(`unexpected request ${String(input)}`)
    }))

    await expect(getAvailableModelIds({
      includeProviderModels: true,
      requireProviderModels: true,
      providerId: 'opencode-zen',
    })).resolves.toEqual(['big-pickle', 'ring-2.6-1t-free'])
    expect(requests).toEqual(['/codex-api/provider-models?provider=opencode-zen'])
  })

  it('falls back to model/list when provider models are optional and unavailable', async () => {
    const requests: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(String(input))
      if (String(input) === '/codex-api/provider-models') {
        return new Response(JSON.stringify({ data: [] }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      const body = typeof init?.body === 'string'
        ? JSON.parse(init.body) as { method: string }
        : { method: '' }
      expect(body.method).toBe('model/list')
      return new Response(JSON.stringify({
        result: {
          data: [
            { id: 'gpt-5.5' },
            { model: 'gpt-5.4-mini' },
          ],
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }))

    await expect(getAvailableModelIds({
      includeProviderModels: true,
    })).resolves.toEqual(['gpt-5.5', 'gpt-5.4-mini'])
    expect(requests).toEqual(['/codex-api/provider-models', '/codex-api/rpc'])
  })

  it('preserves model-specific reasoning metadata from model/list', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = typeof init?.body === 'string'
        ? JSON.parse(init.body) as { method: string }
        : { method: '' }
      expect(body.method).toBe('model/list')
      return new Response(JSON.stringify({
        result: {
          data: [
            {
              id: 'gpt-5.6-sol',
              supportedReasoningEfforts: [
                { reasoningEffort: 'low' },
                { reasoningEffort: 'max' },
                { reasoningEffort: 'ultra' },
              ],
              defaultReasoningEffort: 'low',
            },
            {
              id: 'gpt-5.5',
              supportedReasoningEfforts: [
                { reasoningEffort: 'low' },
                { reasoningEffort: 'xhigh' },
              ],
              defaultReasoningEffort: 'low',
            },
          ],
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }))

    await expect(getAvailableModels({ includeProviderModels: false })).resolves.toEqual([
      {
        id: 'gpt-5.6-sol',
        supportedReasoningEfforts: ['low', 'max', 'ultra'],
        defaultReasoningEffort: 'low',
      },
      {
        id: 'gpt-5.5',
        supportedReasoningEfforts: ['low', 'xhigh'],
        defaultReasoningEffort: 'low',
      },
    ])
  })

  it('reuses cached provider models within the TTL window instead of re-fetching', async () => {
    const requests: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      requests.push(String(input))
      if (String(input) === '/codex-api/provider-models') {
        return new Response(JSON.stringify({
          data: ['big-pickle', 'deepseek-v4-flash-free'],
          exclusive: true,
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      throw new Error(`unexpected request ${String(input)}`)
    }))

    await getAvailableModelIds({ includeProviderModels: true, requireProviderModels: true })
    await getAvailableModelIds({ includeProviderModels: true, requireProviderModels: true })
    expect(requests).toEqual(['/codex-api/provider-models'])
  })
})

describe('getThreadDetail', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reads modelProvider from nested thread payloads returned by thread/read', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = typeof init?.body === 'string'
        ? JSON.parse(init.body) as { method: string; params: Record<string, unknown> }
        : { method: '', params: {} }
      expect(body.method).toBe('thread/read')
      return new Response(JSON.stringify({
        result: {
          thread: {
            id: body.params.threadId,
            modelProvider: 'opencode_zen',
            turns: [],
          },
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }))

    await expect(getThreadDetail('legacy-thread')).resolves.toMatchObject({
      modelProvider: 'opencode_zen',
    })
  })
})

describe('resumeThread', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('coalesces repeated resume failures for the same thread', async () => {
    const requests: Array<{ method: string; params: Record<string, unknown> }> = []
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = typeof init?.body === 'string'
        ? JSON.parse(init.body) as { method: string; params: Record<string, unknown> }
        : { method: '', params: {} }
      requests.push(body)
      return new Response(JSON.stringify({ error: 'no rollout found for thread id missing-thread' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      })
    }))

    const results = await Promise.allSettled([
      resumeThread('missing-thread'),
      resumeThread('missing-thread'),
    ])

    expect(results.every((result) => result.status === 'rejected')).toBe(true)
    expect(requests).toEqual([
      { method: 'thread/resume', params: { threadId: 'missing-thread' } },
    ])
  })

  it('evicts a stalled resume so later resume attempts are not pinned forever', async () => {
    vi.useFakeTimers()
    const requests: Array<{ method: string; params: Record<string, unknown> }> = []
    vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      const body = typeof init?.body === 'string'
        ? JSON.parse(init.body) as { method: string; params: Record<string, unknown> }
        : { method: '', params: {} }
      requests.push(body)
      return new Promise<Response>(() => undefined)
    }))

    const first = resumeThread('stalled-thread')
    void resumeThread('stalled-thread')
    expect(requests).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(30_000)

    const retried = resumeThread('stalled-thread')
    expect(retried).not.toBe(first)
    expect(requests).toEqual([
      { method: 'thread/resume', params: { threadId: 'stalled-thread' } },
      { method: 'thread/resume', params: { threadId: 'stalled-thread' } },
    ])
  })
})

describe('compactThread', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('calls thread/compact/start with the thread id', async () => {
    const requests: Array<{ method: string; params: Record<string, unknown> }> = []
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = typeof init?.body === 'string'
        ? JSON.parse(init.body) as { method: string; params: Record<string, unknown> }
        : { method: '', params: {} }
      requests.push(body)
      return new Response(JSON.stringify({ result: {} }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }))

    await compactThread('thread-compact-me')

    expect(requests).toEqual([
      { method: 'thread/compact/start', params: { threadId: 'thread-compact-me' } },
    ])
  })
})

describe('fuzzyFileSearch session methods', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('starts a session with roots and a session id', async () => {
    const requests: Array<{ method: string; params: Record<string, unknown> }> = []
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = typeof init?.body === 'string'
        ? JSON.parse(init.body) as { method: string; params: Record<string, unknown> }
        : { method: '', params: {} }
      requests.push(body)
      return new Response(JSON.stringify({ result: {} }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }))

    await startFuzzyFileSearchSession(['/root/a', '/root/b'], 'sess-1')

    expect(requests).toEqual([
      { method: 'fuzzyFileSearch/sessionStart', params: { sessionId: 'sess-1', roots: ['/root/a', '/root/b'] } },
    ])
  })

  it('updates a session with a query', async () => {
    const requests: Array<{ method: string; params: Record<string, unknown> }> = []
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = typeof init?.body === 'string'
        ? JSON.parse(init.body) as { method: string; params: Record<string, unknown> }
        : { method: '', params: {} }
      requests.push(body)
      return new Response(JSON.stringify({ result: {} }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }))

    await updateFuzzyFileSearchSession('sess-1', 'src/App')

    expect(requests).toEqual([
      { method: 'fuzzyFileSearch/sessionUpdate', params: { sessionId: 'sess-1', query: 'src/App' } },
    ])
  })

  it('normalizes sessionUpdated payload files into suggestions', () => {
    const suggestions = normalizeFuzzyFileSearchResults({
      sessionId: 'sess-1',
      query: 'App',
      files: [
        { root: '/root/a', path: '/root/a/src/App.vue', matchType: 'File', fileName: 'App.vue', score: 10 },
        { root: '/root/a', path: '/root/a/src/App.test.ts', matchType: 'File', fileName: 'App.test.ts', score: 5 },
      ],
    })

    expect(suggestions).toEqual([
      { path: '/root/a/src/App.vue' },
      { path: '/root/a/src/App.test.ts' },
    ])
  })

  it('drops files under ignored directories from suggestions (round-38)', () => {
    const suggestions = normalizeFuzzyFileSearchResults({
      sessionId: 'sess-1',
      query: 're',
      files: [
        { root: '/root/a', path: '/root/a/src/main.ts', matchType: 'File', fileName: 'main.ts' },
        { root: '/root/a', path: '/root/a/.git/refs/heads', matchType: 'Directory', fileName: 'heads' },
        { root: '/root/a', path: '/root/a/node_modules/pkg/index.js', matchType: 'File', fileName: 'index.js' },
        { root: '/root/a', path: 'D:\\code\\proj\\dist\\out.js', matchType: 'File', fileName: 'out.js' },
        { root: '/root/a', path: '/root/a/docs/guide.md', matchType: 'File', fileName: 'guide.md' },
      ],
    })

    expect(suggestions).toEqual([
      { path: '/root/a/src/main.ts' },
      { path: '/root/a/docs/guide.md' },
    ])
  })

  it('ignores malformed files in the payload', () => {
    const suggestions = normalizeFuzzyFileSearchResults({
      sessionId: 'sess-1',
      query: 'App',
      files: [
        null,
        { path: '/ok.ts' },
        'nope',
        { noPath: true },
      ],
    })

    expect(suggestions).toEqual([{ path: '/ok.ts' }])
  })
})

describe('listHooks', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends hooks/list with an empty params object', async () => {
    const requests: Array<{ method: string, params: unknown }> = []
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = typeof init?.body === 'string'
        ? JSON.parse(init.body) as { method: string, params: unknown }
        : { method: '', params: null }
      requests.push(body)
      return new Response(JSON.stringify({ result: { data: [] } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }))

    await listHooks()

    expect(requests).toEqual([{ method: 'hooks/list', params: {} }])
  })

  it('normalizes per-cwd entries and hook rows with camel/snake fallbacks', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      result: {
        data: [
          {
            cwd: '/repo',
            hooks: [
              { event: 'PreToolUse', command: 'pre.sh', timeout: 5, enabled: true },
              { name: 'PostToolUse', cmd: 'post.sh', timeout_ms: 10, active: false },
              { event: 'Broken' },
              null,
              'nope',
            ],
            warnings: ['w1'],
            errors: ['e1'],
          },
          { cwd: '/empty' },
        ],
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })))

    const entries = await listHooks()

    expect(entries).toEqual([
      {
        cwd: '/repo',
        hooks: [
          { event: 'PreToolUse', command: 'pre.sh', timeout: 5, enabled: true },
          { event: 'PostToolUse', command: 'post.sh', timeout: 10, enabled: false },
        ],
        warnings: ['w1'],
        errors: ['e1'],
      },
      { cwd: '/empty', hooks: [], warnings: [], errors: [] },
    ])
  })
})

describe('marketplace management', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('adds a marketplace by source URL', async () => {
    const requests: Array<{ method: string, params: unknown }> = []
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = typeof init?.body === 'string'
        ? JSON.parse(init.body) as { method: string, params: unknown }
        : { method: '', params: null }
      requests.push(body)
      return new Response(JSON.stringify({ result: {} }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }))

    await addDirectoryMarketplace('https://github.com/example/marketplace')

    expect(requests).toEqual([
      { method: 'marketplace/add', params: { source: 'https://github.com/example/marketplace' } },
    ])
  })

  it('removes a marketplace by name', async () => {
    const requests: Array<{ method: string, params: unknown }> = []
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = typeof init?.body === 'string'
        ? JSON.parse(init.body) as { method: string, params: unknown }
        : { method: '', params: null }
      requests.push(body)
      return new Response(JSON.stringify({ result: {} }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }))

    await removeDirectoryMarketplace('openai')

    expect(requests).toEqual([{ method: 'marketplace/remove', params: { marketplaceName: 'openai' } }])
  })

  it('normalizes the upgrade result with camel/snake fallbacks', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      result: {
        selectedMarketplaces: ['openai'],
        upgraded_roots: ['/repo/.codex/marketplaces/openai'],
        errors: [],
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })))

    const result = await upgradeDirectoryMarketplaces()

    expect(result).toEqual({
      selectedMarketplaces: ['openai'],
      upgradedRoots: ['/repo/.codex/marketplaces/openai'],
      errors: [],
    })
  })
})

describe('plugin share', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('saves a share by plugin path', async () => {
    const requests: Array<{ method: string, params: unknown }> = []
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = typeof init?.body === 'string'
        ? JSON.parse(init.body) as { method: string, params: unknown }
        : { method: '', params: null }
      requests.push(body)
      return new Response(JSON.stringify({
        result: {
          remotePluginId: 'share-1',
          share_url: 'https://share.example/plugin-1',
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }))

    const result = await savePluginShare('/repo/.codex/marketplaces/openai/example')

    expect(requests).toEqual([
      { method: 'plugin/share/save', params: { pluginPath: '/repo/.codex/marketplaces/openai/example' } },
    ])
    expect(result).toEqual({ remotePluginId: 'share-1', shareUrl: 'https://share.example/plugin-1' })
  })

  it('lists shares with camel/snake normalization and skips malformed rows', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      result: {
        data: [
          { remotePluginId: 'share-1', pluginName: 'Example', shareUrl: 'https://share.example/1', createdAt: '2026-08-05' },
          { id: 'share-2', name: 'Other', url: 'https://share.example/2', created_at: '2026-08-04' },
          { pluginName: 'no-id' },
          null,
        ],
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })))

    const shares = await listPluginShares()

    expect(shares).toEqual([
      { remotePluginId: 'share-1', pluginName: 'Example', shareUrl: 'https://share.example/1', createdAt: '2026-08-05' },
      { remotePluginId: 'share-2', pluginName: 'Other', shareUrl: 'https://share.example/2', createdAt: '2026-08-04' },
    ])
  })

  it('deletes and checks out by remotePluginId', async () => {
    const requests: Array<{ method: string, params: unknown }> = []
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = typeof init?.body === 'string'
        ? JSON.parse(init.body) as { method: string, params: unknown }
        : { method: '', params: null }
      requests.push(body)
      return new Response(JSON.stringify({ result: {} }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }))

    await deletePluginShare('share-1')
    await checkoutPluginShare('share-1')

    expect(requests).toEqual([
      { method: 'plugin/share/delete', params: { remotePluginId: 'share-1' } },
      { method: 'plugin/share/checkout', params: { remotePluginId: 'share-1' } },
    ])
  })
})

describe('remote control', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function mockRpc(respondWith: () => unknown): { requests: Array<{ method: string, params: unknown }> } {
    const requests: Array<{ method: string, params: unknown }> = []
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = typeof init?.body === 'string'
        ? JSON.parse(init.body) as { method: string, params: unknown }
        : { method: '', params: null }
      requests.push(body)
      return new Response(JSON.stringify({ result: respondWith() }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }))
    return { requests }
  }

  it('reads status with camel/snake client normalization', async () => {
    mockRpc(() => ({
      enabled: true,
      clients: [
        { clientId: 'c1', deviceName: 'Phone', lastSeenAt: '2026-08-05T00:00:00Z' },
        { id: 'c2', name: 'Laptop', last_seen_at: '2026-08-04T00:00:00Z' },
        { deviceName: 'no-id' },
      ],
    }))

    const status = await readRemoteControlStatus()

    expect(status).toEqual({
      enabled: true,
      clients: [
        { clientId: 'c1', deviceName: 'Phone', lastSeenAt: '2026-08-05T00:00:00Z' },
        { clientId: 'c2', deviceName: 'Laptop', lastSeenAt: '2026-08-04T00:00:00Z' },
      ],
    })
  })

  it('enables and disables with the matching RPC method', async () => {
    const { requests } = mockRpc(() => ({}))

    await setRemoteControlEnabled(true)
    await setRemoteControlEnabled(false)

    expect(requests).toEqual([
      { method: 'remoteControl/enable', params: {} },
      { method: 'remoteControl/disable', params: {} },
    ])
  })

  it('starts pairing and returns the code with fallbacks', async () => {
    mockRpc(() => ({ pairing_code: 'AB12-CD34', expires_at: '2026-08-05T00:10:00Z' }))

    const pairing = await startRemoteControlPairing()

    expect(pairing).toEqual({ pairingCode: 'AB12-CD34', expiresAt: '2026-08-05T00:10:00Z' })
  })

  it('lists clients and revokes by clientId', async () => {
    const { requests } = mockRpc(() => ({ data: [{ clientId: 'c1', deviceName: 'Phone', lastSeenAt: null }] }))

    const clients = await listRemoteControlClients()
    await revokeRemoteControlClient('c1')

    expect(clients).toEqual([{ clientId: 'c1', deviceName: 'Phone', lastSeenAt: null }])
    expect(requests).toEqual([
      { method: 'remoteControl/client/list', params: {} },
      { method: 'remoteControl/client/revoke', params: { clientId: 'c1' } },
    ])
  })
})

import { describe, expect, it } from 'vitest'
import {
  callRpcWithArchiveRecovery,
  canonicalizeThreadListResponseForRead,
  canonicalizeWorkspaceRootsStateForRead,
} from './codexAppServerBridge'

describe('callRpcWithArchiveRecovery', () => {
  it('sets a fallback name and retries archive when Codex has not materialized a rollout', async () => {
    const calls: Array<{ method: string; params: unknown }> = []
    let archiveCalls = 0
    const appServer = {
      async rpc(method: string, params: unknown): Promise<unknown> {
        calls.push({ method, params })
        if (method === 'thread/archive') {
          archiveCalls += 1
          if (archiveCalls === 1) {
            throw new Error('no rollout found for thread test-thread')
          }
          return { ok: true }
        }
        if (method === 'thread/read') {
          return {
            thread: {
              id: 'test-thread',
              preview: 'Preview title',
              path: '/home/user/.codex/sessions/rollout-test-thread.jsonl',
            },
          }
        }
        return { ok: true }
      },
    }

    await expect(callRpcWithArchiveRecovery(appServer, 'thread/archive', { threadId: 'test-thread' })).resolves.toEqual({ ok: true })
    expect(calls).toEqual([
      { method: 'thread/archive', params: { threadId: 'test-thread' } },
      { method: 'thread/read', params: { threadId: 'test-thread', includeTurns: false } },
      { method: 'thread/name/set', params: { threadId: 'test-thread', name: 'Preview title' } },
      { method: 'thread/archive', params: { threadId: 'test-thread' } },
    ])
  })

  it('treats no-rollout archive of an already archived thread as successful', async () => {
    const calls: Array<{ method: string; params: unknown }> = []
    const appServer = {
      async rpc(method: string, params: unknown): Promise<unknown> {
        calls.push({ method, params })
        if (method === 'thread/archive') {
          throw new Error('no rollout found for thread archived-thread')
        }
        if (method === 'thread/read') {
          return {
            thread: {
              id: 'archived-thread',
              path: '/home/user/.codex/archived_sessions/rollout-archived-thread.jsonl',
            },
          }
        }
        throw new Error(`unexpected method ${method}`)
      },
    }

    await expect(callRpcWithArchiveRecovery(appServer, 'thread/archive', { threadId: 'archived-thread' })).resolves.toBeNull()
    expect(calls).toEqual([
      { method: 'thread/archive', params: { threadId: 'archived-thread' } },
      { method: 'thread/read', params: { threadId: 'archived-thread', includeTurns: false } },
    ])
  })

  it('does not recover unrelated RPC failures', async () => {
    const appServer = {
      async rpc(): Promise<unknown> {
        throw new Error('network failed')
      },
    }

    await expect(callRpcWithArchiveRecovery(appServer, 'thread/archive', { threadId: 'test-thread' })).rejects.toThrow('network failed')
    await expect(callRpcWithArchiveRecovery(appServer, 'thread/read', { threadId: 'test-thread' })).rejects.toThrow('network failed')
  })
})

describe('canonicalizeWorkspaceRootsStateForRead', () => {
  it('realpaths existing local roots so symlink cwd sessions remain visible', async () => {
    const state = await canonicalizeWorkspaceRootsStateForRead({
      order: ['/workspace-link/projects/demo', 'remote-project-id'],
      labels: {
        '/storage/projects/demo': 'Canonical Demo',
        '/workspace-link/projects/demo': 'Symlink Demo',
        'remote-project-id': 'Remote Demo',
      },
      active: ['/workspace-link/projects/demo'],
      projectOrder: ['remote-project-id', '/workspace-link/projects/demo'],
      remoteProjects: [{
        id: 'remote-project-id',
        hostId: 'remote-ssh-discovered:host',
        remotePath: '/remote/projects/demo',
        label: 'remote-demo',
      }],
    }, async (value) => value.replace('/workspace-link/', '/storage/'))

    expect(state.order).toEqual([
      '/storage/projects/demo',
      'remote-project-id',
    ])
    expect(state.active).toEqual(['/storage/projects/demo'])
    expect(state.projectOrder).toEqual([
      'remote-project-id',
      '/storage/projects/demo',
    ])
    expect(state.labels).toEqual({
      '/storage/projects/demo': 'Canonical Demo',
      'remote-project-id': 'Remote Demo',
    })
    expect(state.remoteProjects[0]?.id).toBe('remote-project-id')
  })
})

describe('canonicalizeThreadListResponseForRead', () => {
  it('realpaths thread cwd values to match canonicalized workspace roots', async () => {
    const payload = await canonicalizeThreadListResponseForRead({
      data: [
        { id: 'symlink-cwd-thread', cwd: '/workspace-link/projects/demo' },
        { id: 'canonical-cwd-thread', cwd: '/storage/projects/demo' },
        { id: 'remote-thread', cwd: 'remote-project-id' },
      ],
      nextCursor: null,
    }, async (value) => value.replace('/workspace-link/', '/storage/'))

    expect(payload).toEqual({
      data: [
        { id: 'symlink-cwd-thread', cwd: '/storage/projects/demo' },
        { id: 'canonical-cwd-thread', cwd: '/storage/projects/demo' },
        { id: 'remote-thread', cwd: 'remote-project-id' },
      ],
      nextCursor: null,
    })
  })
})

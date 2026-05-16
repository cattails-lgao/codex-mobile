import { describe, expect, it } from 'vitest'
import { buildAppServerArgs } from './appServerRuntimeConfig'

describe('app-server runtime config', () => {
  it('enables Codex memories by default for spawned app-server processes', () => {
    expect(buildAppServerArgs()).toEqual(expect.arrayContaining([
      '-c',
      'features.memories=true',
    ]))
  })
})

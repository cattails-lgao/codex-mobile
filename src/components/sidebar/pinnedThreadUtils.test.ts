import { describe, expect, it } from 'vitest'
import { reconcilePinnedThreadIds } from './pinnedThreadUtils'

describe('reconcilePinnedThreadIds', () => {
  it('keeps pins whose threads have not loaded while pagination is still incomplete', () => {
    expect(
      reconcilePinnedThreadIds(['loaded', 'not-yet-loaded'], new Set(['loaded']), {
        canPruneMissing: false,
      }),
    ).toEqual(['loaded', 'not-yet-loaded'])
  })

  it('prunes missing pins after the thread list is fully loaded', () => {
    expect(
      reconcilePinnedThreadIds(['loaded', 'missing'], new Set(['loaded']), {
        canPruneMissing: true,
      }),
    ).toEqual(['loaded'])
  })
})

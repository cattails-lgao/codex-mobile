import { describe, expect, it } from 'vitest'
import { projectProjectedDropIndex } from './useProjectDragAndDrop'

describe('projectProjectedDropIndex', () => {
  it('projects a drop before the dragged item without an index offset', () => {
    expect(projectProjectedDropIndex(0, 2, 5)).toBe(0)
  })

  it('projects a drop after the dragged item with the -1 offset', () => {
    expect(projectProjectedDropIndex(4, 2, 5)).toBe(3)
  })

  it('returns null when the drop lands back on the original index', () => {
    expect(projectProjectedDropIndex(3, 2, 5)).toBeNull()
  })

  it('clamps a drop beyond the last index', () => {
    expect(projectProjectedDropIndex(100, 0, 3)).toBe(2)
  })

  it('returns null for an empty group list', () => {
    expect(projectProjectedDropIndex(0, 0, 0)).toBeNull()
  })

  it('returns null when there is no drop target', () => {
    expect(projectProjectedDropIndex(null, 1, 4)).toBeNull()
  })
})
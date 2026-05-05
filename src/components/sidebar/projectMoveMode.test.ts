import { describe, expect, it } from 'vitest'
import { collapseProjectsForMoveMode, createProjectMoveModeState, stopProjectMoveMode } from './projectMoveMode'

describe('project move mode', () => {
  it('starts move mode when project name has surrounding whitespace', () => {
    expect(createProjectMoveModeState(['alpha', 'beta'], '  beta  ')).toEqual({
      isActive: true,
      projectName: 'beta',
    })
  })

  it('does not start move mode when trimmed project name is missing', () => {
    expect(createProjectMoveModeState(['alpha'], '  beta  ')).toEqual({
      isActive: false,
      projectName: '',
    })
  })

  it('starts move mode for an existing project', () => {
    expect(createProjectMoveModeState(['alpha', 'beta'], 'beta')).toEqual({
      isActive: true,
      projectName: 'beta',
    })
  })

  it('does not start move mode for a missing project', () => {
    expect(createProjectMoveModeState(['alpha'], 'beta')).toEqual({
      isActive: false,
      projectName: '',
    })
  })

  it('clears active project state when stopping move mode', () => {
    expect(stopProjectMoveMode()).toEqual({
      isActive: false,
      projectName: '',
    })
  })

  it('collapses every current project when move mode starts', () => {
    expect(collapseProjectsForMoveMode(['alpha', 'beta'], { alpha: false, stale: false })).toEqual({
      alpha: true,
      beta: true,
      stale: false,
    })
  })
})

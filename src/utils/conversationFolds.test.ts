import { describe, expect, it } from 'vitest'
import { buildProcessFolds, buildProcessFoldLabel, MIN_PROCESS_FOLD_ITEMS } from './conversationFolds'
import type { UiMessage } from '../types/codex'

function msg(id: string, messageType: string, turnId: string | undefined, extra: Record<string, unknown> = {}): UiMessage {
  return { id, role: 'system', text: '', messageType, turnId, turnIndex: undefined, ...extra } as UiMessage
}

const t = (key: string, params?: Record<string, string | number>): string =>
  params ? key.replace(/\{(\w+)\}/g, (_match, k: string) => String(params[k] ?? '')) : key
const formatDuration = (ms: number): string => `${Math.round(ms / 1000)}s`

describe('buildProcessFolds', () => {
  it('groups consecutive same-turn work messages into one fold', () => {
    const messages = [
      msg('u1', 'user', 't1', { role: 'user' }),
      msg('r1', 'reasoning', 't1'),
      msg('c1', 'commandExecution', 't1', { commandExecution: { command: 'a', status: 'completed' } }),
      msg('c2', 'commandExecution', 't1', { commandExecution: { command: 'b', status: 'completed' } }),
      msg('a1', 'agentMessage', 't1', { role: 'assistant', text: 'done' }),
    ]
    const folds = buildProcessFolds(messages)
    // reasoning 不参与折叠（思考块始终平铺），仅命令/工具折叠
    expect(folds).toHaveLength(1)
    expect(folds[0]?.turnId).toBe('t1')
    expect(folds[0]?.messages.map((m) => m.id)).toEqual(['c1', 'c2'])
    expect(folds[0]?.thoughtCount).toBe(0)
    expect(folds[0]?.toolCount).toBe(0)
  })

  it('does not fold turns with fewer than MIN_PROCESS_FOLD_ITEMS work messages', () => {
    const messages = [
      msg('u1', 'user', 't1', { role: 'user' }),
      msg('c1', 'commandExecution', 't1', { commandExecution: { command: 'a', status: 'completed' } }),
      msg('a1', 'agentMessage', 't1', { role: 'assistant', text: 'done' }),
    ]
    expect(buildProcessFolds(messages)).toHaveLength(0)
    expect(MIN_PROCESS_FOLD_ITEMS).toBe(2)
  })

  it('splits folds across turn boundaries and non-foldable messages', () => {
    const messages = [
      msg('u1', 'user', 't1', { role: 'user' }),
      msg('c1', 'commandExecution', 't1', { commandExecution: { command: 'a', status: 'completed' } }),
      msg('c2', 'commandExecution', 't1', { commandExecution: { command: 'b', status: 'completed' } }),
      msg('a1', 'agentMessage', 't1', { role: 'assistant', text: 'mid text' }),
      msg('c3', 'commandExecution', 't1', { commandExecution: { command: 'c', status: 'completed' } }),
      msg('c4', 'commandExecution', 't2', { commandExecution: { command: 'd', status: 'completed' } }),
      msg('c5', 'commandExecution', 't2', { commandExecution: { command: 'e', status: 'completed' } }),
    ]
    const folds = buildProcessFolds(messages)
    expect(folds).toHaveLength(2)
    expect(folds[0]?.messages.map((m) => m.id)).toEqual(['c1', 'c2'])
    expect(folds[1]?.messages.map((m) => m.id)).toEqual(['c4', 'c5'])
  })

  it('keeps turnError (warn) messages outside folds and starts a new fold after them', () => {
    // partitionTurnItems 语义：warn 永不折叠，且不并入相邻折叠组
    const messages = [
      msg('u1', 'user', 't1', { role: 'user' }),
      msg('c1', 'commandExecution', 't1', { commandExecution: { command: 'a', status: 'completed' } }),
      msg('c2', 'commandExecution', 't1', { commandExecution: { command: 'b', status: 'completed' } }),
      msg('e1', 'turnError', 't1', { role: 'system', text: 'Access is denied' }),
      msg('c3', 'commandExecution', 't1', { commandExecution: { command: 'c', status: 'completed' } }),
      msg('c4', 'commandExecution', 't1', { commandExecution: { command: 'd', status: 'completed' } }),
    ]
    const folds = buildProcessFolds(messages)
    expect(folds).toHaveLength(2)
    expect(folds[0]?.messages.map((m) => m.id)).toEqual(['c1', 'c2'])
    expect(folds[1]?.messages.map((m) => m.id)).toEqual(['c3', 'c4'])
  })

  it('keeps user (steer) messages out of folds, rendering them on the user side', () => {
    // partitionTurnItems 语义：steer 是用户自己的话（本地为 user 消息发送模式），
    // 永不进折叠；前后同轮工作消息各自独立成组
    const messages = [
      msg('c1', 'commandExecution', 't1', { commandExecution: { command: 'a', status: 'completed' } }),
      msg('c2', 'commandExecution', 't1', { commandExecution: { command: 'b', status: 'completed' } }),
      msg('u2', 'userMessage', 't2', { role: 'user', text: 'steer prompt' }),
      msg('c3', 'commandExecution', 't2', { commandExecution: { command: 'c', status: 'completed' } }),
      msg('c4', 'commandExecution', 't2', { commandExecution: { command: 'd', status: 'completed' } }),
    ]
    const folds = buildProcessFolds(messages)
    expect(folds).toHaveLength(2)
    expect(folds[0]?.messages.map((m) => m.id)).toEqual(['c1', 'c2'])
    expect(folds[1]?.messages.map((m) => m.id)).toEqual(['c3', 'c4'])
  })

  it('keeps work messages with no turnId ungrouped', () => {
    const messages = [
      msg('u1', 'user', 't1', { role: 'user' }),
      msg('c1', 'commandExecution', 't1', { commandExecution: { command: 'a', status: 'completed' } }),
      msg('c2', 'commandExecution', undefined, { commandExecution: { command: 'b', status: 'completed' } }),
      msg('c3', 'commandExecution', 't1', { commandExecution: { command: 'c', status: 'completed' } }),
    ]
    const folds = buildProcessFolds(messages)
    // c1 与 c2 相邻但 c2 无 turnId：不并入 c1 的组，c1 单独不折叠；c2/c3 均不折叠
    expect(folds).toHaveLength(0)
  })

  it('counts tools and detects running state', () => {
    const messages = [
      msg('u1', 'user', 't1', { role: 'user' }),
      msg('tc1', 'toolCall', 't1', { toolCall: { server: 's', tool: 'read', status: 'completed' } }),
      msg('tc2', 'toolCall', 't1', { toolCall: { server: 's', tool: 'write', status: 'inProgress' } }),
      msg('c1', 'commandExecution', 't1', { commandExecution: { command: 'a', status: 'completed' } }),
      msg('a1', 'agentMessage', 't1', { role: 'assistant', text: 'done' }),
    ]
    const folds = buildProcessFolds(messages)
    expect(folds).toHaveLength(1)
    expect(folds[0]?.toolCount).toBe(2)
    expect(folds[0]?.thoughtCount).toBe(0)
    expect(folds[0]?.running).toBe(true)
  })

  it('reads duration from the worked message of the same turn', () => {
    const messages = [
      msg('u1', 'user', 't1', { role: 'user' }),
      msg('c1', 'commandExecution', 't1', { commandExecution: { command: 'a', status: 'completed' } }),
      msg('c2', 'commandExecution', 't1', { commandExecution: { command: 'b', status: 'completed' } }),
      msg('w1', 'worked', 't1', { durationMs: 125_000 }),
      msg('a1', 'agentMessage', 't1', { role: 'assistant', text: 'done' }),
    ]
    const folds = buildProcessFolds(messages)
    expect(folds[0]?.durationMs).toBe(125_000)
  })

  it('marks hasOutsideContent true when the turn carries non-folded content', () => {
    const messages = [
      msg('u1', 'user', 't1', { role: 'user' }),
      msg('c1', 'commandExecution', 't1', { commandExecution: { command: 'a', status: 'completed' } }),
      msg('c2', 'commandExecution', 't1', { commandExecution: { command: 'b', status: 'completed' } }),
      msg('a1', 'agentMessage', 't1', { role: 'assistant', text: 'done' }),
    ]
    expect(buildProcessFolds(messages)[0]?.hasOutsideContent).toBe(true)
  })
})

describe('buildProcessFoldLabel', () => {
  const fold = buildProcessFolds([
    msg('u1', 'user', 't1', { role: 'user' }),
    msg('r1', 'reasoning', 't1'),
    msg('tc1', 'toolCall', 't1', { toolCall: { server: 's', tool: 'read', status: 'completed' } }),
    msg('tc2', 'toolCall', 't1', { toolCall: { server: 's', tool: 'write', status: 'completed' } }),
    msg('w1', 'worked', 't1', { durationMs: 150_000 }),
    msg('a1', 'agentMessage', 't1', { role: 'assistant', text: 'done' }),
  ])[0]!

  it('combines duration, tool count and thought count', () => {
    // reasoning 不折叠，折叠条只统计命令/工具
    expect(buildProcessFoldLabel(fold, { t, formatDuration })).toBe('150s · 2 tools')
  })

  it('shows a working label while the fold is running', () => {
    const runningFold = buildProcessFolds([
      msg('u1', 'user', 't1', { role: 'user' }),
      msg('tc1', 'toolCall', 't1', { toolCall: { server: 's', tool: 'read', status: 'inProgress' } }),
      msg('tc2', 'toolCall', 't1', { toolCall: { server: 's', tool: 'write', status: 'completed' } }),
    ])[0]!
    expect(buildProcessFoldLabel(runningFold, { t, formatDuration })).toBe('Working… · 2 tools')
  })

  it('falls back to Processed with a command count when no duration exists', () => {
    const bareFold = buildProcessFolds([
      msg('u1', 'user', 't1', { role: 'user' }),
      msg('c1', 'commandExecution', 't1', { commandExecution: { command: 'a', status: 'completed' } }),
      msg('c2', 'commandExecution', 't1', { commandExecution: { command: 'b', status: 'completed' } }),
      msg('a1', 'agentMessage', 't1', { role: 'assistant', text: 'done' }),
    ])[0]!
    expect(buildProcessFoldLabel(bareFold, { t, formatDuration })).toBe('Processed · 2 commands')
  })

  it('counts command work items inside the fold', () => {
    const fold = buildProcessFolds([
      msg('u1', 'user', 't1', { role: 'user' }),
      msg('c1', 'commandExecution', 't1', { commandExecution: { command: 'a', status: 'completed' } }),
      msg('c2', 'commandExecution', 't1', { commandExecution: { command: 'b', status: 'completed' } }),
      msg('c3', 'commandExecution', 't1', { commandExecution: { command: 'c', status: 'completed' } }),
      msg('a1', 'agentMessage', 't1', { role: 'assistant', text: 'done' }),
    ])[0]!
    expect(fold.commandCount).toBe(3)
    expect(buildProcessFoldLabel(fold, { t, formatDuration })).toBe('Processed · 3 commands')
  })
})

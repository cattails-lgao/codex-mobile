import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join } from 'node:path'
import {
  asRecord,
  readNonEmptyString,
  runCommand,
  runCommandCapture,
} from './core.js'

type SessionRecoveredFileChange = {
  path: string
  operation: 'add' | 'delete' | 'update'
  movedToPath: string | null
  diff: string
  addedLineCount: number
  removedLineCount: number
}

type SessionRecoveredTurnFileChanges = {
  turnId: string
  turnIndex: number
  fileChanges: SessionRecoveredFileChange[]
}

type SessionRecoveredSkillInput = {
  name: string
  path: string
}

type SessionSkillInputCacheEntry = {
  size: number
  mtimeMs: number
  skillsByTurnId: Map<string, SessionRecoveredSkillInput[]>
}

const SESSION_SKILL_INPUT_CACHE_LIMIT = 64
const sessionSkillInputCache = new Map<string, SessionSkillInputCacheEntry>()

function parseSessionSkillText(value: string): SessionRecoveredSkillInput | null {
  const trimmed = value.trim()
  if (!trimmed.startsWith('<skill>')) return null
  const name = trimmed.match(/<name>\s*([\s\S]*?)\s*<\/name>/u)?.[1]?.trim() ?? ''
  const path = trimmed.match(/<path>\s*([\s\S]*?)\s*<\/path>/u)?.[1]?.trim() ?? ''
  if (!name || !path) return null
  return { name, path }
}

function buildSessionSkillInputsByTurn(sessionLogRaw: string): Map<string, SessionRecoveredSkillInput[]> {
  let currentTurnId = ''
  const skillsByTurnId = new Map<string, SessionRecoveredSkillInput[]>()

  for (const line of sessionLogRaw.split('\n')) {
    if (!line.trim()) continue
    let row: Record<string, unknown> | null = null
    try {
      row = JSON.parse(line) as Record<string, unknown>
    } catch {
      continue
    }

    if (row.type === 'turn_context') {
      const payloadRecord = asRecord(row.payload)
      currentTurnId = readNonEmptyString(payloadRecord?.turn_id) || currentTurnId
      continue
    }
    if (row.type === 'event_msg') {
      const payloadRecord = asRecord(row.payload)
      if (payloadRecord?.type === 'task_started') {
        currentTurnId = readNonEmptyString(payloadRecord.turn_id) || currentTurnId
      }
      continue
    }

    if (row.type !== 'response_item' || !currentTurnId) continue
    const payloadRecord = asRecord(row.payload)
    if (payloadRecord?.type !== 'message' || payloadRecord.role !== 'user') continue
    const content = Array.isArray(payloadRecord.content) ? payloadRecord.content : []

    for (const contentItem of content) {
      const contentRecord = asRecord(contentItem)
      if (contentRecord?.type !== 'input_text' || typeof contentRecord.text !== 'string') continue
      const skill = parseSessionSkillText(contentRecord.text)
      if (!skill) continue
      const existing = skillsByTurnId.get(currentTurnId) ?? []
      if (!existing.some((item) => item.path === skill.path)) {
        existing.push(skill)
        skillsByTurnId.set(currentTurnId, existing)
      }
    }
  }

  return skillsByTurnId
}

async function readCachedSessionSkillInputsByTurn(sessionPath: string): Promise<Map<string, SessionRecoveredSkillInput[]>> {
  const sessionStat = await stat(sessionPath)
  const cached = sessionSkillInputCache.get(sessionPath)
  if (cached && cached.size === sessionStat.size && cached.mtimeMs === sessionStat.mtimeMs) {
    return cached.skillsByTurnId
  }

  const sessionLogRaw = await readFile(sessionPath, 'utf8')
  const skillsByTurnId = buildSessionSkillInputsByTurn(sessionLogRaw)
  sessionSkillInputCache.set(sessionPath, {
    size: sessionStat.size,
    mtimeMs: sessionStat.mtimeMs,
    skillsByTurnId,
  })
  if (sessionSkillInputCache.size > SESSION_SKILL_INPUT_CACHE_LIMIT) {
    const oldestKey = sessionSkillInputCache.keys().next().value
    if (oldestKey) sessionSkillInputCache.delete(oldestKey)
  }
  return skillsByTurnId
}

function mergeSessionSkillInputsIntoTurnsFromMap(
  turns: unknown[],
  skillsByTurnId: Map<string, SessionRecoveredSkillInput[]>,
): unknown[] {
  const turnIds = new Set<string>()
  for (const turn of turns) {
    const turnRecord = asRecord(turn)
    const turnId = readNonEmptyString(turnRecord?.id)
    if (turnId) turnIds.add(turnId)
  }
  if (turnIds.size === 0) return turns

  if (skillsByTurnId.size === 0) return turns

  let changed = false
  const nextTurns = turns.map((turn) => {
    const turnRecord = asRecord(turn)
    const turnId = readNonEmptyString(turnRecord?.id)
    const skills = turnId ? skillsByTurnId.get(turnId) : undefined
    const items = Array.isArray(turnRecord?.items) ? turnRecord.items : null
    if (!turnRecord || !skills || skills.length === 0 || !items) return turn

    let targetUserMessageIndex = -1
    for (let index = items.length - 1; index >= 0; index -= 1) {
      const itemRecord = asRecord(items[index])
      if (itemRecord?.type === 'userMessage' && Array.isArray(itemRecord.content)) {
        targetUserMessageIndex = index
        break
      }
    }
    if (targetUserMessageIndex < 0) return turn

    let addedToMessage = false
    const nextItems = items.map((item, index) => {
      const itemRecord = asRecord(item)
      const content = Array.isArray(itemRecord?.content) ? itemRecord.content : null
      if (index !== targetUserMessageIndex || itemRecord?.type !== 'userMessage' || !content) return item

      const existingSkillPaths = new Set(
        content.flatMap((contentItem) => {
          const contentRecord = asRecord(contentItem)
          const path = typeof contentRecord?.path === 'string' ? contentRecord.path.trim() : ''
          return contentRecord?.type === 'skill' && path ? [path] : []
        }),
      )
      const missingSkills = skills.filter((skill) => !existingSkillPaths.has(skill.path))
      if (missingSkills.length === 0) return item

      addedToMessage = true
      changed = true
      return {
        ...itemRecord,
        content: [
          ...content,
          ...missingSkills.map((skill) => ({ type: 'skill', name: skill.name, path: skill.path })),
        ],
      }
    })

    return addedToMessage ? { ...turnRecord, items: nextItems } : turn
  })

  return changed ? nextTurns : turns
}

export function mergeSessionSkillInputsIntoTurns(turns: unknown[], sessionLogRaw: string): unknown[] {
  return mergeSessionSkillInputsIntoTurnsFromMap(turns, buildSessionSkillInputsByTurn(sessionLogRaw))
}

export async function mergeSessionSkillInputsIntoThreadResult(result: unknown): Promise<unknown> {
  const record = asRecord(result)
  const thread = asRecord(record?.thread)
  const turns = Array.isArray(thread?.turns) ? thread.turns : null
  const sessionPath = readNonEmptyString(thread?.path)
  if (!record || !thread || !turns || turns.length === 0 || !sessionPath || !isAbsolute(sessionPath)) {
    return result
  }

  try {
    const skillsByTurnId = await readCachedSessionSkillInputsByTurn(sessionPath)
    const mergedTurns = mergeSessionSkillInputsIntoTurnsFromMap(turns, skillsByTurnId)
    if (mergedTurns === turns) return result
    return {
      ...record,
      thread: {
        ...thread,
        turns: mergedTurns,
      },
    }
  } catch {
    return result
  }
}

function countRecoveredContentLines(value: string): number {
  if (!value) return 0
  const normalized = value.replace(/\r\n/g, '\n')
  const trimmed = normalized.endsWith('\n') ? normalized.slice(0, -1) : normalized
  if (!trimmed) return 0
  return trimmed.split('\n').length
}

function countRecoveredPatchLines(value: string): { addedLineCount: number; removedLineCount: number } {
  let addedLineCount = 0
  let removedLineCount = 0

  for (const line of value.replace(/\r\n/g, '\n').split('\n')) {
    if (!line) continue
    if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('@@')) continue
    if (line.startsWith('+')) {
      addedLineCount += 1
      continue
    }
    if (line.startsWith('-')) {
      removedLineCount += 1
    }
  }

  return { addedLineCount, removedLineCount }
}

function mergeRecoveredDiff(first: string, second: string): string {
  if (!first) return second
  if (!second || first === second) return first
  return `${first}\n${second}`.trim()
}

function mergeRecoveredFileChange(first: SessionRecoveredFileChange, second: SessionRecoveredFileChange): SessionRecoveredFileChange {
  const operation = first.operation === 'add' || second.operation === 'add'
    ? 'add'
    : first.operation === 'delete' || second.operation === 'delete'
      ? 'delete'
      : 'update'

  return {
    path: second.path || first.path,
    operation,
    movedToPath: second.movedToPath ?? first.movedToPath ?? null,
    diff: mergeRecoveredDiff(first.diff, second.diff),
    addedLineCount: first.addedLineCount + second.addedLineCount,
    removedLineCount: first.removedLineCount + second.removedLineCount,
  }
}

function isApplyPatchSectionBoundary(value: string): boolean {
  return value.startsWith('*** Update File: ')
    || value.startsWith('*** Add File: ')
    || value.startsWith('*** Delete File: ')
    || value === '*** End Patch'
}

function parseApplyPatchInput(input: string): SessionRecoveredFileChange[] {
  const normalized = input.replace(/\r\n/g, '\n')
  const lines = normalized.split('\n')
  const changes: SessionRecoveredFileChange[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? ''

    if (line.startsWith('*** Add File: ')) {
      const path = line.slice('*** Add File: '.length).trim()
      const contentLines: string[] = []
      for (index += 1; index < lines.length; index += 1) {
        const nextLine = lines[index] ?? ''
        if (isApplyPatchSectionBoundary(nextLine)) {
          index -= 1
          break
        }
        contentLines.push(nextLine.startsWith('+') ? nextLine.slice(1) : nextLine)
      }
      const diff = contentLines.join('\n').trimEnd()
      if (path) {
        changes.push({
          path,
          operation: 'add',
          movedToPath: null,
          diff,
          addedLineCount: countRecoveredContentLines(diff),
          removedLineCount: 0,
        })
      }
      continue
    }

    if (line.startsWith('*** Delete File: ')) {
      const path = line.slice('*** Delete File: '.length).trim()
      if (path) {
        changes.push({
          path,
          operation: 'delete',
          movedToPath: null,
          diff: '',
          addedLineCount: 0,
          removedLineCount: 0,
        })
      }
      continue
    }

    if (line.startsWith('*** Update File: ')) {
      const path = line.slice('*** Update File: '.length).trim()
      let movedToPath: string | null = null
      const diffLines: string[] = []

      for (index += 1; index < lines.length; index += 1) {
        const nextLine = lines[index] ?? ''
        if (nextLine.startsWith('*** Move to: ')) {
          const moved = nextLine.slice('*** Move to: '.length).trim()
          movedToPath = moved || null
          continue
        }
        if (isApplyPatchSectionBoundary(nextLine)) {
          index -= 1
          break
        }
        diffLines.push(nextLine)
      }

      const diff = diffLines.join('\n').trimEnd()
      const counts = countRecoveredPatchLines(diff)
      if (path) {
        changes.push({
          path,
          operation: 'update',
          movedToPath,
          diff,
          ...counts,
        })
      }
    }
  }

  return changes
}

export function buildSessionFileChangeFallback(threadReadPayload: unknown, sessionLogRaw: string): SessionRecoveredTurnFileChanges[] {
  const payload = asRecord(threadReadPayload)
  const thread = asRecord(payload?.thread)
  const turns = Array.isArray(thread?.turns) ? thread.turns : []
  const turnIndexById = new Map<string, number>()

  for (let turnIndex = 0; turnIndex < turns.length; turnIndex += 1) {
    const turnRecord = asRecord(turns[turnIndex])
    const turnId = readNonEmptyString(turnRecord?.id)
    if (turnId) {
      turnIndexById.set(turnId, turnIndex)
    }
  }

  const collectedByTurnId = new Map<string, SessionRecoveredFileChange[]>()
  let currentTurnId = ''

  for (const line of sessionLogRaw.split('\n')) {
    if (!line.trim()) continue
    let row: Record<string, unknown> | null = null
    try {
      row = JSON.parse(line) as Record<string, unknown>
    } catch {
      continue
    }

    if (row.type === 'turn_context') {
      const payloadRecord = asRecord(row.payload)
      currentTurnId = readNonEmptyString(payloadRecord?.turn_id) || currentTurnId
      continue
    }

    if (row.type !== 'response_item' || !currentTurnId || !turnIndexById.has(currentTurnId)) {
      continue
    }

    const payloadRecord = asRecord(row.payload)
    if (
      payloadRecord?.type !== 'custom_tool_call'
      || payloadRecord.name !== 'apply_patch'
      || payloadRecord.status !== 'completed'
    ) {
      continue
    }

    const input = readNonEmptyString(payloadRecord.input)
    if (!input) continue

    const parsedChanges = parseApplyPatchInput(input)
    if (parsedChanges.length === 0) continue

    const previous = collectedByTurnId.get(currentTurnId) ?? []
    previous.push(...parsedChanges)
    collectedByTurnId.set(currentTurnId, previous)
  }

  const recovered: SessionRecoveredTurnFileChanges[] = []
  for (const [turnId, fileChanges] of collectedByTurnId.entries()) {
    const turnIndex = turnIndexById.get(turnId)
    if (typeof turnIndex !== 'number' || fileChanges.length === 0) continue

    const mergedByPath = new Map<string, SessionRecoveredFileChange>()
    for (const fileChange of fileChanges) {
      const key = `${fileChange.path}\u0000${fileChange.movedToPath ?? ''}`
      const previous = mergedByPath.get(key)
      mergedByPath.set(key, previous ? mergeRecoveredFileChange(previous, fileChange) : { ...fileChange })
    }

    recovered.push({
      turnId,
      turnIndex,
      fileChanges: Array.from(mergedByPath.values()),
    })
  }

  return recovered.sort((first, second) => first.turnIndex - second.turnIndex)
}

type SessionRecoveredCommand = {
  id: string
  type: 'commandExecution'
  command: string
  cwd: string | null
  status: 'completed' | 'failed'
  aggregatedOutput: string
  exitCode: number | null
  durationMs: number | null
}

function parseExecCommandOutput(output: string): { exitCode: number | null; wallTime: number | null; cleanOutput: string } {
  let exitCode: number | null = null
  let wallTime: number | null = null
  const outputLines: string[] = []
  let pastHeader = false

  for (const line of output.split('\n')) {
    if (!pastHeader) {
      const exitMatch = line.match(/^Process exited with code (\d+)/) ?? line.match(/^Exit code:\s*(\d+)/)
      if (exitMatch) {
        exitCode = Number.parseInt(exitMatch[1]!, 10)
        continue
      }
      const wallMatch = line.match(/^Wall time:\s+([\d.]+)\s+seconds/)
      if (wallMatch) {
        wallTime = Math.round(Number.parseFloat(wallMatch[1]!) * 1000)
        continue
      }
      if (line.startsWith('Command:') || line.startsWith('Chunk ID:') || line.startsWith('Original token count:')) {
        continue
      }
      if (line === 'Output:') {
        pastHeader = true
        continue
      }
    }
    outputLines.push(line)
  }

  return { exitCode, wallTime, cleanOutput: outputLines.join('\n').trimEnd() }
}

type SessionRecoveredFileChangeItem = {
  id: string
  type: 'fileChange'
  status: 'completed'
  changes: Record<string, unknown>[]
}

type SessionItemSlot = {
  type: 'agentMessage' | 'commandExecution' | 'fileChange'
  command?: SessionRecoveredCommand
  fileChange?: SessionRecoveredFileChangeItem
}

function buildSessionItemOrder(sessionLogRaw: string, turnIds: Set<string>): Map<string, SessionItemSlot[]> {
  let currentTurnId = ''
  const orderByTurnId = new Map<string, SessionItemSlot[]>()
  const callIdToCommand = new Map<string, SessionRecoveredCommand>()

  for (const line of sessionLogRaw.split('\n')) {
    if (!line.trim()) continue
    let row: Record<string, unknown> | null = null
    try {
      row = JSON.parse(line) as Record<string, unknown>
    } catch {
      continue
    }

    if (row.type === 'turn_context') {
      const p = asRecord(row.payload)
      currentTurnId = readNonEmptyString(p?.turn_id) || currentTurnId
      continue
    }
    if (row.type === 'event_msg') {
      const p = asRecord(row.payload)
      if (p?.type === 'task_started') {
        currentTurnId = readNonEmptyString(p.turn_id) || currentTurnId
      }
      continue
    }

    if (row.type !== 'response_item' || !currentTurnId || !turnIds.has(currentTurnId)) continue
    const payload = asRecord(row.payload)
    if (!payload) continue

    let slots = orderByTurnId.get(currentTurnId)
    if (!slots) {
      slots = []
      orderByTurnId.set(currentTurnId, slots)
    }

    if (payload.type === 'message' && payload.role === 'assistant') {
      // 只把「有文本」的 assistant 回复记为 agent slot：模型在工具调用间隙
      // 产生的空文本消息（content 只有空 output_text）在 app-server 物化时
      // 会被合并/丢弃，若也计入 slot 数会让 agentSlotCount 虚高，导致
      // mergeSessionCommandsIntoTurns 误判「物化合并了轮内回复」而走
      // 「命令排前、回复追加轮末」分支——所有命令/工具块堆到回复之前
      // （round-34：processFold 全跑到对话前面，线上 rollout 复现）。
      const content = Array.isArray(payload.content) ? payload.content : []
      const hasText = content.some((item) => {
        const record = asRecord(item)
        return typeof record?.text === 'string' && record.text.trim().length > 0
      })
      if (hasText) slots.push({ type: 'agentMessage' })
      continue
    }

    if (payload.type === 'function_call') {
      const toolName = readNonEmptyString(payload.name)
      const isCommandCall = toolName === 'exec_command' || toolName === 'shell_command'
      if (!isCommandCall) continue
      const callId = readNonEmptyString(payload.call_id)
      if (!callId) continue
      let cmd = ''
      try {
        const args = JSON.parse(payload.arguments as string) as Record<string, unknown>
        cmd = typeof args.cmd === 'string'
          ? args.cmd
          : (typeof args.command === 'string' ? args.command : '')
      } catch { /* empty */ }
      const command: SessionRecoveredCommand = {
        id: `session-cmd-${callId}`,
        type: 'commandExecution',
        command: cmd,
        cwd: null,
        status: 'completed',
        aggregatedOutput: '',
        exitCode: null,
        durationMs: null,
      }
      callIdToCommand.set(callId, command)
      slots.push({ type: 'commandExecution', command })
      continue
    }

    if (payload.type === 'function_call_output') {
      const callId = readNonEmptyString(payload.call_id)
      if (!callId) continue
      const existing = callIdToCommand.get(callId)
      if (!existing) continue
      const rawOutput = typeof payload.output === 'string' ? payload.output : ''
      const parsed = parseExecCommandOutput(rawOutput)
      existing.aggregatedOutput = parsed.cleanOutput
      existing.exitCode = parsed.exitCode
      existing.durationMs = parsed.wallTime
      existing.status = parsed.exitCode === 0 || parsed.exitCode === null ? 'completed' : 'failed'
    }

    if (payload.type === 'custom_tool_call' && payload.name === 'apply_patch' && payload.status === 'completed') {
      const input = typeof payload.input === 'string' ? payload.input : ''
      const callId = readNonEmptyString(payload.call_id)
      if (!input || !callId) continue
      const parsedChanges = parseApplyPatchInput(input)
      if (parsedChanges.length === 0) continue
      const fcItem: SessionRecoveredFileChangeItem = {
        id: `session-fc-${callId}`,
        type: 'fileChange',
        status: 'completed',
        changes: parsedChanges.map((fc) => ({
          ...fc,
          kind: { type: fc.operation, ...(fc.movedToPath ? { move_path: fc.movedToPath } : {}) },
        })),
      }
      slots.push({ type: 'fileChange', fileChange: fcItem })
    }
  }

  return orderByTurnId
}

function extractFilePathsFromCommand(cmd: string, cwd: string): string[] {
  const paths: string[] = []
  const absPathPattern = /(?:^|\s|>>|>|<)(\/?(?:Users|home|tmp|var|etc|root)\/[^\s;|&><"']+)/g
  let match: RegExpExecArray | null
  while ((match = absPathPattern.exec(cmd)) !== null) {
    const p = match[1]?.trim()
    if (p && !p.endsWith('/') && !p.startsWith('-')) paths.push(p)
  }

  const redirectPattern = /(?:>>?|cat\s*>\s*)([^\s;|&><"']+)/g
  while ((match = redirectPattern.exec(cmd)) !== null) {
    const p = match[1]?.trim()
    if (p && !p.startsWith('-') && !p.startsWith('/dev/')) {
      paths.push(isAbsolute(p) ? p : join(cwd, p))
    }
  }

  return [...new Set(paths)]
}

type CollectedTurnFileInfo = {
  patchInputs: { callId: string; input: string }[]
  commandFilePaths: string[]
}

export function collectFileChangesForTurns(
  sessionLogRaw: string,
  turnIdsToRevert: Set<string>,
  cwd: string,
): Map<string, CollectedTurnFileInfo> {
  let currentTurnId = ''
  const infoByTurnId = new Map<string, CollectedTurnFileInfo>()

  for (const line of sessionLogRaw.split('\n')) {
    if (!line.trim()) continue
    let row: Record<string, unknown> | null = null
    try {
      row = JSON.parse(line) as Record<string, unknown>
    } catch {
      continue
    }

    if (row.type === 'turn_context') {
      const p = asRecord(row.payload)
      currentTurnId = readNonEmptyString(p?.turn_id) || currentTurnId
      continue
    }
    if (row.type === 'event_msg') {
      const p = asRecord(row.payload)
      if (p?.type === 'task_started') {
        currentTurnId = readNonEmptyString(p.turn_id) || currentTurnId
      }
      continue
    }

    if (row.type !== 'response_item' || !currentTurnId || !turnIdsToRevert.has(currentTurnId)) continue
    const payload = asRecord(row.payload)
    if (!payload) continue

    let info = infoByTurnId.get(currentTurnId)
    if (!info) {
      info = { patchInputs: [], commandFilePaths: [] }
      infoByTurnId.set(currentTurnId, info)
    }

    if (payload.type === 'custom_tool_call' && payload.name === 'apply_patch' && payload.status === 'completed') {
      const input = typeof payload.input === 'string' ? payload.input : ''
      const callId = readNonEmptyString(payload.call_id)
      if (input && callId) {
        info.patchInputs.push({ callId, input })
      }
    }

    if (payload.type === 'function_call' && payload.name === 'exec_command') {
      let cmd = ''
      try {
        const args = JSON.parse(payload.arguments as string) as Record<string, unknown>
        cmd = typeof args.cmd === 'string' ? args.cmd : ''
      } catch { /* empty */ }
      if (cmd) {
        const extracted = extractFilePathsFromCommand(cmd, cwd)
        for (const p of extracted) {
          if (!info.commandFilePaths.includes(p)) info.commandFilePaths.push(p)
        }
      }
    }
  }

  return infoByTurnId
}

function reverseV4aDiff(fileContent: string, diffText: string): string | null {
  const fileLines = fileContent.split('\n')
  const rawDiffLines = diffText.split('\n')
  while (rawDiffLines.length > 0 && rawDiffLines[rawDiffLines.length - 1]?.trim() === '') rawDiffLines.pop()
  const diffLines = rawDiffLines
  const result = [...fileLines]

  type DiffEntry = { type: 'context' | 'add' | 'remove'; text: string }
  const hunks: DiffEntry[][] = []
  let currentHunk: DiffEntry[] | null = null

  for (const dl of diffLines) {
    if (dl.startsWith('@@')) {
      if (currentHunk) hunks.push(currentHunk)
      currentHunk = []
      continue
    }
    if (!currentHunk) continue
    if (dl.startsWith('+')) {
      currentHunk.push({ type: 'add', text: dl.slice(1) })
    } else if (dl.startsWith('-')) {
      currentHunk.push({ type: 'remove', text: dl.slice(1) })
    } else if (dl.startsWith(' ')) {
      currentHunk.push({ type: 'context', text: dl.slice(1) })
    } else {
      currentHunk.push({ type: 'context', text: dl })
    }
  }
  if (currentHunk) hunks.push(currentHunk)

  for (let hi = hunks.length - 1; hi >= 0; hi--) {
    const hunk = hunks[hi]!
    const expectedSequence = hunk
      .filter((e) => e.type === 'context' || e.type === 'add')
      .map((e) => e.text)

    if (expectedSequence.length === 0) continue

    let seqStart = -1
    outer: for (let ri = result.length - expectedSequence.length; ri >= 0; ri--) {
      for (let si = 0; si < expectedSequence.length; si++) {
        if (result[ri + si] !== expectedSequence[si]) continue outer
      }
      seqStart = ri
      break
    }

    if (seqStart < 0) return null

    const newLines: string[] = []
    let seqIdx = 0
    for (const entry of hunk) {
      if (entry.type === 'context') {
        newLines.push(result[seqStart + seqIdx]!)
        seqIdx++
      } else if (entry.type === 'add') {
        seqIdx++
      } else if (entry.type === 'remove') {
        newLines.push(entry.text)
      }
    }

    result.splice(seqStart, expectedSequence.length, ...newLines)
  }

  return result.join('\n')
}

function applyV4aDiff(fileContent: string, diffText: string): string | null {
  const fileLines = fileContent === '' ? [] : fileContent.split('\n')
  const rawDiffLines = diffText.split('\n')
  while (rawDiffLines.length > 0 && rawDiffLines[rawDiffLines.length - 1]?.trim() === '') rawDiffLines.pop()
  const result = [...fileLines]

  type DiffEntry = { type: 'context' | 'add' | 'remove'; text: string }
  type DiffHunk = { oldStart: number; entries: DiffEntry[] }
  const hunks: DiffHunk[] = []
  let currentHunk: DiffHunk | null = null

  for (const dl of rawDiffLines) {
    const hunkMatch = dl.match(/^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/u)
    if (hunkMatch) {
      if (currentHunk) hunks.push(currentHunk)
      currentHunk = { oldStart: Math.max(Number(hunkMatch[1] ?? '1') - 1, 0), entries: [] }
      continue
    }
    if (!currentHunk) continue
    if (dl.startsWith('+')) {
      currentHunk.entries.push({ type: 'add', text: dl.slice(1) })
    } else if (dl.startsWith('-')) {
      currentHunk.entries.push({ type: 'remove', text: dl.slice(1) })
    } else if (dl.startsWith(' ')) {
      currentHunk.entries.push({ type: 'context', text: dl.slice(1) })
    } else {
      currentHunk.entries.push({ type: 'context', text: dl })
    }
  }
  if (currentHunk) hunks.push(currentHunk)

  for (const hunk of hunks) {
    const expectedSequence = hunk.entries
      .filter((e) => e.type === 'context' || e.type === 'remove')
      .map((e) => e.text)

    let seqStart = -1
    if (expectedSequence.length === 0) {
      seqStart = Math.min(hunk.oldStart, result.length)
    } else {
      const maxStart = result.length - expectedSequence.length
      if (maxStart < 0) return null
      const preferredStart = Math.min(hunk.oldStart, Math.max(maxStart, 0))
      const candidateStarts = [
        ...Array.from({ length: maxStart + 1 }, (_, index) => preferredStart + index).filter((value) => value <= maxStart),
        ...Array.from({ length: preferredStart }, (_, index) => preferredStart - index - 1),
      ]
      outer: for (const ri of candidateStarts) {
        for (let si = 0; si < expectedSequence.length; si++) {
          if (result[ri + si] !== expectedSequence[si]) continue outer
        }
        seqStart = ri
        break
      }
    }

    if (seqStart < 0) return null

    const newLines: string[] = []
    let seqIdx = 0
    for (const entry of hunk.entries) {
      if (entry.type === 'context') {
        newLines.push(result[seqStart + seqIdx]!)
        seqIdx++
      } else if (entry.type === 'remove') {
        seqIdx++
      } else if (entry.type === 'add') {
        newLines.push(entry.text)
      }
    }

    result.splice(seqStart, expectedSequence.length, ...newLines)
  }

  return result.join('\n')
}

/** 归一化后判断 change 是否命中允许撤销的文件集合（patch 与文件双粒度）。 */
export function pathSetMatchesChange(allowedFilePaths: Set<string>, filePath: string, movedToPath: string | null): boolean {
  const candidates = movedToPath ? [filePath, movedToPath] : [filePath]
  return candidates.some((candidate) => allowedFilePaths.has(candidate))
}

export async function applyTurnFileChanges(
  cwd: string,
  turnInfos: Map<string, CollectedTurnFileInfo>,
  allowedPatchIds?: Set<string>,
  allowedFilePaths?: Set<string>,
): Promise<{ applied: number; errors: string[]; appliedPatchIds: string[] }> {
  if (turnInfos.size === 0) return { applied: 0, errors: [], appliedPatchIds: [] }

  let applied = 0
  const errors: string[] = []
  const appliedPatchIds: string[] = []
  const allPatchInputs = [...turnInfos.values()]
    .flatMap((info) => info.patchInputs)
    .filter((patch) => !allowedPatchIds || allowedPatchIds.has(patch.callId))

  for (const patch of allPatchInputs) {
    let patchApplied = false
    let patchHadError = false
    const changes = parseApplyPatchInput(patch.input)
    for (const change of changes) {
      const filePath = isAbsolute(change.path) ? change.path : join(cwd, change.path)
      const movedToPath = change.movedToPath
        ? (isAbsolute(change.movedToPath) ? change.movedToPath : join(cwd, change.movedToPath))
        : null
      if (allowedFilePaths && !pathSetMatchesChange(allowedFilePaths, filePath, movedToPath)) continue

      try {
        if (change.operation === 'add') {
          await mkdir(dirname(filePath), { recursive: true })
          await writeFile(filePath, change.diff ? `${change.diff}\n` : '', 'utf8')
          applied++
          patchApplied = true
          continue
        }

        if (change.operation === 'delete') {
          await rm(filePath, { force: true })
          applied++
          patchApplied = true
          continue
        }

        let sourcePath = filePath
        if (movedToPath) {
          const sourceStat = await stat(sourcePath).catch(() => null)
          if (!sourceStat) {
            const movedStat = await stat(movedToPath).catch(() => null)
            if (movedStat) sourcePath = movedToPath
          }
        }

        const currentContent = await readFile(sourcePath, 'utf8')
        const newContent = applyV4aDiff(currentContent, change.diff)
        if (newContent === null) {
          patchHadError = true
          errors.push(`Could not apply patch for ${sourcePath}`)
          continue
        }

        if (movedToPath) {
          if (sourcePath === movedToPath) {
            if (newContent !== currentContent) {
              await writeFile(movedToPath, newContent, 'utf8')
            }
          } else {
            await mkdir(dirname(movedToPath), { recursive: true })
            await writeFile(movedToPath, newContent, 'utf8')
            await rm(filePath, { force: true })
          }
        } else if (newContent !== currentContent) {
          await writeFile(filePath, newContent, 'utf8')
        }
        applied++
        patchApplied = true
      } catch (err) {
        patchHadError = true
        errors.push(`Failed to apply patch for ${filePath}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
    if (patchApplied && !patchHadError) appliedPatchIds.push(patch.callId)
  }

  return { applied, errors, appliedPatchIds }
}

export async function revertTurnFileChanges(
  cwd: string,
  turnInfos: Map<string, CollectedTurnFileInfo>,
  allowedPatchIds?: Set<string>,
  allowedFilePaths?: Set<string>,
): Promise<{ reverted: number; errors: string[]; revertedPatchIds: string[] }> {
  if (turnInfos.size === 0) return { reverted: 0, errors: [], revertedPatchIds: [] }

  let reverted = 0
  const errors: string[] = []
  const revertedPatchIds: string[] = []

  const allEntries = [...turnInfos.values()]
  const allPatchInputs = allEntries
    .flatMap((info) => info.patchInputs)
    .filter((patch) => !allowedPatchIds || allowedPatchIds.has(patch.callId))
    .reverse()
  const allCommandPaths = new Set(allEntries.flatMap((info) => info.commandFilePaths))

  let isGitRepo = false
  let gitRoot = ''
  try {
    gitRoot = await runCommandCapture('git', ['rev-parse', '--show-toplevel'], { cwd })
    isGitRepo = !!gitRoot
  } catch { /* not a git repo */ }

  const trackedFiles = new Set<string>()
  if (isGitRepo) {
    try {
      const tracked = await runCommandCapture('git', ['ls-files', '--full-name'], { cwd: gitRoot })
      for (const f of tracked.split('\n')) {
        if (f.trim()) trackedFiles.add(join(gitRoot, f.trim()))
      }
    } catch { /* empty */ }
  }

  const patchRevertedPaths = new Set<string>()

  for (const patch of allPatchInputs) {
    let patchReverted = false
    let patchHadError = false
    const changes = parseApplyPatchInput(patch.input)
    for (let ci = changes.length - 1; ci >= 0; ci--) {
      const change = changes[ci]!
      const filePath = isAbsolute(change.path) ? change.path : join(cwd, change.path)
      const movedToPath = change.movedToPath
        ? (isAbsolute(change.movedToPath) ? change.movedToPath : join(cwd, change.movedToPath))
        : null
      if (allowedFilePaths && !pathSetMatchesChange(allowedFilePaths, filePath, movedToPath)) continue

      try {
        if (change.operation === 'add') {
          const fileStat = await stat(filePath).catch(() => null)
          if (fileStat) {
            await rm(filePath, { force: true })
            reverted++
            patchRevertedPaths.add(filePath)
            patchReverted = true
          }
        } else if (change.operation === 'update' && (change.diff || movedToPath)) {
          let reversed = false
          try {
            const sourcePath = movedToPath ?? filePath
            const currentContent = await readFile(sourcePath, 'utf8')
            const newContent = reverseV4aDiff(currentContent, change.diff)
            if (newContent !== null && newContent !== currentContent) {
              if (movedToPath) {
                await mkdir(dirname(filePath), { recursive: true })
                await writeFile(filePath, newContent)
                await rm(movedToPath, { force: true })
              } else {
                await writeFile(filePath, newContent)
              }
              reverted++
              patchRevertedPaths.add(filePath)
              if (movedToPath) patchRevertedPaths.add(movedToPath)
              patchReverted = true
              reversed = true
            } else if (newContent !== null && movedToPath) {
              await mkdir(dirname(filePath), { recursive: true })
              await rename(movedToPath, filePath)
              reverted++
              patchRevertedPaths.add(filePath)
              patchRevertedPaths.add(movedToPath)
              patchReverted = true
              reversed = true
            }
          } catch { /* file read/write failed */ }

          if (!reversed) {
            const isTracked = trackedFiles.has(filePath)
            if (isTracked && isGitRepo) {
              const relativePath = filePath.startsWith(gitRoot + '/') ? filePath.slice(gitRoot.length + 1) : filePath
              try {
                await runCommand('git', ['checkout', 'HEAD', '--', relativePath], { cwd: gitRoot })
                if (movedToPath) {
                  await rm(movedToPath, { force: true })
                }
                reverted++
                patchRevertedPaths.add(filePath)
                if (movedToPath) patchRevertedPaths.add(movedToPath)
                patchReverted = true
              } catch {
                patchHadError = true
                errors.push(`Could not revert: ${filePath}`)
              }
            } else {
              patchHadError = true
              errors.push(`Could not reverse patch for untracked file: ${filePath}`)
            }
          }
        } else if (change.operation === 'delete') {
          const isTracked = trackedFiles.has(filePath)
          if (isTracked && isGitRepo) {
            const relativePath = filePath.startsWith(gitRoot + '/') ? filePath.slice(gitRoot.length + 1) : filePath
            try {
              await runCommand('git', ['checkout', 'HEAD', '--', relativePath], { cwd: gitRoot })
              reverted++
              patchRevertedPaths.add(filePath)
              patchReverted = true
            } catch {
              patchHadError = true
              errors.push(`Could not restore deleted file: ${filePath}`)
            }
          }
        }
      } catch (err) {
        patchHadError = true
        errors.push(`Failed to revert patch for ${filePath}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
    if (patchReverted) revertedPatchIds.push(patch.callId)
  }

  for (const filePath of allCommandPaths) {
    if (patchRevertedPaths.has(filePath)) continue
    const isTracked = trackedFiles.has(filePath)
    if (isTracked && isGitRepo) {
      const relativePath = filePath.startsWith(gitRoot + '/') ? filePath.slice(gitRoot.length + 1) : filePath
      try {
        await runCommand('git', ['checkout', 'HEAD', '--', relativePath], { cwd: gitRoot })
        reverted++
      } catch {
        errors.push(`Could not restore command-modified file: ${filePath}`)
      }
    }
  }

  return { reverted, errors, revertedPatchIds }
}

export function mergeSessionCommandsIntoTurns(turns: unknown[], sessionLogRaw: string): unknown[] {
  const turnIds = new Set<string>()
  for (const turn of turns) {
    const turnRecord = asRecord(turn)
    const turnId = readNonEmptyString(turnRecord?.id)
    if (turnId) turnIds.add(turnId)
  }

  if (turnIds.size === 0) return turns

  const orderByTurnId = buildSessionItemOrder(sessionLogRaw, turnIds)
  if (orderByTurnId.size === 0) return turns

  return turns.map((turn) => {
    const turnRecord = asRecord(turn)
    if (!turnRecord) return turn
    const turnId = readNonEmptyString(turnRecord.id)
    if (!turnId) return turn

    const slots = orderByTurnId.get(turnId)
    if (!slots || slots.length === 0) return turn

    const existingItems = Array.isArray(turnRecord.items) ? (turnRecord.items as Record<string, unknown>[]) : []
    // round-31：不再用 `session-` id 前缀做幂等判断——新版本 app-server 物化
    // 线程历史时原生就带 `session-cmd-` 前缀（v0.146+），此前缀判断会让
    // session-log 时序恢复对所有新线程失效（命令/回复顺序恢复不到）。交错
    // 结果由 rollout slots 决定，对同一输入重复执行结果一致（确定性幂等）。

    const agentMessages = existingItems.filter((it) => it.type === 'agentMessage')
    const userMessages = existingItems.filter((it) => it.type === 'userMessage')

    // The app-server already interleaves each reasoning item immediately before
    // the agentMessage it belongs to. The timeline recovery below reorders
    // commands/messages from the session log, and reasoning is not a slot kind,
    // so without pairing it would fall into the trailing "append everything
    // else" bucket and render after the final answer instead of beside its own
    // turn segment. Glue each reasoning to the message that followed it in the
    // raw items and re-emit them together.
    const reasoningsByMessageId = new Map<string, Record<string, unknown>[]>()
    let pendingReasonings: Record<string, unknown>[] = []
    for (const item of existingItems) {
      if (item.type === 'reasoning') {
        pendingReasonings.push(item)
      } else if (item.type === 'agentMessage') {
        if (pendingReasonings.length > 0) {
          reasoningsByMessageId.set(String(item.id ?? ''), pendingReasonings)
        }
        pendingReasonings = []
      }
    }
    const emitAgentMessage = (msg: Record<string, unknown>): void => {
      const leading = reasoningsByMessageId.get(String(msg.id ?? '')) ?? []
      interleaved.push(...leading, msg)
    }

    const agentSlotCount = slots.filter((slot) => slot.type === 'agentMessage').length
    const interleaved: Record<string, unknown>[] = [...userMessages]
    const recoveredIds = new Set<string>()
    if (agentMessages.length < agentSlotCount) {
      // round-31：物化把轮内多段回复合并（agent 消息数少于 rollout 的回复段），
      // 无法逐段交错。按 rollout 顺序把所有命令/文件变更排前，agent 回复追加到
      // 轮末——rollout 中带文本的最终回复本就在轮末，避免「命令块跑到对话最后」。
      for (const slot of slots) {
        if (slot.type === 'commandExecution' && slot.command) {
          interleaved.push(slot.command as unknown as Record<string, unknown>)
          recoveredIds.add(slot.command.id)
        } else if (slot.type === 'fileChange' && slot.fileChange) {
          interleaved.push(slot.fileChange as unknown as Record<string, unknown>)
          recoveredIds.add(slot.fileChange.id)
        }
      }
      for (const msg of agentMessages) emitAgentMessage(msg)
    } else {
      let agentIdx = 0
      for (const slot of slots) {
        if (slot.type === 'agentMessage') {
          if (agentIdx < agentMessages.length) {
            emitAgentMessage(agentMessages[agentIdx]!)
            agentIdx++
          }
        } else if (slot.type === 'commandExecution' && slot.command) {
          interleaved.push(slot.command as unknown as Record<string, unknown>)
          recoveredIds.add(slot.command.id)
        } else if (slot.type === 'fileChange' && slot.fileChange) {
          interleaved.push(slot.fileChange as unknown as Record<string, unknown>)
          recoveredIds.add(slot.fileChange.id)
        }
      }

      while (agentIdx < agentMessages.length) {
        emitAgentMessage(agentMessages[agentIdx]!)
        agentIdx++
      }
    }

    // Append whatever else the server persisted (reasoning, tool calls, plan,
    // turn errors, …) that the session-log slots did not cover. When the
    // session log recovered this turn's commands/file changes, drop the
    // commandExecution/fileChange rows the bridge captured from live
    // notifications (they were appended at the end and would otherwise stack).
    // Reasoning is excluded here: it is emitted with its own message above.
    const hasRecoveredWorkItems = recoveredIds.size > 0
    for (const item of existingItems) {
      if (item.type === 'userMessage' || item.type === 'agentMessage' || item.type === 'reasoning') continue
      if (recoveredIds.has(String(item.id ?? ''))) continue
      if (hasRecoveredWorkItems && (item.type === 'commandExecution' || item.type === 'fileChange')) continue
      interleaved.push(item)
    }

    return {
      ...turnRecord,
      items: interleaved,
    }
  })
}

function stripWindowsLongPathPrefix(value: string): string {
  const trimmed = value.trim()
  if (trimmed.startsWith('\\\\?\\UNC\\')) return `\\\\${trimmed.slice('\\\\?\\UNC\\'.length)}`
  if (trimmed.startsWith('\\\\?\\')) return trimmed.slice('\\\\?\\'.length)
  return trimmed
}

/**
 * Apply deterministic session-log chronology recovery to a thread/read result:
 * read the session log at `thread.path`, then interleave assistant messages
 * with the commands/file changes the CLI actually ran, in the order they were
 * streamed. This makes the persisted feed match the live view instead of
 * stacking all commands and all text into separate groups.
 */
export async function mergeSessionCommandsIntoThreadResult(result: unknown): Promise<unknown> {
  const record = asRecord(result)
  const thread = asRecord(record?.thread)
  const turns = Array.isArray(thread?.turns) ? thread.turns : null
  const sessionPath = stripWindowsLongPathPrefix(readNonEmptyString(thread?.path))
  if (!record || !thread || !turns || turns.length === 0 || !sessionPath || !isAbsolute(sessionPath)) {
    return result
  }

  try {
    const sessionLogRaw = await readFile(sessionPath, 'utf8')
    const mergedTurns = mergeSessionCommandsIntoTurns(turns, sessionLogRaw)
    if (mergedTurns === turns) return result
    return {
      ...record,
      thread: {
        ...thread,
        turns: mergedTurns,
      },
    }
  } catch {
    return result
  }
}
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BackendQueueProcessor,
  filterThreadListByIds,
  mergeSessionCommandsIntoTurns,
  mergeSessionSkillInputsIntoTurns,
  parseAutomationToml,
  pathSetMatchesChange,
  revertTurnFileChanges,
  sanitizeThreadTurnsInlinePayloads,
  toAutomationApiRecord,
} from './codexAppServerBridge'

const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII='
const pngDataUrl = `data:image/png;base64,${pngBase64}`
const gifBase64 = 'R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='
const jpegBase64 = '/9j/4AAQSkZJRgABAQAAAQABAAD/2w=='
const webpBase64 = 'UklGRiIAAABXRUJQVlA4IC4AAAAwAQCdASoBAAEAAQAcJaQAA3AA/vuUAAA='

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function localImagePathFromProxyUrl(value: string): string {
  const parsed = new URL(value, 'http://localhost')
  expect(parsed.pathname).toBe('/codex-local-image')
  const imagePath = parsed.searchParams.get('path')
  expect(imagePath).toBeTruthy()
  return imagePath ?? ''
}

describe('thread inline media sanitization', () => {
  it('externalizes inline image data from common thread payload fields', async () => {
    const result = await sanitizeThreadTurnsInlinePayloads('thread/read', {
      thread: {
        turns: [
          {
            id: 'turn-1',
            items: [
              {
                id: 'user-1',
                type: 'userMessage',
                content: [{ type: 'image', url: pngDataUrl }],
                images: [pngDataUrl],
              },
              {
                id: 'generated-1',
                type: 'imageGeneration',
                result: pngBase64,
              },
              {
                id: 'tool-output-1',
                type: 'functionCallOutput',
                result: pngBase64,
              },
            ],
          },
        ],
      },
    }) as {
      thread: {
        turns: Array<{
          items: Array<Record<string, unknown>>
        }>
      }
    }

    const [userMessage, generatedImage, toolOutput] = result.thread.turns[0].items
    const content = userMessage.content as Array<Record<string, unknown>>
    const images = userMessage.images as string[]

    expect(content[0].url).toMatch(/^\/codex-local-image\?path=/)
    expect(images[0]).toMatch(/^\/codex-local-image\?path=/)
    expect(generatedImage.type).toBe('imageView')
    expect(generatedImage.path).toEqual(expect.any(String))
    expect(toolOutput.result).toMatch(/^\/codex-local-image\?path=/)

    expect(existsSync(localImagePathFromProxyUrl(content[0].url as string))).toBe(true)
    expect(existsSync(localImagePathFromProxyUrl(images[0]))).toBe(true)
    expect(existsSync(generatedImage.path as string)).toBe(true)
    expect(existsSync(localImagePathFromProxyUrl(toolOutput.result as string))).toBe(true)
  })

  it('leaves non-image result strings untouched', async () => {
    const textResult = 'a'.repeat(128)
    const result = await sanitizeThreadTurnsInlinePayloads('thread/read', {
      thread: {
        turns: [
          {
            id: 'turn-1',
            items: [
              {
                id: 'tool-output-1',
                type: 'functionCallOutput',
                result: textResult,
              },
            ],
          },
        ],
      },
    }) as {
      thread: {
        turns: Array<{
          items: Array<{ result: string }>
        }>
      }
    }

    expect(result.thread.turns[0].items[0].result).toBe(textResult)
  })

  it('leaves non-image data URLs untouched in image-like fields', async () => {
    const dataUrl = 'data:text/plain;base64,aGVsbG8='
    const result = await sanitizeThreadTurnsInlinePayloads('thread/read', {
      thread: {
        turns: [
          {
            id: 'turn-1',
            items: [
              {
                id: 'tool-output-1',
                type: 'functionCallOutput',
                result: dataUrl,
              },
            ],
          },
        ],
      },
    }) as {
      thread: {
        turns: Array<{
          items: Array<{ result: string }>
        }>
      }
    }

    expect(result.thread.turns[0].items[0].result).toBe(dataUrl)
  })

  it('externalizes supported bare base64 image signatures with matching extensions', async () => {
    const result = await sanitizeThreadTurnsInlinePayloads('thread/read', {
      thread: {
        turns: [
          {
            id: 'turn-1',
            items: [
              {
                id: 'tool-output-1',
                type: 'functionCallOutput',
                images: [jpegBase64, webpBase64, gifBase64],
              },
            ],
          },
        ],
      },
    }) as {
      thread: {
        turns: Array<{
          items: Array<{ images: string[] }>
        }>
      }
    }

    const images = result.thread.turns[0].items[0].images
    expect(images).toHaveLength(3)
    expect(images.every((image) => image.startsWith('/codex-local-image?path='))).toBe(true)

    const [jpegPath, webpPath, gifPath] = images.map(localImagePathFromProxyUrl)
    expect(jpegPath.endsWith('.jpg')).toBe(true)
    expect(webpPath.endsWith('.webp')).toBe(true)
    expect(gifPath.endsWith('.gif')).toBe(true)
    expect(existsSync(jpegPath)).toBe(true)
    expect(existsSync(webpPath)).toBe(true)
    expect(existsSync(gifPath)).toBe(true)
  })

  it('externalizes nested replacement history image URLs', async () => {
    const result = await sanitizeThreadTurnsInlinePayloads('thread/read', {
      thread: {
        turns: [
          {
            id: 'turn-1',
            items: [
              {
                id: 'message-1',
                type: 'message',
                replacement_history: [
                  {
                    content: [
                      {
                        type: 'image',
                        image_url: pngDataUrl,
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    }) as {
      thread: {
        turns: Array<{
          items: Array<{
            replacement_history: Array<{
              content: Array<{ image_url: string }>
            }>
          }>
        }>
      }
    }

    const imageUrl = result.thread.turns[0].items[0].replacement_history[0].content[0].image_url
    expect(imageUrl).toMatch(/^\/codex-local-image\?path=/)
    expect(existsSync(localImagePathFromProxyUrl(imageUrl))).toBe(true)
  })

  it('does not sanitize inline images for methods without thread turns', async () => {
    const payload = {
      thread: {
        turns: [
          {
            id: 'turn-1',
            items: [
              {
                id: 'tool-output-1',
                type: 'functionCallOutput',
                result: pngBase64,
              },
            ],
          },
        ],
      },
    }

    const result = await sanitizeThreadTurnsInlinePayloads('thread/list', payload)

    expect(result).toBe(payload)
  })
})

describe('thread session skill recovery', () => {
  it('adds selected skill inputs from session JSONL to matching user messages', () => {
    const turns = [{
      id: 'turn-1',
      items: [{
        id: 'item-1',
        type: 'userMessage',
        content: [{ type: 'text', text: 'use a skill', text_elements: [] }],
      }],
    }]
    const sessionLog = [
      JSON.stringify({ type: 'turn_context', payload: { turn_id: 'turn-1' } }),
      JSON.stringify({
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'use a skill' }],
        },
      }),
      JSON.stringify({
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'user',
          content: [{
            type: 'input_text',
            text: '<skill>\n<name>browser-use:browser</name>\n<path>/Users/igor/.codex/plugins/browser/SKILL.md</path>\n---\n# Browser\n</skill>',
          }],
        },
      }),
    ].join('\n')

    const merged = mergeSessionSkillInputsIntoTurns(turns, sessionLog) as typeof turns
    expect(merged[0].items[0].content).toEqual([
      { type: 'text', text: 'use a skill', text_elements: [] },
      { type: 'skill', name: 'browser-use:browser', path: '/Users/igor/.codex/plugins/browser/SKILL.md' },
    ])
  })

  it('does not duplicate skill inputs that are already present', () => {
    const turns = [{
      id: 'turn-1',
      items: [{
        id: 'item-1',
        type: 'userMessage',
        content: [
          { type: 'text', text: 'use a skill', text_elements: [] },
          { type: 'skill', name: 'browser-use:browser', path: '/Users/igor/.codex/plugins/browser/SKILL.md' },
        ],
      }],
    }]
    const sessionLog = [
      JSON.stringify({ type: 'turn_context', payload: { turn_id: 'turn-1' } }),
      JSON.stringify({
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'user',
          content: [{
            type: 'input_text',
            text: '<skill>\n<name>browser-use:browser</name>\n<path>/Users/igor/.codex/plugins/browser/SKILL.md</path>\n</skill>',
          }],
        },
      }),
    ].join('\n')

    expect(mergeSessionSkillInputsIntoTurns(turns, sessionLog)).toBe(turns)
  })

  it('adds selected skill inputs to the last user message in a multi-message turn', () => {
    const turns = [{
      id: 'turn-1',
      items: [
        {
          id: 'item-1',
          type: 'userMessage',
          content: [{ type: 'text', text: 'first message', text_elements: [] }],
        },
        {
          id: 'item-2',
          type: 'agentMessage',
          content: [{ type: 'text', text: 'assistant reply', text_elements: [] }],
        },
        {
          id: 'item-3',
          type: 'userMessage',
          content: [{ type: 'text', text: 'second message', text_elements: [] }],
        },
      ],
    }]
    const sessionLog = [
      JSON.stringify({ type: 'turn_context', payload: { turn_id: 'turn-1' } }),
      JSON.stringify({
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'user',
          content: [{
            type: 'input_text',
            text: '<skill>\n<name>browser-use:browser</name>\n<path>/Users/igor/.codex/plugins/browser/SKILL.md</path>\n</skill>',
          }],
        },
      }),
    ].join('\n')

    const merged = mergeSessionSkillInputsIntoTurns(turns, sessionLog) as typeof turns
    expect(merged[0].items[0].content).toEqual([{ type: 'text', text: 'first message', text_elements: [] }])
    expect(merged[0].items[2].content).toEqual([
      { type: 'text', text: 'second message', text_elements: [] },
      { type: 'skill', name: 'browser-use:browser', path: '/Users/igor/.codex/plugins/browser/SKILL.md' },
    ])
  })
})

describe('backend queue scheduling', () => {
  it('reschedules a pending drain when a run-now request needs an earlier drain', async () => {
    vi.useFakeTimers()
    const processor = new BackendQueueProcessor({
      onNotification: () => () => undefined,
    } as never)
    const processThreadQueue = vi
      .spyOn(processor as unknown as { processThreadQueue: (threadId: string) => Promise<void> }, 'processThreadQueue')
      .mockResolvedValue(undefined)

    processor.scheduleThreadQueueDrain('thread-1', 5000)
    processor.scheduleThreadQueueDrain('thread-1', 0)

    await vi.advanceTimersByTimeAsync(0)
    expect(processThreadQueue).toHaveBeenCalledTimes(1)
    expect(processThreadQueue).toHaveBeenCalledWith('thread-1')

    await vi.advanceTimersByTimeAsync(5000)
    expect(processThreadQueue).toHaveBeenCalledTimes(1)

    processor.dispose()
  })
})

describe('automation TOML handling', () => {
  it('parses TOML string arrays without requiring JSON-only syntax', () => {
    const automation = parseAutomationToml([
      'version = 1',
      'id = "cron-smoke"',
      'kind = "cron"',
      'name = "Cron Smoke"',
      'prompt = "run"',
      'status = "ACTIVE"',
      'rrule = "FREQ=DAILY"',
      "cwds = ['/tmp/project-one', '/tmp/project,two']",
      'created_at = 111',
      'updated_at = 222',
      '[scheduler]',
      'execution_environment = "local"',
    ].join('\n'))

    expect(automation?.cwds).toEqual(['/tmp/project-one', '/tmp/project,two'])
    expect(automation?.createdAtMs).toBe(111)
    expect(automation?.extraTomlLines).toContain('[scheduler]')
  })

  it('omits preserved TOML internals from automation API records', () => {
    const automation = parseAutomationToml([
      'version = 1',
      'id = "cron-smoke"',
      'kind = "cron"',
      'name = "Cron Smoke"',
      'prompt = "run"',
      'status = "ACTIVE"',
      'rrule = "FREQ=DAILY"',
      'cwds = ["/tmp/project-one"]',
      '[scheduler]',
      'execution_environment = "local"',
    ].join('\n'))

    expect(automation).toBeTruthy()
    expect(toAutomationApiRecord(automation as NonNullable<typeof automation>)).not.toHaveProperty('extraTomlLines')
  })
})

describe('filterThreadListByIds', () => {
  it('drops rows whose id is in the exclude set', () => {
    const result = filterThreadListByIds(
      {
        data: [
          { id: 'thread-user-1', preview: 'hello' },
          { id: 'thread-sub-1', preview: 'subagent work' },
          { id: 'thread-user-2', preview: 'world' },
        ],
        nextCursor: null,
      },
      new Set(['thread-sub-1']),
    ) as { data: Array<{ id: string }>; nextCursor: null }

    expect(result.data.map((row) => row.id)).toEqual(['thread-user-1', 'thread-user-2'])
  })

  it('returns the input unchanged when nothing is excluded', () => {
    const result = {
      data: [{ id: 'thread-user-1', preview: 'hello' }],
      nextCursor: null,
    }
    expect(filterThreadListByIds(result, new Set(['thread-missing-1']))).toBe(result)
    expect(filterThreadListByIds(result, new Set())).toBe(result)
  })

  it('leaves non-thread-list payloads untouched', () => {
    const result = { thread: { id: 'thread-user-1', turns: [] } }
    expect(filterThreadListByIds(result, new Set(['thread-user-1']))).toBe(result)
  })
})

describe('pathSetMatchesChange', () => {
  it('matches the file path, including a moved target path', () => {
    expect(pathSetMatchesChange(new Set(['/proj/src/a.ts']), '/proj/src/a.ts', null)).toBe(true)
    expect(pathSetMatchesChange(new Set(['/proj/src/a.ts']), '/proj/src/a.ts', '/proj/src/b.ts')).toBe(true)
    expect(pathSetMatchesChange(new Set(['/proj/src/b.ts']), '/proj/src/a.ts', '/proj/src/b.ts')).toBe(true)
  })

  it('rejects paths outside the allowed set', () => {
    expect(pathSetMatchesChange(new Set(['/proj/src/a.ts']), '/proj/src/c.ts', null)).toBe(false)
    expect(pathSetMatchesChange(new Set(), '/proj/src/a.ts', null)).toBe(false)
  })
})

describe('revertTurnFileChanges single-file scope', () => {
  const applyPatchInput = [
    '*** Begin Patch',
    '*** Update File: a.txt',
    '@@',
    '-A1',
    '+A2',
    '*** Update File: b.txt',
    '@@',
    '-B1',
    '+B2',
    '*** End Patch',
  ].join('\n')

  function turnInfosWithOnePatch(): Map<string, { patchInputs: Array<{ callId: string; input: string }>; commandFilePaths: string[] }> {
    return new Map([['turn-1', { patchInputs: [{ callId: 'call-1', input: applyPatchInput }], commandFilePaths: [] }]])
  }

  it('reverts only the requested file when filePaths is set', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'codexapp-file-undo-'))
    try {
      await writeFile(join(cwd, 'a.txt'), 'A2\n', 'utf8')
      await writeFile(join(cwd, 'b.txt'), 'B2\n', 'utf8')

      const result = await revertTurnFileChanges(cwd, turnInfosWithOnePatch(), undefined, new Set([join(cwd, 'a.txt')]))

      expect(result.reverted).toBe(1)
      expect(await readFile(join(cwd, 'a.txt'), 'utf8')).toBe('A1\n')
      expect(await readFile(join(cwd, 'b.txt'), 'utf8')).toBe('B2\n')
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }
  })

  it('reverts all files when no filePaths filter is set', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'codexapp-file-undo-all-'))
    try {
      await writeFile(join(cwd, 'a.txt'), 'A2\n', 'utf8')
      await writeFile(join(cwd, 'b.txt'), 'B2\n', 'utf8')

      const result = await revertTurnFileChanges(cwd, turnInfosWithOnePatch())

      expect(result.reverted).toBe(2)
      expect(await readFile(join(cwd, 'a.txt'), 'utf8')).toBe('A1\n')
      expect(await readFile(join(cwd, 'b.txt'), 'utf8')).toBe('B1\n')
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }
  })
})

describe('mergeSessionCommandsIntoTurns ordering', () => {
  // Simulates a turn as materialized by a modern app-server (v0.146+): the
  // rollout had multiple assistant replies interleaved with commands, but the
  // materialized turn collapsed them into one agentMessage placed after the
  // first command, leaving the remaining commands at the end of the turn.
  const materializedTurns = [
    {
      id: 'turn-1',
      items: [
        { id: 'item-1', type: 'userMessage' },
        { id: 'session-cmd-call_1', type: 'commandExecution' },
        { id: 'item-2', type: 'agentMessage' },
        { id: 'session-cmd-call_2', type: 'commandExecution' },
        { id: 'session-cmd-call_3', type: 'commandExecution' },
      ],
    },
  ]

  const sessionLog = [
    JSON.stringify({ type: 'turn_context', payload: { turn_id: 'turn-1' } }),
    JSON.stringify({ type: 'response_item', payload: { type: 'message', role: 'user', id: 'item-1' } }),
    JSON.stringify({ type: 'response_item', payload: { type: 'function_call', name: 'exec_command', call_id: 'call_1', arguments: '{"cmd":"ls"}' } }),
    JSON.stringify({ type: 'response_item', payload: { type: 'message', role: 'assistant', id: 'msg-1' } }),
    JSON.stringify({ type: 'response_item', payload: { type: 'function_call', name: 'exec_command', call_id: 'call_2', arguments: '{"cmd":"cat"}' } }),
    JSON.stringify({ type: 'response_item', payload: { type: 'message', role: 'assistant', id: 'msg-2' } }),
    JSON.stringify({ type: 'response_item', payload: { type: 'function_call', name: 'exec_command', call_id: 'call_3', arguments: '{"cmd":"grep"}' } }),
    JSON.stringify({ type: 'response_item', payload: { type: 'message', role: 'assistant', id: 'msg-3' } }),
  ].join('\n')

  it('puts the final agent reply at the end when materialization collapsed replies', () => {
    const result = mergeSessionCommandsIntoTurns(materializedTurns, sessionLog) as Array<{ items: Array<{ id: string; type: string }> }>
    const items = result[0].items
    expect(items[items.length - 1].type).toBe('agentMessage')
    expect(items.map((it) => it.type)).toEqual([
      'userMessage',
      'commandExecution',
      'commandExecution',
      'commandExecution',
      'agentMessage',
    ])
  })

  it('is idempotent across repeated recovery passes', () => {
    const once = mergeSessionCommandsIntoTurns(materializedTurns, sessionLog) as Array<{ items: Array<{ id: string; type: string }> }>
    const twice = mergeSessionCommandsIntoTurns(once, sessionLog) as Array<{ items: Array<{ id: string; type: string }> }>
    expect(twice[0].items.map((it) => it.type)).toEqual(once[0].items.map((it) => it.type))
    expect(twice[0].items[twice[0].items.length - 1].type).toBe('agentMessage')
  })

  it('interleaves commands with text-bearing agent replies in rollout order', () => {
    // round-34：模拟线上 rollout——模型在工具调用间隙发了很多「空文本」
    // assistant 消息（content 只有空 output_text），物化后只保留 2 条有文本
    // 回复。修复前空 assistant 也算 agent slot，agentSlotCount 虚高触发
    // 「命令排前、回复轮末」，工具调用块全部堆到回复之前。
    const materialized = [
      {
        id: 'turn-1',
        items: [
          { id: 'item-1', type: 'userMessage' },
          { id: 'session-cmd-call_1', type: 'commandExecution' },
          { id: 'session-cmd-call_2', type: 'commandExecution' },
          { id: 'session-fc-call_3', type: 'fileChange' },
          { id: 'session-cmd-call_4', type: 'commandExecution' },
          { id: 'item-2', type: 'agentMessage' },
          { id: 'item-3', type: 'agentMessage' },
        ],
      },
    ]
    const log = [
      JSON.stringify({ type: 'turn_context', payload: { turn_id: 'turn-1' } }),
      JSON.stringify({ type: 'response_item', payload: { type: 'message', role: 'user', id: 'item-1' } }),
      JSON.stringify({ type: 'response_item', payload: { type: 'function_call', name: 'exec_command', call_id: 'call_1', arguments: '{"cmd":"ls"}' } }),
      JSON.stringify({ type: 'response_item', payload: { type: 'message', role: 'assistant', id: 'msg-empty-1', content: [{ type: 'output_text', text: '' }] } }),
      JSON.stringify({ type: 'response_item', payload: { type: 'function_call', name: 'exec_command', call_id: 'call_2', arguments: '{"cmd":"cat"}' } }),
      JSON.stringify({ type: 'response_item', payload: { type: 'message', role: 'assistant', id: 'msg-1', content: [{ type: 'output_text', text: 'mid reply' }] } }),
      JSON.stringify({ type: 'response_item', payload: { type: 'custom_tool_call', name: 'apply_patch', call_id: 'call_3', input: '*** Begin Patch\n*** Update File: a.txt\n@@\n-x\n+y', status: 'completed' } }),
      JSON.stringify({ type: 'response_item', payload: { type: 'function_call', name: 'exec_command', call_id: 'call_4', arguments: '{"cmd":"grep"}' } }),
      JSON.stringify({ type: 'response_item', payload: { type: 'message', role: 'assistant', id: 'msg-2', content: [{ type: 'output_text', text: 'final reply' }] } }),
    ].join('\n')

    const result = mergeSessionCommandsIntoTurns(materialized, log) as Array<{ items: Array<{ id: string; type: string }> }>
    expect(result[0].items.map((it) => it.type)).toEqual([
      'userMessage',
      'commandExecution',
      'commandExecution',
      'agentMessage',
      'fileChange',
      'commandExecution',
      'agentMessage',
    ])
  })
})

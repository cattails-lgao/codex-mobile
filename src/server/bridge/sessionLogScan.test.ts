import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { iterateSessionLogLines, iterateSessionLogLinesFromText, readSessionLogFirstLine } from './sessionLogScan.js'
import { mergeSessionCommandsIntoTurns, mergeSessionCommandsIntoTurnsFromPath } from './session.js'

// round-185：桥层读 rollout 改成分行流式（见 sessionLogScan.ts 的事故说明）。这里锁三件事：
//   1. 流的切分必须与 `raw.split('\n')` 完全一致（含 CRLF、末尾无换行、超长行）；
//   2. `readSessionLogFirstLine` 只取第一行（ZIP 导出的 session_meta）；
//   3. 走文件（流式）与走字符串的两条恢复路径结果等价 —— 分块边界不能吃掉行。

async function collect(source: AsyncIterable<string>): Promise<string[]> {
  const lines: string[] = []
  for await (const line of source) lines.push(line)
  return lines
}

describe('iterateSessionLogLines', () => {
  let dir = ''

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'session-log-scan-'))
  })

  afterAll(async () => {
    if (dir) await rm(dir, { recursive: true, force: true })
  })

  it('CRLF 日志按行切开，与 split 口径一致', async () => {
    const path = join(dir, 'crlf.jsonl')
    await writeFile(path, 'alpha\r\nbeta\r\ngamma\r\n', 'utf8')
    expect(await collect(iterateSessionLogLines(path))).toEqual(['alpha', 'beta', 'gamma'])
  })

  it('末尾没有换行时最后一行仍然产出（文件可能正在追加）', async () => {
    const path = join(dir, 'no-trailing-newline.jsonl')
    await writeFile(path, 'alpha\nbeta\ngamma', 'utf8')
    expect(await collect(iterateSessionLogLines(path))).toEqual(['alpha', 'beta', 'gamma'])
  })

  it('空文件不产出任何行（与 split 的 [""] 不同，但所有消费者都跳过空行）', async () => {
    const path = join(dir, 'empty.jsonl')
    await writeFile(path, '', 'utf8')
    expect(await collect(iterateSessionLogLines(path))).toEqual([])
  })

  it('单行超过读块大小（64KiB）时不会被截断', async () => {
    const path = join(dir, 'long-line.jsonl')
    const bigPayload = 'x'.repeat(300 * 1024)
    await writeFile(path, `${JSON.stringify({ type: 'meta', payload: bigPayload })}\nsmall\n`, 'utf8')
    const lines = await collect(iterateSessionLogLines(path))
    expect(lines).toHaveLength(2)
    expect(JSON.parse(lines[0]).payload).toHaveLength(300 * 1024)
    expect(lines[1]).toBe('small')
  })

  it('内存行源与文件流切分一致', async () => {
    const raw = 'a\nbb\n\nccc\r\nd'
    // 内存行源只按 `\n` 切（与 `split('\n')` 逐位相同，保留 `\r`）；JSON.parse 会忽略它。
    expect(await collect(iterateSessionLogLinesFromText(raw))).toEqual(['a', 'bb', '', 'ccc\r', 'd'])
    expect(await collect(iterateSessionLogLinesFromText(''))).toEqual([''])
  })
})

describe('readSessionLogFirstLine', () => {
  let dir = ''

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'session-log-first-line-'))
  })

  afterAll(async () => {
    if (dir) await rm(dir, { recursive: true, force: true })
  })

  it('只返回第一行，即使文件很大', async () => {
    const path = join(dir, 'big.jsonl')
    const filler = Array.from({ length: 5000 }, (_, i) => JSON.stringify({ i, pad: 'y'.repeat(200) })).join('\n')
    await writeFile(path, `{"type":"session_meta","payload":{"cwd":"/tmp/project"}}\n${filler}\n`, 'utf8')
    expect(await readSessionLogFirstLine(path)).toBe('{"type":"session_meta","payload":{"cwd":"/tmp/project"}}')
  })

  it('空文件返回空字符串', async () => {
    const path = join(dir, 'empty.jsonl')
    await writeFile(path, '', 'utf8')
    expect(await readSessionLogFirstLine(path)).toBe('')
  })
})

describe('流式扫描与字符串扫描结果等价', () => {
  let dir = ''

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'session-log-equivalence-'))
  })

  afterAll(async () => {
    if (dir) await rm(dir, { recursive: true, force: true })
  })

  it('大量行 + 界外长行的日志，文件路径与字符串路径产出同一份恢复结果', async () => {
    const turnId = 'turn-1'
    const rows = [
      JSON.stringify({ type: 'turn_context', payload: { turn_id: turnId } }),
      JSON.stringify({ type: 'response_item', payload: { type: 'message', role: 'assistant', id: 'msg-1' } }),
      JSON.stringify({ type: 'response_item', payload: { type: 'function_call', name: 'exec_command', call_id: 'call_1', arguments: '{"cmd":"ls -la"}' } }),
      JSON.stringify({ type: 'response_item', payload: { type: 'function_call_output', call_id: 'call_1', output: 'ok' } }),
    ]
    // 塞一批无关行（每行 ~200B，跨多个 64KiB 读块），再放一条超长行模拟大输出。
    for (let i = 0; i < 4000; i += 1) {
      rows.push(JSON.stringify({ type: 'response_item', payload: { type: 'reasoning', id: `r${i}`, text: 'z'.repeat(180) } }))
    }
    rows.push(JSON.stringify({ type: 'response_item', payload: { type: 'message', role: 'assistant', id: 'msg-big', content: [{ type: 'output_text', text: 'w'.repeat(200 * 1024) }] } }))
    rows.push(JSON.stringify({ type: 'response_item', payload: { type: 'function_call', name: 'exec_command', call_id: 'call_2', arguments: '{"cmd":"pwd"}' } }))
    rows.push(JSON.stringify({ type: 'response_item', payload: { type: 'function_call_output', call_id: 'call_2', output: 'done' } }))

    const raw = rows.join('\n')
    const path = join(dir, 'equivalence.jsonl')
    await writeFile(path, `${raw}\n`, 'utf8')

    const turns = [{
      id: turnId,
      items: [
        { type: 'userMessage', id: 'u1' },
        { type: 'agentMessage', id: 'msg-1' },
      ],
    }]

    const fromPath = await mergeSessionCommandsIntoTurnsFromPath(structuredClone(turns), path)
    const fromText = await mergeSessionCommandsIntoTurns(structuredClone(turns), raw)
    expect(fromPath).toEqual(fromText)
    expect(fromPath).not.toEqual(turns)
  })
})

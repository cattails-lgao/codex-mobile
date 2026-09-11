import { createHash } from 'node:crypto'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { handleThreadHttpRequest } from './threadRoutes'
import { getCommandOutputSpillDir } from './payloadSlimming'

const writtenRefs = new Set<string>()

afterEach(async () => {
  for (const ref of writtenRefs) {
    try {
      await unlink(join(getCommandOutputSpillDir(), `${ref}.txt`))
    } catch {
      // already gone
    }
  }
  writtenRefs.clear()
})

async function writeSpillFile(body: string): Promise<string> {
  const ref = createHash('sha1').update(body, 'utf8').digest('hex')
  await mkdir(getCommandOutputSpillDir(), { recursive: true })
  await writeFile(join(getCommandOutputSpillDir(), `${ref}.txt`), body, 'utf8')
  writtenRefs.add(ref)
  return ref
}

async function callRoute(target: string): Promise<{ handled: boolean; statusCode: number; payload: unknown }> {
  let statusCode = 0
  let payload: unknown = null
  const handled = await handleThreadHttpRequest(
    { method: 'GET' } as never,
    {} as never,
    new URL(target, 'http://localhost'),
    {
      setJson: (_res, code, body) => {
        statusCode = code
        payload = body
      },
      appServer: {} as never,
      externalSessionTracker: {} as never,
      sanitizeThreadTurnsInlinePayloads: async () => null,
      isThreadMaterializationPendingError: () => false,
    },
  )
  return { handled, statusCode, payload }
}

describe('/codex-api/command-output', () => {
  it('serves the spilled command output for a valid handle', async () => {
    const body = `full output\n${'z'.repeat(40_000)}`
    const ref = await writeSpillFile(body)

    const { handled, statusCode, payload } = await callRoute(`/codex-api/command-output?ref=${ref}`)

    expect(handled).toBe(true)
    expect(statusCode).toBe(200)
    expect(payload).toEqual({ text: body })
  })

  it('rejects a handle that is not a bare sha1 digest', async () => {
    const { handled, statusCode } = await callRoute('/codex-api/command-output?ref=../../etc/passwd')
    expect(handled).toBe(true)
    expect(statusCode).toBe(400)
  })

  it('reports a missing handle as gone', async () => {
    const { handled, statusCode } = await callRoute(`/codex-api/command-output?ref=${'f'.repeat(40)}`)
    expect(handled).toBe(true)
    expect(statusCode).toBe(404)
  })

  it('leaves unrelated paths to the other route families', async () => {
    const { handled } = await callRoute('/codex-api/not-a-route')
    expect(handled).toBe(false)
  })
})

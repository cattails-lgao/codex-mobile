#!/usr/bin/env node
import { access, readFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '..')
const wavPath = join(rootDir, 'test', 'fixtures', 'hello.wav')
const port = 6199
const baseUrl = `http://127.0.0.1:${String(port)}`

async function waitForServer(maxAttempts = 60) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(`${baseUrl}/codex-api/home-directory`)
      if (response.ok) return
    } catch {
      // Server may not be ready yet.
    }
    await sleep(500)
  }
  throw new Error('Server did not become ready in time')
}

async function run() {
  await access(wavPath, constants.R_OK)

  const server = spawn(
    'node',
    ['dist-cli/index.js', '--port', String(port), '--no-password', '--no-tunnel'],
    {
      cwd: rootDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    },
  )

  let stderrLog = ''
  server.stderr.on('data', (chunk) => {
    stderrLog += String(chunk)
  })

  try {
    await waitForServer()

    const audioBuffer = await readFile(wavPath)
    const form = new FormData()
    form.append('file', new Blob([audioBuffer], { type: 'audio/wav' }), 'hello.wav')
    form.append('language', 'en')

    const response = await fetch(`${baseUrl}/codex-api/transcribe`, {
      method: 'POST',
      body: form,
    })

    const text = await response.text()
    let parsed = null
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = null
    }

    if (!response.ok) {
      throw new Error(
        `Transcribe request failed: HTTP ${String(response.status)} ${response.statusText}\n${text}`,
      )
    }
    if (!parsed || typeof parsed.text !== 'string' || parsed.text.trim().length === 0) {
      throw new Error(`Unexpected transcription response body: ${text}`)
    }

    console.log(`Transcription OK: "${parsed.text.trim()}"`)
  } finally {
    server.kill('SIGTERM')
    await sleep(500)
    if (!server.killed) {
      server.kill('SIGKILL')
    }
  }

  if (stderrLog.trim().length > 0) {
    console.log('Server stderr:')
    console.log(stderrLog.trim())
  }
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exit(1)
})

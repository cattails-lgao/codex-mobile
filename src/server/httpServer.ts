import { fileURLToPath } from 'node:url'
import { dirname, extname, isAbsolute, join } from 'node:path'
import type { Server as HttpServer, IncomingMessage } from 'node:http'
import { existsSync } from 'node:fs'
import { readFile, readdir, stat, writeFile } from 'node:fs/promises'
import express, { type Express } from 'express'
import { createCodexBridgeMiddleware } from './codexAppServerBridge.js'
import { createAuthSession } from './authMiddleware.js'
import { WebSocketServer, type WebSocket } from 'ws'

const __dirname = dirname(fileURLToPath(import.meta.url))
const distDir = join(__dirname, '..', 'dist')
const spaEntryFile = join(distDir, 'index.html')

export type ServerOptions = {
  password?: string
}

export type ServerInstance = {
  app: Express
  dispose: () => void
  attachWebSocket: (server: HttpServer) => void
}

const IMAGE_CONTENT_TYPES: Record<string, string> = {
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
}

function normalizeLocalImagePath(rawPath: string): string {
  const trimmed = rawPath.trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('file://')) {
    try {
      return decodeURIComponent(trimmed.replace(/^file:\/\//u, ''))
    } catch {
      return trimmed.replace(/^file:\/\//u, '')
    }
  }
  return trimmed
}

function normalizeLocalPath(rawPath: string): string {
  const trimmed = rawPath.trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('file://')) {
    try {
      return decodeURIComponent(trimmed.replace(/^file:\/\//u, ''))
    } catch {
      return trimmed.replace(/^file:\/\//u, '')
    }
  }
  return trimmed
}

function decodeBrowsePath(rawPath: string): string {
  if (!rawPath) return ''
  try {
    return decodeURIComponent(rawPath)
  } catch {
    return rawPath
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;')
}

function toBrowseHref(pathValue: string): string {
  return `/codex-local-browse${encodeURI(pathValue)}`
}

function toEditHref(pathValue: string): string {
  return `/codex-local-edit${encodeURI(pathValue)}`
}

function isTextEditablePath(pathValue: string): boolean {
  const extension = extname(pathValue).toLowerCase()
  return [
    '.txt', '.md', '.json', '.js', '.ts', '.tsx', '.jsx', '.css', '.scss',
    '.html', '.htm', '.xml', '.yml', '.yaml', '.log', '.csv', '.env', '.py',
    '.sh', '.toml', '.ini', '.conf', '.sql',
  ].includes(extension)
}

async function renderTextEditor(res: express.Response, localPath: string): Promise<void> {
  if (!isTextEditablePath(localPath)) {
    res.status(415).json({ error: 'Only text-like files are editable.' })
    return
  }

  const content = await readFile(localPath, 'utf8')
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Edit ${escapeHtml(localPath)}</title>
  <style>
    body { font-family: ui-monospace, Menlo, Monaco, monospace; margin: 16px; background: #0b1020; color: #dbe6ff; }
    .row { display: flex; gap: 8px; align-items: center; margin-bottom: 10px; flex-wrap: wrap; }
    button, a { background: #1b2a4a; color: #dbe6ff; border: 1px solid #345; padding: 6px 10px; border-radius: 6px; text-decoration: none; cursor: pointer; }
    button:hover, a:hover { filter: brightness(1.08); }
    textarea { width: 100%; min-height: calc(100vh - 130px); background: #07101f; color: #dbe6ff; border: 1px solid #345; border-radius: 8px; padding: 12px; box-sizing: border-box; }
    #status { margin-left: 8px; color: #8cc2ff; }
  </style>
</head>
<body>
  <div class="row">
    <a href="${escapeHtml(toBrowseHref(dirname(localPath)))}">Back</a>
    <button id="saveBtn" type="button">Save</button>
    <span id="status"></span>
  </div>
  <div class="row">${escapeHtml(localPath)}</div>
  <textarea id="editor">${escapeHtml(content)}</textarea>
  <script>
    const saveBtn = document.getElementById('saveBtn');
    const status = document.getElementById('status');
    const editor = document.getElementById('editor');
    saveBtn.addEventListener('click', async () => {
      status.textContent = 'Saving...';
      const response = await fetch(location.pathname, {
        method: 'PUT',
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        body: editor.value,
      });
      if (response.ok) {
        status.textContent = 'Saved';
      } else {
        status.textContent = 'Save failed';
      }
    });
  </script>
</body>
</html>`
  res.status(200).type('text/html; charset=utf-8').send(html)
}

async function renderDirectoryListing(res: express.Response, localPath: string): Promise<void> {
  const entries = await readdir(localPath, { withFileTypes: true })
  const entriesWithMeta = await Promise.all(entries.map(async (entry) => {
    const entryPath = join(localPath, entry.name)
    const entryStat = await stat(entryPath)
    return { entry, entryPath, mtimeMs: entryStat.mtimeMs }
  }))
  const sorted = entriesWithMeta.slice().sort((a, b) => {
    if (b.mtimeMs !== a.mtimeMs) return b.mtimeMs - a.mtimeMs
    if (a.entry.isDirectory() && !b.entry.isDirectory()) return -1
    if (!a.entry.isDirectory() && b.entry.isDirectory()) return 1
    return a.entry.name.localeCompare(b.entry.name)
  })

  const parentPath = dirname(localPath)
  const rows = sorted
    .map(({ entry, entryPath }) => {
      const suffix = entry.isDirectory() ? '/' : ''
      const editAction = (!entry.isDirectory() && isTextEditablePath(entryPath))
        ? ` <a href="${escapeHtml(toEditHref(entryPath))}">Edit</a>`
        : ''
      return `<li><a href="${escapeHtml(toBrowseHref(entryPath))}">${escapeHtml(entry.name)}${suffix}</a>${editAction}</li>`
    })
    .join('\n')

  const parentLink = localPath !== parentPath
    ? `<p><a href="${escapeHtml(toBrowseHref(parentPath))}">..</a></p>`
    : ''

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Index of ${escapeHtml(localPath)}</title>
  <style>
    body { font-family: ui-monospace, Menlo, Monaco, monospace; margin: 24px; background: #0b1020; color: #dbe6ff; }
    a { color: #8cc2ff; text-decoration: none; }
    a:hover { text-decoration: underline; }
    ul { list-style: none; padding: 0; margin: 12px 0 0; }
    li { padding: 3px 0; }
    h1 { font-size: 18px; margin: 0; word-break: break-all; }
  </style>
</head>
<body>
  <h1>Index of ${escapeHtml(localPath)}</h1>
  ${parentLink}
  <ul>${rows}</ul>
</body>
</html>`

  res.status(200).type('text/html; charset=utf-8').send(html)
}

export function createServer(options: ServerOptions = {}): ServerInstance {
  const app = express()
  const bridge = createCodexBridgeMiddleware()
  const authSession = options.password ? createAuthSession(options.password) : null

  // 1. Auth middleware (if password is set)
  if (authSession) {
    app.use(authSession.middleware)
  }

  // 2. Bridge middleware for /codex-api/*
  app.use(bridge)

  // 3. Serve local images referenced in markdown (desktop parity for absolute image paths)
  app.get('/codex-local-image', (req, res) => {
    const rawPath = typeof req.query.path === 'string' ? req.query.path : ''
    const localPath = normalizeLocalImagePath(rawPath)
    if (!localPath || !isAbsolute(localPath)) {
      res.status(400).json({ error: 'Expected absolute local file path.' })
      return
    }

    const contentType = IMAGE_CONTENT_TYPES[extname(localPath).toLowerCase()]
    if (!contentType) {
      res.status(415).json({ error: 'Unsupported image type.' })
      return
    }

    res.type(contentType)
    res.setHeader('Cache-Control', 'private, max-age=300')
    res.sendFile(localPath, { dotfiles: 'allow' }, (error) => {
      if (!error) return
      if (!res.headersSent) res.status(404).json({ error: 'Image file not found.' })
    })
  })

  // 4. Serve local files inline for direct file open.
  app.get('/codex-local-file', (req, res) => {
    const rawPath = typeof req.query.path === 'string' ? req.query.path : ''
    const localPath = normalizeLocalPath(rawPath)
    if (!localPath || !isAbsolute(localPath)) {
      res.status(400).json({ error: 'Expected absolute local file path.' })
      return
    }

    res.setHeader('Cache-Control', 'private, no-store')
    res.setHeader('Content-Disposition', 'inline')
    res.sendFile(localPath, { dotfiles: 'allow' }, (error) => {
      if (!error) return
      if (!res.headersSent) res.status(404).json({ error: 'File not found.' })
    })
  })

  // 5. Serve local files by path to preserve relative asset loading for HTML.
  app.get('/codex-local-browse/*path', async (req, res) => {
    const rawPath = typeof req.params.path === 'string' ? req.params.path : ''
    const localPath = decodeBrowsePath(`/${rawPath}`)
    if (!localPath || !isAbsolute(localPath)) {
      res.status(400).json({ error: 'Expected absolute local file path.' })
      return
    }

    try {
      const fileStat = await stat(localPath)
      res.setHeader('Cache-Control', 'private, no-store')
      if (fileStat.isDirectory()) {
        await renderDirectoryListing(res, localPath)
        return
      }

      res.sendFile(localPath, { dotfiles: 'allow' }, (error) => {
        if (!error) return
        if (!res.headersSent) res.status(404).json({ error: 'File not found.' })
      })
    } catch {
      res.status(404).json({ error: 'File not found.' })
    }
  })

  // 6. Edit text-like local files.
  app.get('/codex-local-edit/*path', async (req, res) => {
    const rawPath = typeof req.params.path === 'string' ? req.params.path : ''
    const localPath = decodeBrowsePath(`/${rawPath}`)
    if (!localPath || !isAbsolute(localPath)) {
      res.status(400).json({ error: 'Expected absolute local file path.' })
      return
    }
    try {
      const fileStat = await stat(localPath)
      if (!fileStat.isFile()) {
        res.status(400).json({ error: 'Expected file path.' })
        return
      }
      await renderTextEditor(res, localPath)
    } catch {
      res.status(404).json({ error: 'File not found.' })
    }
  })

  app.put('/codex-local-edit/*path', express.text({ type: '*/*', limit: '10mb' }), async (req, res) => {
    const rawPath = typeof req.params.path === 'string' ? req.params.path : ''
    const localPath = decodeBrowsePath(`/${rawPath}`)
    if (!localPath || !isAbsolute(localPath)) {
      res.status(400).json({ error: 'Expected absolute local file path.' })
      return
    }
    if (!isTextEditablePath(localPath)) {
      res.status(415).json({ error: 'Only text-like files are editable.' })
      return
    }
    const body = typeof req.body === 'string' ? req.body : ''
    try {
      await writeFile(localPath, body, 'utf8')
      res.status(200).json({ ok: true })
    } catch {
      res.status(404).json({ error: 'File not found.' })
    }
  })

  const hasFrontendAssets = existsSync(spaEntryFile)

  // 7. Static files from Vue build
  if (hasFrontendAssets) {
    app.use(express.static(distDir))
  }

  // 8. SPA fallback
  app.use((_req, res) => {
    if (!hasFrontendAssets) {
      res.status(503).type('text/plain').send(
        [
          'Codex web UI assets are missing.',
          `Expected: ${spaEntryFile}`,
          'If running from source, build frontend assets with: npm run build:frontend',
          'If running with npx, clear the npx cache and reinstall codexapp.',
        ].join('\n'),
      )
      return
    }

    res.sendFile(spaEntryFile, (error) => {
      if (!error) return
      if (!res.headersSent) {
        res.status(404).type('text/plain').send('Frontend entry file not found.')
      }
    })
  })

  return {
    app,
    dispose: () => bridge.dispose(),
    attachWebSocket: (server: HttpServer) => {
      const wss = new WebSocketServer({ noServer: true })

      server.on('upgrade', (req: IncomingMessage, socket, head) => {
        const url = new URL(req.url ?? '', 'http://localhost')
        if (url.pathname !== '/codex-api/ws') {
          return
        }

        if (authSession && !authSession.isRequestAuthorized(req)) {
          socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n')
          socket.destroy()
          return
        }

        wss.handleUpgrade(req, socket, head, (ws: WebSocket) => {
          wss.emit('connection', ws, req)
        })
      })

      wss.on('connection', (ws: WebSocket) => {
        ws.send(JSON.stringify({ method: 'ready', params: { ok: true }, atIso: new Date().toISOString() }))
        const unsubscribe = bridge.subscribeNotifications((notification) => {
          if (ws.readyState !== 1) return
          ws.send(JSON.stringify(notification))
        })

        ws.on('close', unsubscribe)
        ws.on('error', unsubscribe)
      })
    },
  }
}

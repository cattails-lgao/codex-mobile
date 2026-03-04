import { fileURLToPath } from 'node:url'
import { dirname, extname, isAbsolute, join } from 'node:path'
import express, { type Express } from 'express'
import { createCodexBridgeMiddleware } from './codexAppServerBridge.js'
import { createAuthMiddleware } from './authMiddleware.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const distDir = join(__dirname, '..', 'dist')

export type ServerOptions = {
  password?: string
}

export type ServerInstance = {
  app: Express
  dispose: () => void
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

export function createServer(options: ServerOptions = {}): ServerInstance {
  const app = express()
  const bridge = createCodexBridgeMiddleware()

  // 1. Auth middleware (if password is set)
  if (options.password) {
    app.use(createAuthMiddleware(options.password))
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

  // 4. Static files from Vue build
  app.use(express.static(distDir))

  // 5. SPA fallback
  app.use((_req, res) => {
    res.sendFile(join(distDir, 'index.html'))
  })

  return {
    app,
    dispose: () => bridge.dispose(),
  }
}

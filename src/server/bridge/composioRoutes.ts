// Composio HTTP route handlers, sliced out of createCodexBridgeMiddleware.
//
// These handlers are stateless: each one forwards to a pure helper in
// bridge/composio.ts. Only the shell-defined infra helpers (setJson, readJsonBody)
// are injected to avoid a circular import back into the shell, mirroring
// handleGitWorktreeHttpRequest in bridge/routes.ts.
import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  installComposioCli,
  listComposioConnectors,
  parseComposioLimit,
  readComposioConnectorDetail,
  readComposioStatus,
  startComposioLink,
  startComposioLogin,
} from './composio.js'
import { asRecord, getErrorMessage, readNonEmptyString } from './core.js'

type SetJson = (res: ServerResponse, statusCode: number, payload: unknown) => void
type ReadJsonBody = (req: IncomingMessage) => Promise<unknown>

export type ComposioRouteDeps = {
  setJson: SetJson
  readJsonBody: ReadJsonBody
}

export async function handleComposioHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  deps: ComposioRouteDeps,
): Promise<boolean> {
  const { setJson, readJsonBody } = deps

  if (req.method === 'GET' && url.pathname === '/codex-api/composio/status') {
    try {
      setJson(res, 200, await readComposioStatus())
    } catch (error) {
      setJson(res, 500, { error: getErrorMessage(error, 'Failed to read Composio status') })
    }
    return true
  }

  if (req.method === 'GET' && url.pathname === '/codex-api/composio/connectors') {
    try {
      const query = url.searchParams.get('query') ?? ''
      const cursor = url.searchParams.get('cursor')?.trim() ?? null
      const limit = parseComposioLimit(url.searchParams.get('limit'))
      setJson(res, 200, await listComposioConnectors(query, cursor, limit))
    } catch (error) {
      setJson(res, 500, { error: getErrorMessage(error, 'Failed to list Composio connectors') })
    }
    return true
  }

  if (req.method === 'GET' && url.pathname === '/codex-api/composio/connector') {
    try {
      const slug = url.searchParams.get('slug') ?? ''
      setJson(res, 200, await readComposioConnectorDetail(slug))
    } catch (error) {
      setJson(res, 500, { error: getErrorMessage(error, 'Failed to load Composio connector') })
    }
    return true
  }

  if (req.method === 'POST' && url.pathname === '/codex-api/composio/link') {
    try {
      const payload = asRecord(await readJsonBody(req))
      const slug = readNonEmptyString(payload?.slug)
      setJson(res, 200, await startComposioLink(slug))
    } catch (error) {
      setJson(res, 500, { error: getErrorMessage(error, 'Failed to start Composio login') })
    }
    return true
  }

  if (req.method === 'POST' && url.pathname === '/codex-api/composio/login') {
    try {
      setJson(res, 200, await startComposioLogin())
    } catch (error) {
      setJson(res, 500, { error: getErrorMessage(error, 'Failed to start Composio CLI login') })
    }
    return true
  }

  if (req.method === 'POST' && url.pathname === '/codex-api/composio/install') {
    try {
      setJson(res, 200, await installComposioCli())
    } catch (error) {
      setJson(res, 500, { error: getErrorMessage(error, 'Failed to install Composio CLI') })
    }
    return true
  }

  return false
}
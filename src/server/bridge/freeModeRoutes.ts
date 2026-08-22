// Free-mode HTTP routes (/codex-api/free-mode family), sliced out of
// createCodexBridgeMiddleware. Unlike the zero-closure route families before it,
// these handlers need the live appServer (they dispose() it to force a provider
// restart) and the middleware chain's next(), plus a few Shell-owned auth helpers,
// all injected via FreeModeRouteDeps. The model helpers come straight from
// freeMode.js / models.js / core.js.
import { join } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  FREE_MODE_DEFAULT_MODEL,
  FREE_MODE_STATE_FILE,
  OPENCODE_ZEN_DEFAULT_MODEL,
  OPENCODE_ZEN_PROVIDER_ID,
  filterOpenCodeZenModelsForAuthState,
  getCachedFreeModels,
  getFreeKeyCount,
  getRandomFreeKey,
  refreshFreeModelsInBackground,
  shouldMarkOpenRouterKeyAsCustom,
  getFreeModels,
  type FreeModeState,
} from '../freeMode.js'
import {
  fetchCustomEndpointDefaultModel,
  fetchOpenCodeZenModelIds,
  normalizeCustomEndpointBaseUrl,
  sortOpenCodeZenModelIds,
} from './models.js'
import { getCodexHomeDir, getErrorMessage } from './core.js'

type SetJson = (res: ServerResponse, statusCode: number, payload: unknown) => void
type ReadJsonBody = (req: IncomingMessage) => Promise<unknown>
type Next = () => void

export type FreeModeRouteDeps = {
  setJson: SetJson
  readJsonBody: ReadJsonBody
  appServer: { dispose(): void }
  next: Next
  writeFreeModeStateFile: (statePath: string, state: FreeModeState) => Promise<void>
  ensureDefaultFreeModeStateForMissingAuthSync: (statePath: string) => FreeModeState | null
  hasUsableCodexAuthSync: () => boolean
}

export async function handleFreeModeHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  deps: FreeModeRouteDeps,
): Promise<boolean> {
  if (!url.pathname.startsWith('/codex-api/free-mode')) return false

  const {
    setJson,
    readJsonBody,
    appServer,
    next,
    writeFreeModeStateFile,
    ensureDefaultFreeModeStateForMissingAuthSync,
    hasUsableCodexAuthSync,
  } = deps

  const statePath = join(getCodexHomeDir(), FREE_MODE_STATE_FILE)

  function readFreeModeState(): FreeModeState {
    return ensureDefaultFreeModeStateForMissingAuthSync(statePath)
      ?? { enabled: false, apiKey: null, model: FREE_MODE_DEFAULT_MODEL }
  }

  if (req.method === 'POST' && url.pathname === '/codex-api/free-mode') {
    try {
      const body = await readJsonBody(req) as Record<string, unknown> | null
      const enable = Boolean(body?.enable)

      if (enable) {
        const apiKey = getRandomFreeKey()
        if (!apiKey) {
          setJson(res, 500, { error: 'No free keys available' })
          return true
        }

        const prev = readFreeModeState()
        const prevKeys = prev.providerKeys ?? {}
        if (prev.provider && prev.apiKey) {
          prevKeys[prev.provider] = prev.apiKey
        }
        const state: FreeModeState = {
          enabled: true,
          apiKey,
          model: FREE_MODE_DEFAULT_MODEL,
          provider: 'openrouter',
          wireApi: prev.wireApi === 'chat' ? 'chat' : 'responses',
          providerKeys: prevKeys,
        }
        await writeFreeModeStateFile(statePath, state)
        appServer.dispose()
        const freeModels = await getFreeModels()
        setJson(res, 200, {
          ok: true,
          enabled: true,
          model: FREE_MODE_DEFAULT_MODEL,
          keyCount: getFreeKeyCount(),
          models: freeModels,
        })
      } else {
        const prev = readFreeModeState()
        const prevKeys = prev.providerKeys ?? {}
        if (prev.provider && prev.apiKey) {
          prevKeys[prev.provider] = prev.apiKey
        }
        const state: FreeModeState = {
          enabled: false,
          apiKey: null,
          model: FREE_MODE_DEFAULT_MODEL,
          wireApi: prev.wireApi === 'chat' ? 'chat' : 'responses',
          providerKeys: prevKeys,
        }
        await writeFreeModeStateFile(statePath, state)
        appServer.dispose()
        setJson(res, 200, { ok: true, enabled: false })
      }
    } catch (error) {
      setJson(res, 500, { error: getErrorMessage(error, 'Failed to toggle free mode') })
    }
    return true
  }

  if (req.method === 'GET' && url.pathname === '/codex-api/free-mode/status') {
    try {
      const state = readFreeModeState()
      const maskedKey = state.apiKey && state.customKey
        ? state.apiKey.substring(0, 12) + '...' + state.apiKey.substring(state.apiKey.length - 4)
        : null
      let models = getCachedFreeModels()
      let currentModel = state.enabled ? state.model : null
      let wireApi = state.wireApi ?? null
      if (state.provider === OPENCODE_ZEN_PROVIDER_ID) {
        currentModel = state.enabled ? (state.model?.trim() || OPENCODE_ZEN_DEFAULT_MODEL) : null
        try {
          const zenModels = filterOpenCodeZenModelsForAuthState(
            sortOpenCodeZenModelIds(await fetchOpenCodeZenModelIds(state.apiKey)),
            state.apiKey,
          )
          if (zenModels.length > 0) {
            models = zenModels
          } else {
            models = [
              OPENCODE_ZEN_DEFAULT_MODEL,
              'minimax-m2.5-free',
              'nemotron-3-super-free',
              'trinity-large-preview-free',
            ]
          }
        } catch {
          models = [
            OPENCODE_ZEN_DEFAULT_MODEL,
            'minimax-m2.5-free',
            'nemotron-3-super-free',
            'trinity-large-preview-free',
          ]
        }
        wireApi = 'responses'
      } else {
        refreshFreeModelsInBackground()
      }
      setJson(res, 200, {
        enabled: state.enabled,
        hasCodexAuth: hasUsableCodexAuthSync(),
        keyCount: getFreeKeyCount(),
        models,
        currentModel,
        customKey: Boolean(state.customKey),
        maskedKey,
        provider: state.provider ?? 'openrouter',
        customBaseUrl: state.customBaseUrl ?? null,
        wireApi,
      })
    } catch (error) {
      setJson(res, 500, { error: getErrorMessage(error, 'Failed to read free mode status') })
    }
    return true
  }

  if (req.method === 'POST' && url.pathname === '/codex-api/free-mode/rotate-key') {
    try {
      const apiKey = getRandomFreeKey()
      if (!apiKey) {
        setJson(res, 500, { error: 'No free keys available' })
        return true
      }
      const current = readFreeModeState()
      const state: FreeModeState = { ...current, apiKey, customKey: false }
      await writeFreeModeStateFile(statePath, state)
      appServer.dispose()
      setJson(res, 200, { ok: true })
    } catch (error) {
      setJson(res, 500, { error: getErrorMessage(error, 'Failed to rotate key') })
    }
    return true
  }

  if (req.method === 'POST' && url.pathname === '/codex-api/free-mode/custom-key') {
    try {
      const body = await readJsonBody(req) as Record<string, unknown> | null
      const key = typeof body?.key === 'string' ? body.key.trim() : ''
      const current = readFreeModeState()

      if (key.length > 0) {
        const state: FreeModeState = {
          ...current,
          enabled: true,
          apiKey: key,
          customKey: true,
          provider: 'openrouter',
          wireApi: current.wireApi === 'chat' ? 'chat' : 'responses',
        }
        await writeFreeModeStateFile(statePath, state)
        appServer.dispose()
        setJson(res, 200, { ok: true, customKey: true })
      } else {
        const communityKey = getRandomFreeKey()
        const state: FreeModeState = {
          ...current,
          apiKey: communityKey,
          customKey: false,
          provider: 'openrouter',
          wireApi: current.wireApi === 'chat' ? 'chat' : 'responses',
        }
        await writeFreeModeStateFile(statePath, state)
        appServer.dispose()
        setJson(res, 200, { ok: true, customKey: false })
      }
    } catch (error) {
      setJson(res, 500, { error: getErrorMessage(error, 'Failed to set custom key') })
    }
    return true
  }

  if (req.method === 'POST' && url.pathname === '/codex-api/free-mode/custom-provider') {
    try {
      const body = await readJsonBody(req) as Record<string, unknown> | null
      const rawBaseUrl = typeof body?.baseUrl === 'string' ? body.baseUrl.trim() : ''
      const baseUrl = normalizeCustomEndpointBaseUrl(rawBaseUrl)
      const apiKey = typeof body?.apiKey === 'string' ? body.apiKey.trim() : ''
      const wireApi = body?.wireApi === 'chat' ? 'chat' as const : 'responses' as const
      const providerType = body?.provider === 'opencode-zen'
        ? 'opencode-zen' as const
        : body?.provider === 'openrouter'
          ? 'openrouter' as const
          : 'custom' as const
      if (providerType === 'custom' && !baseUrl) {
        setJson(res, 400, { error: 'baseUrl is required' })
        return true
      }
      const current = readFreeModeState()
      const prevKeys = current.providerKeys ?? {}
      if (current.provider && current.apiKey) {
        prevKeys[current.provider] = current.apiKey
      }
      const resolvedKey = apiKey || prevKeys[providerType] || ''
      if (resolvedKey) {
        prevKeys[providerType] = resolvedKey
      }
      const currentModel = (current.model ?? '').trim()
      const resolvedModel = providerType === 'openrouter'
        ? (currentModel.includes('/') ? currentModel : FREE_MODE_DEFAULT_MODEL)
        : providerType === 'custom'
          ? await fetchCustomEndpointDefaultModel(baseUrl, resolvedKey)
          : OPENCODE_ZEN_DEFAULT_MODEL
      const state: FreeModeState = {
        enabled: true,
        apiKey: resolvedKey,
        model: resolvedModel,
        customKey: providerType === 'openrouter'
          ? shouldMarkOpenRouterKeyAsCustom(current, apiKey)
          : true,
        provider: providerType,
        customBaseUrl: providerType === 'custom' ? baseUrl : undefined,
        wireApi,
        providerKeys: prevKeys,
      }
      await writeFreeModeStateFile(statePath, state)
      appServer.dispose()
      setJson(res, 200, { ok: true })
    } catch (error) {
      setJson(res, 500, { error: getErrorMessage(error, 'Failed to set custom provider') })
    }
    return true
  }

  next()
  return true
}
import { describe, expect, it } from 'vitest'
import {
  FREE_MODE_DEFAULT_MODEL,
  FREE_MODE_PROVIDER_ID,
  createDefaultOpenRouterFreeModeState,
  getFreeModeConfigArgs,
} from './freeMode'

describe('OpenRouter free mode defaults', () => {
  it('creates an enabled OpenRouter state for unauthenticated startup', () => {
    const state = createDefaultOpenRouterFreeModeState()

    expect(state).not.toBeNull()
    expect(state?.enabled).toBe(true)
    expect(state?.provider).toBe('openrouter')
    expect(state?.model).toBe(FREE_MODE_DEFAULT_MODEL)
    expect(state?.wireApi).toBe('responses')
    expect(state?.apiKey).toBeTruthy()
    expect(state?.providerKeys?.openrouter).toBe(state?.apiKey)
  })

  it('routes app-server through the local OpenRouter proxy when a server port is available', () => {
    const state = createDefaultOpenRouterFreeModeState()

    expect(state).not.toBeNull()
    const args = getFreeModeConfigArgs(state!, 4173)

    expect(args).toContain(`model_provider="${FREE_MODE_PROVIDER_ID}"`)
    expect(args).toContain(`model="${FREE_MODE_DEFAULT_MODEL}"`)
    expect(args).toContain(`model_providers.${FREE_MODE_PROVIDER_ID}.base_url="http://127.0.0.1:4173/codex-api/openrouter-proxy/v1"`)
    expect(args).toContain(`model_providers.${FREE_MODE_PROVIDER_ID}.experimental_bearer_token="openrouter-proxy-token"`)
  })
})

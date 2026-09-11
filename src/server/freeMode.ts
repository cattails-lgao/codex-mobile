const ENCRYPTED_KEYS: string[] = [
  "FhkYWwEZE0MYBhAGUEADDBYFBEoDBxIHVUpUVRIMVUYDAkEHVRYNAxABUUAEAUMDV0pUDEQAU0ZTDEQCVERQVkoBVhAEBBBXAQ==",
  "FhkYWwEZE0MYVkIGUkNUUkpVXUsBBUUAVEYHUEIMBhQCVxZWBBcHVkoNUENRAxAMA0MHARBXBkVUAUVQXBAFAUVXVxFWBUtWBw==",
  "FhkYWwEZE0MYVhFWAUJUUBEMURMHAUoEAUcABRAEURRXARBRU0ZUBBFVB0YAAUNVVUYBDBBSABRUAhdVXUUBUhANV0IMBBABBA==",
  "FhkYWwEZE0MYUBIDABMBVkMHURcGDRVSXRMFBUUCBBQBVhUBUBEGDBAAVkpTVUoGUBYMBhJXB0ANABUEARBQB0RRXUBRBUNQBw==",
  "FhkYWwEZE0MYVhcFBhMFARJXVBMADRdWVxYHBkQNA0cBBEsGVEBRAkYCXEFXURBXABZQDEZSXBQHAkJSAUABVxIMA0NWAEcMUA==",
  "FhkYWwEZE0MYAEQAXEZQURUGARFRBkRWVENWDUYFBkQHBEJWU0dQUkdWBhZXARYMAERXURcBUUQNDUAGAEoEB0ABV0NTUkQDBw==",
  "FhkYWwEZE0MYABdRURBXVkYDURZWUUIAUEcMBEcMUUpXVxEGVhEMBktVXBBWAEFQBBBRVhECUEQEBkFQUUpRVRUMV0dRA0QGUw==",
  "FhkYWwEZE0MYVUMCUUIHAUFRVksFVhYMARRRBBIAVBMBDEFVAxMAAUpRXUsEBkMHVhAHBUdSVxECABJSVRdRBkMEURANAEdXVA==",
  "FhkYWwEZE0MYUkEFVEVUBEoMVkINDUFQUENQAkBSAEVQVhcEAEsDBxVWUkBWAkRSA0ANV0FVBkYMVxcBXUQEUEQCARYDDEpWXA==",
  "FhkYWwEZE0MYDBcCXBANBRdVU0YEAEsMAUoNUkoMUBYDABcHVEBQBkRVUxdWBUUAAURUVxUGB0oDVxIHABRUAhJRAEUDUkECXQ==",
  "FhkYWwEZE0MYVhUHVBEBURFQA0EBVRcNUUZXAhVXVkpQAEUHBhNTDUQMXRAGA0JQA0BRBRUHVRQMURVWXUoBVxcEBEYEAEACUQ==",
  "FhkYWwEZE0MYA0UCB0ZTABUNBhRTAUYAUENQUEANBEMCARdQBkRRBRYDUhdWVhACXBcGBhIDVBFRBRJQUREGDRAAUhQHUhUBAA==",
  "FhkYWwEZE0MYAUsMARACBBYGVxQHARVQVxRRBRcNUkAFUUQCXBEAUkcBXEMBBEYCXRENBUsBVRYABUJXU0FUAEYBUUpWABEGUw==",
  "FhkYWwEZE0MYAEdSUBcNAUoFUERUAkcFAEQAB0IBUxcFDUIMBEpQVktWUxdUB0MBXUEBBhIMXRQEUBFQXEMFAEBQXUEMVkoBUQ==",
  "FhkYWwEZE0MYDBYNUUVUA0ECUREMVhUEBkoCVxJSXEtRUENQVxAMBBcMAxACVkVVBEEDUEYDAURWA0oDXUYAAEEEVxQABUANVg==",
  "FhkYWwEZE0MYVhcHBhcFV0EBUEdWVxdSU0sMABFSUEIHA0EAU0dWBkcFXEZRBENXAUEDV0AFUkEABBAEXBdXAhZRBEAAUUBSVg==",
  "FhkYWwEZE0MYV0MHAxYBDUsHB0oFVRJWAUoABEQGAUEHDRdRUBQHBREFUkpQVUYHVkVTDBcDXUYHBkJXUhENVUIAVUtTDRcMVA==",
  "FhkYWwEZE0MYBxVXBEsAUkYBA0EEAUIGBkRQA0MNABZRVkcHA0JTUEdWUkNRBBUEXUFUB0oFB0QGDBdWUUsEV0NXBBQBVRUEVg==",
  "FhkYWwEZE0MYVxcCVBYHAEsNVBEADEENUkMAUhFWXBNUVxdWBxNWURYAVEEAUUdSURAHDUsAUkEABBJSVRZQV0YNVRBRDUVSBw==",
  "FhkYWwEZE0MYAEQEV0YGVxcMVkRQUEsGUEBRUEADAEYEV0NRBBRWBUpXV0oMA0NRXBBRAkAMXUZWURBSXEZRB0EEVBQNVxYBXQ==",
  "FhkYWwEZE0MYA0IBUhADUERXB0MNB0MHVUtUDRUNBEpXVkEGUBMABkZVUENUAkBVXRAEDEAHBkJWABAEURNWDEcEABQCVUdVVA==",
  "FhkYWwEZE0MYUhcEBBYCAUFSXUAEAEEBV0sDDRAFV0YDV0NVBENXB0QNVxdUAkYMXUQGA0tRV0tWVUoDAxcGUUVVVUQHDBEDBA==",
  "FhkYWwEZE0MYA0QBBEIAB0INXUtTBxYFVBFXABJSBkYEAxIAVEAGVkZSB0tQUEoHBkcGBBUHVENWAUNRUEYCAhJSXRcNUEQGUA==",
  "FhkYWwEZE0MYUBJQUEIFUkBXARBUBUIDAxBQVhJVVkUMVhEDAEYNVxEGBhRUVkJWURYDAUAAAUUMARVRBhYAUkAEUkUEAhYCVg==",
  "FhkYWwEZE0MYVUYGVBcEDEAFVhACVkFWXBFTAxAMUUpQURENARYBVhABAEINAEQCAUECDEsCBEUBVxBXBxRUVxdQBBRXVkcCUA==",
  "FhkYWwEZE0MYV0YMVxBTVUNQBERRURVSUxQGUUVWB0MGVUMHV0cHUkMEAEMDDUMCVEcGVkNVB0oDURdVAUFQBkIAURYDBhAHAA==",
  "FhkYWwEZE0MYUhYCXEsNVUAEURFXBkcHABFQBxcFUENWVkpVAxZWAhEBAxMBBkRRVUtQDEZWXEoBBxUNVkYBBhJQUBBQUUoDBw==",
  "FhkYWwEZE0MYB0YGXUIGDRIHVRZQVUJSV0UNB0oNAxQADRUMVUcEBhdQV0AHDUZXAEtQVkVQUhBRBUBSUEQCVkRSBEUDUkQEVQ==",
  "FhkYWwEZE0MYB0MGAUEADERVV0RXDUJSUUMAUEdRAUMCBxZSBktQDUMEBkIBBkIDAEMNURdRXUoFB0RWVEZRDUFXAEJTVRVWVg==",
  "FhkYWwEZE0MYAkQDAxcFBEpXVEIEDUJSB0tXBhVXUkIDAEEMBBBXDUdRVRcNBURVAxZXUUENARYNBkMAUBBTDUsGVUFWDEcAVQ==",
  "FhkYWwEZE0MYDRFQVUsCBRIMXBEFBEYEBEMBAUAMVkoCDUoABEcNV0YMU0pWABJXURcAAEIEUBcGVxcGUhZWBUIAVUQCUkVVAA==",
  "FhkYWwEZE0MYUhcDVURUDBBSVkVWAEYCBkoMUEVVU0cEAxcFVhcDVUEBAEpXUhIAXEUNBUQBAxYGUhFXVUUHBBUAVkpRURAAVQ==",
  "FhkYWwEZE0MYUEtVV0BQV0tXB0dXVkNRVRRQBUADABFTURYDVBdXUEFSXEpXB0dQVBQEA0oAVUpTBEYEVBMNDEMDU0BUBUINUg==",
  "FhkYWwEZE0MYUEpQBxZTBkFXXEZWAkEEBxEHB0RXVktQUEMDARRRABEFAUIABEAMARRRDUACBBAMUEMMUxcEUUEEAEoAURBQBg==",
  "FhkYWwEZE0MYUEINARRQAhcCUEJRUBIFBEIHBkJQB0tWVhINXRBUUBdVBkcMBUZVUxNTAUsMU0cFAEtSXUJXDRJSBkVUAUoBVA==",
  "FhkYWwEZE0MYUEBWAUtXBxEHUhNTBRZVB0UEB0MDA0sCBEAABkNUAUQCBxYAAEVQUEYDVkoDVxAFVUFVVUcMAUECBkoGUUsCUA==",
  "FhkYWwEZE0MYBBUBUEFTBUIDAxAGBUcFARBWBRJXUUJTAkUGURQBUUUEB0EFBBBVVURQBEEAUBMAVhINVUEBVUcMA0sNVUNQVg==",
  "FhkYWwEZE0MYDUMDA0MNA0oAV0BQUEEFBEUBAkpQXBAMBUsCVRZXVkIAXBMEAktXBhYABkcAUhMAUhYBA0BTAURVURMBA0ACXA==",
  "FhkYWwEZE0MYUhdXUUMDAEQNBhZTAEdWXUYHBxEHXUQCDBYCBkEBBEIDAEBQBkEAUkUBBREMUEUNAEUMBENUBhZXVkVQV0NWBw==",
  "FhkYWwEZE0MYUBdVU0VXVkpQUkEEBkFSVhZRDEQMXBdQA0QDXUIHUEtWBEABAERXBEoMAxEDUxYMDUVRXUJTUBcFBhQCVkcAVQ==",
  "FhkYWwEZE0MYDRcBUBYCUEpRABQNVRcHBkQABkZXUkBWURFVU0sMBxINURQMAREHUUcHAUYDB0QBAUNVVUAAARUGUEoAABYGXA==",
  "FhkYWwEZE0MYAhUCUktQV0oEBxcCVUoCB0pTAUJQXUJTARYAXUsNDRUDUkVQARIHUUJUBEMEVxMFBhEAUUUCBRIAXBMBVUAHAA==",
  "FhkYWwEZE0MYARcCAUMDVxFQBEZXUEcCAEYDVksNVUpQB0MEB0EEAhVWXRcEUUBQXEoGA0BSAEVWBhdXVUACUUZSUEZXBUZRVg==",
  "FhkYWwEZE0MYA0oBUhEHABYCBkcMUUcGXRdUDRZXVBZTARUHVkQGV0UAAUoDBxJRVRQBA0oFAUEGBERSVhMGBEBWBEpRAUMGVg==",
  "FhkYWwEZE0MYVhANVBFXDEoAXEoMBhYMUxMNUEECVEoMAkQFVxANVRcFABdRDRVWXUACBBYHVURUUBACXUNUV0IMAUcCAUIHBw==",
  "FhkYWwEZE0MYUEUCB0UNDBEFVhQGBhJSBkYHBEMNBhAGUkAFA0AMBUAGUEYDAUZQVUdWUhcHUEcAUhEFB0FQV0VQAUtXBEcDBw==",
  "FhkYWwEZE0MYAUNSURNTBRANUkRWVxYHXEYMAUYBB0cCBksCAEUHUkVSVUdRURIEBxADBhECVxNRUEcFUxQMUEMMA0MFBEENBA==",
  "FhkYWwEZE0MYBxBWVkZQAkENVhYNBBUDXBADAUANUkBRVkICBEtRVxEEAEFUDUIDUkNXAxEDAUcHARIAVEJTA0oNVkANB0EGXA==",
  "FhkYWwEZE0MYV0IGAREGUhZVUEFXVkJVVUECDBcFARcNUhZQXBEFAkMBU0sDUEIFBhcCV0cCXUBTVRADV0YEA0ZQUxACUUsEXA==",
  "FhkYWwEZE0MYVUoNVUNQURVQUREDAxJSB0AAAkMCABQDAUMGVBYABBJWBxADBENRVEsAVxcAAEdTARUDBBEFUhZSUEQDDRcAXA==",
  "FhkYWwEZE0MYBhdRVUQBVhcGBhENV0QEAEIGVxcBUxQNUUcAVxZWBEEEVUBTARYGAUFUAUUHBEQEDUsDVEJXDEQNU0sCV0YMAA==",
  "FhkYWwEZE0MYVktRAENWAkEBXUsGUUEDUkMHB0FXB0cCAhEHARZUBxJWB0IDBERRUkUAAxYDUkYBUkYDV0QDVUcHVxAGA0INVA==",
  "FhkYWwEZE0MYBkIAVBABVUINV0NTVxYGAUYFVUMBUxYMURAGBksAVUJVBkoHUUQMA0cMAUdQVkUGBUpSAEZTVRANUBYEUEQBVA==",
  "FhkYWwEZE0MYDEMDA0oCVURRUBZWUkANUEQBAkBSXBBRB0BSVBYGVkAFVRAGDEYDVkMEDBBSBkQHV0JRA0JUBRcFXURTDRZRUw==",
  "FhkYWwEZE0MYUBJSVEUNUhcGBkYGAhYDUEcAUEsEBxdUUBZSXEcGDEINXEoDBxcFUkdWBEBRVxYNDUYAUBMBVkcCUBcHUUsAXA==",
  "FhkYWwEZE0MYA0QNUEtWAUMEAEoBUEoAAREDVRYHVkoEV0ZQBEEEUkEAAUIEAUcCVhEHUBUDB0FRVktVVEFXARIHA0NWBUpXBg==",
  "FhkYWwEZE0MYV0oCAxFXV0YMUxFQAUAAUEVWA0cEB0pUUBAFXUIHDRdQAEQAUkMGU0AEVxEDBBEBAhBRV0QEAxVWU0NQBxECBw==",
  "FhkYWwEZE0MYUkoCBBMEUkYDBhYFB0IFVkQMVUpSBksMUUcFUxEEDRZVVkUADEoCVhcHUkEHUxACUUJXBBdTVUQDAEFRBxUGAw==",
  "FhkYWwEZE0MYV0BXBEUCURUNXUYABUpQURYBBUYFVENXBhYCXRBWDUsHA0NRB0oGUREHDRYGUxMBAksEUkINVkNVBEIBAxdWUA==",
  "FhkYWwEZE0MYBEoCA0MNDEUAXUNUAxYHXBRRURACUEFQBxYDB0dUBksDA0QFVksMAxQFAEZRAxNTA0cMVUENVxEEAUFRBUAHBA==",
  "FhkYWwEZE0MYB0ENVkAABxEFXEZQAUYHBhMFBBJQBkMCUUZRBERTAkBRBhADVxYEXEADB0RSUUtRUREBXRdXBkAGBEUNBEQCUg==",
  "FhkYWwEZE0MYVhFVXBAFDBYFBkFTAhIGB0ZRBEJVXURTBBFWBxNUVkBXBEMMBkIHURcDAksAVEMEV0dSUhdXBBJWUkJWAxBRVg==",
  "FhkYWwEZE0MYBRFRXUoBBUcGBhZUAUBVABYEVkICVkNXDUcMABYFVxdXU0sEBkcFXEYBURUFVUYFABJSA0dTABdRVBRQVRENVg==",
  "FhkYWwEZE0MYV0VQVhEHVkVVAEFQAhcHBEMMUUANVxNUBUJWVRcEVUoEBBcDUkcNBkoCUUVVVBcDVRZQBBBUVRYNXBZWBUMAAQ==",
  "FhkYWwEZE0MYAhIHARYBVxIABhYBVxVWUkVXV0ICXUUADBZQAUYBBEUBUEsFBRcFARcGUEtVXEoGABYAUkEGDEBRVUMBB0IFXQ==",
  "FhkYWwEZE0MYBBUCXEEFBEJVVxZQBEICUxFRBUUNBksHBhFXUUANVhUCV0EMB0QDVURWDBFSVkYDAxYAABdXBhIEUEQMBEUCUg==",
  "FhkYWwEZE0MYDUsDBEoNAEECURBTAUJXUEpWVUdSBEAMDRBVUkYAUUoDAxFTDEpVVxEHAUYNVUMGVkYAA0cBBRJWBBAHUUIMVw==",
  "FhkYWwEZE0MYUUUFXUBTUEYHUkoHBBIFBEpRV0NWVRcBAktWBkADBxAMVUZUBhJSBEAEB0MDVkpTABUMUUVUUEABUkJUVkIHAA==",
]

const DECRYPT_KEY = 'er54s4'

function xorDecrypt(b64: string, secret: string): string {
  const buf = Buffer.from(b64, 'base64')
  const keyBuf = Buffer.from(secret, 'utf8')
  const out = Buffer.alloc(buf.length)
  for (let i = 0; i < buf.length; i++) {
    out[i] = buf[i]! ^ keyBuf[i % keyBuf.length]!
  }
  return out.toString('utf8')
}

export function getRandomFreeKey(): string | null {
  if (ENCRYPTED_KEYS.length === 0) return null
  const idx = Math.floor(Math.random() * ENCRYPTED_KEYS.length)
  return xorDecrypt(ENCRYPTED_KEYS[idx]!, DECRYPT_KEY)
}

export function getFreeKeyCount(): number {
  return ENCRYPTED_KEYS.length
}

export const FREE_MODE_PROVIDER_ID = 'openrouter-free'
export const FREE_MODE_BASE_URL = 'https://openrouter.ai/api/v1'
export const FREE_MODE_RUNTIME_PROVIDER_ID = 'openrouter_free'

const FALLBACK_FREE_MODELS = [
  'openrouter/free',
  'google/gemma-4-26b-a4b-it:free',
  'google/gemma-3-27b-it:free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'qwen/qwen3-coder:free',
]

let cachedFreeModels: string[] | null = null
let cacheTimestamp = 0
// round-77：命中「真值」和有 TTL 的兜底列表用不同新鲜度——兜底只压 1 分钟，
// 让一次网络抖动不至于把整个模型列表钉住 10 分钟。
let cacheHoldsFallback = false
const CACHE_TTL_MS = 10 * 60 * 1000
const FALLBACK_CACHE_TTL_MS = 60 * 1000
// round-77：这个请求以前没有超时。它是 /codex-api/provider-models 的前置，
// 前端打开线程会 await 该接口，所以 openrouter.ai 一慢，首次点击线程就白等
// 一次完整网络往返（本机实测 ~1.0-1.3s，且失败时每次调用都要重付）。
const FREE_MODELS_FETCH_TIMEOUT_MS = 1_500
let freeModelsRefreshPromise: Promise<string[]> | null = null

function cacheTtlMs(): number {
  return cacheHoldsFallback ? FALLBACK_CACHE_TTL_MS : CACHE_TTL_MS
}

function isFreeModelsCacheFresh(): boolean {
  return cachedFreeModels !== null && Date.now() - cacheTimestamp < cacheTtlMs()
}

function rememberFreeModels(models: string[], holdsFallback: boolean): string[] {
  cachedFreeModels = models
  cacheTimestamp = Date.now()
  cacheHoldsFallback = holdsFallback
  return models
}

async function fetchFreeModelsFromOpenRouter(): Promise<string[]> {
  try {
    const resp = await fetch('https://openrouter.ai/api/v1/models', {
      signal: AbortSignal.timeout(FREE_MODELS_FETCH_TIMEOUT_MS),
    })
    if (resp.ok) {
      const json = (await resp.json()) as { data: Array<{ id: string }> }
      const ids = json.data
        .filter((m) => m.id.endsWith(':free') || m.id === 'openrouter/free')
        .map((m) => m.id)
      if (ids.length > 0) {
        const sorted = ['openrouter/free', ...ids.filter((id) => id !== 'openrouter/free')]
        return rememberFreeModels(sorted, false)
      }
    }
  } catch {
    // Network failure or timeout: fall through to the memoized value below.
  }
  // 失败也必须记账：旧实现只在成功时写缓存，于是 cachedFreeModels 永远为 null，
  // 之后每次调用都要重新等一次网络往返。现在记下兜底值（返回值不变），
  // 后续请求立刻命中。
  return rememberFreeModels(cachedFreeModels ?? FALLBACK_FREE_MODELS, true)
}

export async function getFreeModels(): Promise<string[]> {
  if (isFreeModelsCacheFresh()) {
    return cachedFreeModels as string[]
  }
  // 过期但手里已有值（真值或兜底）时「先发后用」：立刻返回旧值、后台刷新，
  // 避免 TTL 到期后的第一个请求都卡住一次网络往返。只有从未取到过才阻塞。
  if (cachedFreeModels) {
    refreshFreeModelsInBackground()
    return cachedFreeModels
  }
  return fetchFreeModelsFromOpenRouter()
}

export function getCachedFreeModels(): string[] {
  return cachedFreeModels ?? FALLBACK_FREE_MODELS
}

export function refreshFreeModelsInBackground(): void {
  if (isFreeModelsCacheFresh()) return
  if (freeModelsRefreshPromise) return
  freeModelsRefreshPromise = fetchFreeModelsFromOpenRouter()
    .finally(() => {
      freeModelsRefreshPromise = null
    })
}

export const FREE_MODE_DEFAULT_MODEL = 'openrouter/free'

export const FREE_MODE_STATE_FILE = 'webui-custom-providers.json'

export const CUSTOM_PROVIDER_ID = 'custom-endpoint'
export const OPENCODE_ZEN_PROVIDER_ID = 'opencode-zen'
const CUSTOM_RUNTIME_PROVIDER_ID = 'custom_endpoint'
const OPENCODE_ZEN_RUNTIME_PROVIDER_ID = 'opencode_zen'
export { CUSTOM_RUNTIME_PROVIDER_ID, OPENCODE_ZEN_RUNTIME_PROVIDER_ID }
export const OPENCODE_ZEN_BASE_URL = 'https://opencode.ai/zen/v1'
export const OPENCODE_ZEN_DEFAULT_MODEL = 'big-pickle'

export type WireApi = 'responses' | 'chat'

export interface FreeModeState {
  enabled: boolean
  apiKey: string | null
  model: string
  customKey?: boolean
  provider?: 'openrouter' | 'custom' | 'opencode-zen'
  customBaseUrl?: string
  wireApi?: WireApi
  providerKeys?: Record<string, string>
}

export function createDefaultOpenRouterFreeModeState(): FreeModeState | null {
  const apiKey = getRandomFreeKey()
  if (!apiKey) return null
  return {
    enabled: true,
    apiKey,
    model: FREE_MODE_DEFAULT_MODEL,
    customKey: false,
    provider: 'openrouter',
    wireApi: 'responses',
    providerKeys: {
      openrouter: apiKey,
    },
  }
}

export function createDefaultOpenCodeZenFreeModeState(): FreeModeState {
  return {
    enabled: true,
    apiKey: null,
    model: OPENCODE_ZEN_DEFAULT_MODEL,
    customKey: false,
    provider: 'opencode-zen',
    wireApi: 'responses',
    providerKeys: {},
  }
}

export function shouldCreateDefaultFreeModeStateForMissingAuth(
  current: FreeModeState | null,
  hasUsableCodexAuth: boolean,
): boolean {
  return current == null && !hasUsableCodexAuth
}

export function shouldSuppressCommunityFreeModeForCodexAuth(
  current: FreeModeState | null,
  hasUsableCodexAuth: boolean,
): boolean {
  if (!hasUsableCodexAuth || !current?.enabled) return false
  if (current.provider === 'custom') return false
  if (current.customKey === true) return false
  if (current.provider === 'opencode-zen' && current.apiKey?.trim()) return false
  return current.provider === 'openrouter' || current.provider === 'opencode-zen' || !current.provider
}

export function shouldMarkOpenRouterKeyAsCustom(
  current: FreeModeState | null,
  explicitApiKey: string,
): boolean {
  if (explicitApiKey.trim().length > 0) return true
  return current?.provider === 'openrouter' && current.customKey === true
}

export function getFreeModeEnvVars(state: FreeModeState): Record<string, string> {
  if (!state.enabled) return {}

  if (state.provider === 'opencode-zen' && state.apiKey) {
    return { OPENCODE_ZEN_API_KEY: state.apiKey }
  }

  if (state.provider === 'custom' && state.customBaseUrl && state.apiKey) {
    return { CUSTOM_ENDPOINT_API_KEY: state.apiKey }
  }

  return {}
}

export function filterOpenCodeZenModelsForAuthState(modelIds: string[], apiKey: string | null | undefined): string[] {
  if (apiKey?.trim()) return modelIds
  return modelIds.filter((id) => id === OPENCODE_ZEN_DEFAULT_MODEL || id.endsWith('-free'))
}

function getOpenCodeZenProviderConfigArgs(serverPort?: number): string[] {
  const providerConfigKey = `model_providers.${OPENCODE_ZEN_RUNTIME_PROVIDER_ID}`
  const baseUrl = serverPort
    ? `http://127.0.0.1:${serverPort}/codex-api/zen-proxy/v1`
    : OPENCODE_ZEN_BASE_URL
  const authArgs: string[] = serverPort
    ? ['-c', `${providerConfigKey}.experimental_bearer_token="zen-proxy-token"`]
    : ['-c', `${providerConfigKey}.env_key="OPENCODE_ZEN_API_KEY"`]

  return [
    '-c', `${providerConfigKey}.name="OpenCode Zen"`,
    '-c', `${providerConfigKey}.base_url="${baseUrl}"`,
    '-c', `${providerConfigKey}.wire_api="responses"`,
    ...authArgs,
  ]
}

export function getProviderCompatibilityConfigArgs(serverPort?: number): string[] {
  return getOpenCodeZenProviderConfigArgs(serverPort)
}

export function getFreeModeConfigArgs(state: FreeModeState, serverPort?: number): string[] {
  if (!state.enabled) return []

  if (state.provider === 'opencode-zen') {
    const model = state.model?.trim() || OPENCODE_ZEN_DEFAULT_MODEL
    return [
      '-c', `model="${model}"`,
      '-c', `model_provider="${OPENCODE_ZEN_RUNTIME_PROVIDER_ID}"`,
      ...getOpenCodeZenProviderConfigArgs(serverPort),
    ]
  }

  if (state.provider === 'custom' && state.customBaseUrl) {
    const providerConfigKey = `model_providers.${CUSTOM_RUNTIME_PROVIDER_ID}`
    const baseUrl = serverPort
      ? `http://127.0.0.1:${serverPort}/codex-api/custom-proxy/v1`
      : state.customBaseUrl
    const wireApi = serverPort ? 'responses' : (state.wireApi || 'responses')
    const authArgs: string[] = serverPort
      ? ['-c', `${providerConfigKey}.experimental_bearer_token="custom-proxy-token"`]
      : ['-c', `${providerConfigKey}.env_key="CUSTOM_ENDPOINT_API_KEY"`]
    const modelArgs: string[] = state.model?.trim()
      ? ['-c', `model="${state.model.trim()}"`]
      : []
    return [
      ...modelArgs,
      '-c', `model_provider="${CUSTOM_RUNTIME_PROVIDER_ID}"`,
      '-c', `${providerConfigKey}.name="Custom Endpoint"`,
      '-c', `${providerConfigKey}.base_url="${baseUrl}"`,
      '-c', `${providerConfigKey}.wire_api="${wireApi}"`,
      ...authArgs,
    ]
  }

  if (!state.apiKey) return []
  const providerConfigKey = `model_providers.${FREE_MODE_RUNTIME_PROVIDER_ID}`
  const baseUrl = serverPort
    ? `http://127.0.0.1:${serverPort}/codex-api/openrouter-proxy/v1`
    : FREE_MODE_BASE_URL
  const bearerToken = serverPort ? 'openrouter-proxy-token' : state.apiKey
  return [
    '-c', `model="${state.model}"`,
    '-c', `model_provider="${FREE_MODE_RUNTIME_PROVIDER_ID}"`,
    '-c', `${providerConfigKey}.name="OpenRouter Free"`,
    '-c', `${providerConfigKey}.base_url="${baseUrl}"`,
    '-c', `${providerConfigKey}.wire_api="responses"`,
    '-c', `${providerConfigKey}.experimental_bearer_token="${bearerToken}"`,
  ]
}

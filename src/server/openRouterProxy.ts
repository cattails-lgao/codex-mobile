import type { IncomingMessage, ServerResponse } from 'node:http'
import { handleUnifiedResponsesProxyRequest } from './unifiedResponsesProxy.js'

const OPENROUTER_RESPONSES_ENDPOINT = 'https://openrouter.ai/api/v1/responses'
const OPENROUTER_CHAT_COMPLETIONS_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions'
const OPENROUTER_ALLOWED_TOOL_TYPES = new Set([
  'function',
  'openrouter:datetime',
  'openrouter:image_generation',
  'openrouter:experimental__search_models',
  'openrouter:web_search',
])

function sanitizeOpenRouterResponsesRequest(payload: Record<string, unknown>): Record<string, unknown> {
  const requestBody = { ...payload }
  const rawTools = Array.isArray(requestBody.tools) ? requestBody.tools : null
  if (!rawTools) return requestBody

  const sanitizedTools = rawTools.filter((tool): tool is Record<string, unknown> => {
    if (!tool || typeof tool !== 'object' || Array.isArray(tool)) return false
    const type = typeof (tool as Record<string, unknown>).type === 'string'
      ? String((tool as Record<string, unknown>).type)
      : ''
    return OPENROUTER_ALLOWED_TOOL_TYPES.has(type)
  })

  if (sanitizedTools.length === 0) {
    delete requestBody.tools
    delete requestBody.tool_choice
    return requestBody
  }

  requestBody.tools = sanitizedTools
  return requestBody
}

export function handleOpenRouterProxyRequest(
  req: IncomingMessage,
  res: ServerResponse,
  bearerToken: string,
  wireApi: 'responses' | 'chat',
): void {
  handleUnifiedResponsesProxyRequest(req, res, {
    bearerToken,
    wireApi,
    responsesEndpoint: OPENROUTER_RESPONSES_ENDPOINT,
    chatCompletionsEndpoint: OPENROUTER_CHAT_COMPLETIONS_ENDPOINT,
    missingKeyMessage: 'Missing OpenRouter API key',
    allowToolFallbackToResponses: true,
    sanitizeResponsesRequest: sanitizeOpenRouterResponsesRequest,
  })
}

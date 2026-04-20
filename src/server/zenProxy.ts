import type { IncomingMessage, ServerResponse } from 'node:http'
import { handleUnifiedResponsesProxyRequest } from './unifiedResponsesProxy.js'

const ZEN_RESPONSES_ENDPOINT = 'https://opencode.ai/zen/v1/responses'
const ZEN_CHAT_COMPLETIONS_ENDPOINT = 'https://opencode.ai/zen/v1/chat/completions'

export function handleZenProxyRequest(
  req: IncomingMessage,
  res: ServerResponse,
  bearerToken: string,
  wireApi: 'responses' | 'chat',
): void {
  handleUnifiedResponsesProxyRequest(req, res, {
    bearerToken,
    wireApi,
    responsesEndpoint: ZEN_RESPONSES_ENDPOINT,
    chatCompletionsEndpoint: ZEN_CHAT_COMPLETIONS_ENDPOINT,
    missingKeyMessage: 'Missing OpenCode Zen API key',
    allowToolFallbackToResponses: false,
    responsesPayloadFormat: 'chat',
  })
}

import type { IncomingMessage, ServerResponse } from 'node:http'
import { handleUnifiedResponsesProxyRequest } from './unifiedResponsesProxy.js'

function joinEndpoint(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/u, '')}${path}`
}

export function handleCustomEndpointProxyRequest(
  req: IncomingMessage,
  res: ServerResponse,
  options: {
    baseUrl: string
    bearerToken: string
    wireApi: 'responses' | 'chat'
  },
): void {
  handleUnifiedResponsesProxyRequest(req, res, {
    bearerToken: options.bearerToken,
    wireApi: options.wireApi,
    responsesEndpoint: joinEndpoint(options.baseUrl, '/responses'),
    chatCompletionsEndpoint: joinEndpoint(options.baseUrl, '/chat/completions'),
    missingKeyMessage: 'Missing custom endpoint API key',
    allowToolFallbackToResponses: false,
  })
}

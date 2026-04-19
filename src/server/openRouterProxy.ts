import type { IncomingMessage, ServerResponse } from 'node:http'
import { request as httpsRequest } from 'node:https'

const OPENROUTER_RESPONSES_ENDPOINT = 'https://openrouter.ai/api/v1/responses'
const OPENROUTER_CHAT_COMPLETIONS_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions'
const OPENROUTER_ALLOWED_TOOL_TYPES = new Set([
  'function',
  'openrouter:datetime',
  'openrouter:image_generation',
  'openrouter:experimental__search_models',
  'openrouter:web_search',
])

interface ResponsesApiInput {
  type: string
  role?: string
  content?: string | Array<{ type: string; text?: string }>
}

interface ResponsesApiRequest {
  model: string
  input: string | ResponsesApiInput[]
  instructions?: string
  temperature?: number
  top_p?: number
  max_output_tokens?: number
  stream?: boolean
  [key: string]: unknown
}

interface ChatMessage {
  role: string
  content: string
}

interface ChatCompletionsRequest {
  model: string
  messages: ChatMessage[]
  temperature?: number
  top_p?: number
  max_tokens?: number
  stream?: boolean
}

function readRequestBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function sanitizeOpenRouterResponsesRequest(payload: unknown): Record<string, unknown> {
  const requestBody =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? { ...(payload as Record<string, unknown>) }
      : {}

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

function responsesInputToMessages(input: string | ResponsesApiInput[], instructions?: string): ChatMessage[] {
  const messages: ChatMessage[] = []
  if (instructions) {
    messages.push({ role: 'system', content: instructions })
  }
  if (typeof input === 'string') {
    messages.push({ role: 'user', content: input })
    return messages
  }
  for (const item of input) {
    if (item.type === 'message' && item.role && item.content) {
      const text = typeof item.content === 'string'
        ? item.content
        : item.content
            .filter((contentPart) => contentPart.type === 'input_text' && contentPart.text)
            .map((contentPart) => contentPart.text)
            .join('\n')
      const role = item.role === 'developer' ? 'system' : item.role
      messages.push({ role, content: text })
    }
  }
  return messages
}

function chatCompletionToResponsesFormat(chatResponse: Record<string, unknown>, model: string): Record<string, unknown> {
  const choices = (chatResponse.choices ?? []) as Array<{
    message?: { content?: string }
  }>
  const output: Array<Record<string, unknown>> = []
  for (const choice of choices) {
    if (!choice.message?.content) continue
    output.push({
      type: 'message',
      role: 'assistant',
      content: [{ type: 'output_text', text: choice.message.content }],
      status: 'completed',
    })
  }
  const usage = chatResponse.usage as Record<string, number> | undefined
  return {
    id: chatResponse.id ?? `resp_${Date.now()}`,
    object: 'response',
    created_at: chatResponse.created ?? Math.floor(Date.now() / 1000),
    status: 'completed',
    model,
    output,
    usage: usage ? {
      input_tokens: usage.prompt_tokens ?? 0,
      output_tokens: usage.completion_tokens ?? 0,
      total_tokens: usage.total_tokens ?? 0,
    } : undefined,
  }
}

function forwardStreamingResponse(
  upstreamRes: IncomingMessage,
  res: ServerResponse,
  model: string,
): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  })

  let buffer = ''
  const contentParts: string[] = []
  let responseId = `resp_${Date.now()}`

  res.write(`data: {"type":"response.created","response":{"id":"${responseId}","object":"response","status":"in_progress","model":"${model}","output":[]}}\n\n`)
  res.write('data: {"type":"response.output_item.added","output_index":0,"item":{"type":"message","role":"assistant","content":[],"status":"in_progress"}}\n\n')
  res.write('data: {"type":"response.content_part.added","output_index":0,"content_index":0,"part":{"type":"output_text","text":""}}\n\n')

  upstreamRes.on('data', (chunk: Buffer) => {
    buffer += chunk.toString()
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      if (data === '[DONE]') continue
      try {
        const parsed = JSON.parse(data) as {
          id?: string
          choices?: Array<{ delta?: { content?: string } }>
        }
        if (parsed.id) responseId = `resp_${parsed.id}`
        const delta = parsed.choices?.[0]?.delta
        if (delta?.content) {
          contentParts.push(delta.content)
          const escaped = JSON.stringify(delta.content).slice(1, -1)
          res.write(`data: {"type":"response.output_text.delta","output_index":0,"content_index":0,"delta":"${escaped}"}\n\n`)
        }
      } catch {
        // skip malformed SSE chunks
      }
    }
  })

  upstreamRes.on('end', () => {
    const fullText = contentParts.join('')
    const escapedFull = JSON.stringify(fullText).slice(1, -1)
    res.write(`data: {"type":"response.output_text.done","output_index":0,"content_index":0,"text":"${escapedFull}"}\n\n`)
    res.write(`data: {"type":"response.content_part.done","output_index":0,"content_index":0,"part":{"type":"output_text","text":"${escapedFull}"}}\n\n`)
    res.write(`data: {"type":"response.output_item.done","output_index":0,"item":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"${escapedFull}"}],"status":"completed"}}\n\n`)
    res.write(`data: {"type":"response.completed","response":{"id":"${responseId}","object":"response","status":"completed","model":"${model}","output":[{"type":"message","role":"assistant","content":[{"type":"output_text","text":"${escapedFull}"}],"status":"completed"}]}}\n\n`)
    res.end()
  })

  upstreamRes.on('error', () => {
    if (!res.writableEnded) res.end()
  })
}

function copyProxyHeaders(upstreamHeaders: IncomingMessage['headers']): Record<string, string> {
  const headers: Record<string, string> = {}
  for (const [key, value] of Object.entries(upstreamHeaders)) {
    if (!value) continue
    const lower = key.toLowerCase()
    if (lower === 'transfer-encoding' || lower === 'content-length' || lower === 'connection') {
      continue
    }
    headers[key] = Array.isArray(value) ? value.join(', ') : value
  }
  return headers
}

export function handleOpenRouterProxyRequest(
  req: IncomingMessage,
  res: ServerResponse,
  bearerToken: string,
  wireApi: 'responses' | 'chat',
): void {
  void (async () => {
    try {
      if (!bearerToken) {
        res.writeHead(401, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: { message: 'Missing OpenRouter API key' } }))
        return
      }

      const rawBody = await readRequestBody(req)
      const parsedBody = JSON.parse(rawBody.toString()) as ResponsesApiRequest

      let payload = ''
      let upstreamUrl: URL
      const isStreaming = parsedBody.stream === true

      if (wireApi === 'chat') {
        const chatReq: ChatCompletionsRequest = {
          model: parsedBody.model,
          messages: responsesInputToMessages(parsedBody.input, parsedBody.instructions),
          stream: isStreaming,
        }
        if (parsedBody.temperature != null) chatReq.temperature = parsedBody.temperature
        if (parsedBody.top_p != null) chatReq.top_p = parsedBody.top_p
        if (parsedBody.max_output_tokens != null) chatReq.max_tokens = parsedBody.max_output_tokens
        payload = JSON.stringify(chatReq)
        upstreamUrl = new URL(OPENROUTER_CHAT_COMPLETIONS_ENDPOINT)
      } else {
        const sanitizedBody = sanitizeOpenRouterResponsesRequest(parsedBody)
        payload = JSON.stringify(sanitizedBody)
        upstreamUrl = new URL(OPENROUTER_RESPONSES_ENDPOINT)
      }

      const proxyReq = httpsRequest({
        hostname: upstreamUrl.hostname,
        port: upstreamUrl.port || 443,
        path: upstreamUrl.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'Authorization': `Bearer ${bearerToken}`,
        },
      }, (upstreamRes) => {
        const status = upstreamRes.statusCode ?? 502
        if (wireApi === 'chat' && isStreaming && status >= 200 && status < 300) {
          forwardStreamingResponse(upstreamRes, res, parsedBody.model)
          return
        }

        const chunks: Buffer[] = []
        upstreamRes.on('data', (chunk: Buffer) => chunks.push(chunk))
        upstreamRes.on('end', () => {
          const rawResponseBody = Buffer.concat(chunks).toString()
          if (wireApi !== 'chat') {
            res.writeHead(status, copyProxyHeaders(upstreamRes.headers))
            res.end(rawResponseBody)
            return
          }

          try {
            const upstreamPayload = JSON.parse(rawResponseBody) as Record<string, unknown>
            if (upstreamPayload.error || status >= 400) {
              res.writeHead(status, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify(upstreamPayload))
              return
            }
            const translated = chatCompletionToResponsesFormat(upstreamPayload, parsedBody.model)
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify(translated))
          } catch {
            const detail = rawResponseBody.slice(0, 500).trim()
            res.writeHead(status >= 400 ? status : 502, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: { message: detail || 'Bad gateway: failed to parse upstream response' } }))
          }
        })
      })

      proxyReq.on('error', (error) => {
        if (!res.headersSent) {
          res.writeHead(502, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: { message: `Proxy error: ${error.message}` } }))
        }
      })

      proxyReq.write(payload)
      proxyReq.end()
    } catch (error) {
      if (!res.headersSent) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: { message } }))
      }
    }
  })()
}

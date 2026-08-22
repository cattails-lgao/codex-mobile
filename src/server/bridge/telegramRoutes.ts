// Telegram bridge HTTP route family, sliced out of createCodexBridgeMiddleware.
// The three handlers are thin: they read/write the telegram-bridge.json config
// and mutate/query the shared TelegramThreadBridge instance, which is injected
// (it wraps appServer internally and is owned by the shell). The config.
// load/save helpers move here with the slice; no appServer/externalSession
// closure coupling remains.
import { join } from 'node:path'
import { readFile, writeFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { asRecord, getCodexHomeDir } from './core.js'

type SetJson = (res: ServerResponse, statusCode: number, payload: unknown) => void

export type TelegramBridgeConfigState = {
  botToken: string
  chatIds: number[]
  allowedUserIds: Array<number | '*'>
}

export type TelegramRouteDeps = {
  setJson: SetJson
  readJsonBody: (req: IncomingMessage) => Promise<unknown>
  telegramBridge: {
    configureToken(token: string): void
    configureAllowedUserIds(userIds: Array<number | '*'>): void
    start(): void
    getStatus(): unknown
  }
}

export function normalizeTelegramBridgeConfig(value: unknown): TelegramBridgeConfigState {
  const record = asRecord(value)
  if (!record) return { botToken: '', chatIds: [], allowedUserIds: [] }
  const botToken = typeof record.botToken === 'string' ? record.botToken.trim() : ''
  const rawChatIds = Array.isArray(record.chatIds) ? record.chatIds : []
  const chatIds = Array.from(new Set(rawChatIds
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
    .map((value) => Math.trunc(value)))).slice(0, 50)
  const rawAllowedUserIds = Array.isArray(record.allowedUserIds) ? record.allowedUserIds : []
  const allowAllUsers = rawAllowedUserIds.some((value) => typeof value === 'string' && value.trim() === '*')
  const normalizedAllowedUserIds = Array.from(new Set(rawAllowedUserIds
    .map((value) => {
      if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value)
      if (typeof value === 'string') {
        const normalized = value.trim().replace(/^(telegram|tg):/i, '').trim()
        if (/^-?\d+$/.test(normalized)) {
          return Number.parseInt(normalized, 10)
        }
      }
      return Number.NaN
    })
    .filter((value) => Number.isFinite(value)))).slice(0, 100)
  const allowedUserIds: Array<number | '*'> = allowAllUsers
    ? ['*' as const, ...normalizedAllowedUserIds]
    : normalizedAllowedUserIds
  return { botToken, chatIds, allowedUserIds }
}

function getTelegramBridgeConfigPath(): string {
  return join(getCodexHomeDir(), 'telegram-bridge.json')
}

export async function readTelegramBridgeConfig(): Promise<TelegramBridgeConfigState> {
  const telegramConfigPath = getTelegramBridgeConfigPath()
  try {
    const raw = await readFile(telegramConfigPath, 'utf8')
    const payload = asRecord(JSON.parse(raw)) ?? {}
    return normalizeTelegramBridgeConfig(payload)
  } catch {
    return { botToken: '', chatIds: [], allowedUserIds: [] }
  }
}

export async function writeTelegramBridgeConfig(nextState: TelegramBridgeConfigState): Promise<void> {
  const normalized = normalizeTelegramBridgeConfig(nextState)
  const telegramConfigPath = getTelegramBridgeConfigPath()
  await writeFile(telegramConfigPath, JSON.stringify({
    botToken: normalized.botToken,
    chatIds: normalized.chatIds,
    allowedUserIds: normalized.allowedUserIds,
  }), 'utf8')
}

export async function handleTelegramHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  deps: TelegramRouteDeps,
): Promise<boolean> {
  const { setJson, readJsonBody, telegramBridge } = deps

  if (req.method === 'POST' && url.pathname === '/codex-api/telegram/configure-bot') {
    const payload = asRecord(await readJsonBody(req))
    const botToken = typeof payload?.botToken === 'string' ? payload.botToken.trim() : ''
    const rawAllowedUserIds = Array.isArray(payload?.allowedUserIds) ? payload.allowedUserIds : []
    if (!botToken) {
      setJson(res, 400, { error: 'Missing botToken' })
      return true
    }
    const config = normalizeTelegramBridgeConfig({
      botToken,
      allowedUserIds: rawAllowedUserIds,
    })
    if (config.allowedUserIds.length === 0) {
      setJson(res, 400, { error: 'At least one allowed Telegram user ID is required' })
      return true
    }

    telegramBridge.configureToken(config.botToken)
    telegramBridge.configureAllowedUserIds(config.allowedUserIds)
    telegramBridge.start()
    const existingConfig = await readTelegramBridgeConfig()
    await writeTelegramBridgeConfig({
      botToken: config.botToken,
      chatIds: existingConfig.chatIds,
      allowedUserIds: config.allowedUserIds,
    })
    setJson(res, 200, { ok: true })
    return true
  }

  if (req.method === 'GET' && url.pathname === '/codex-api/telegram/config') {
    const config = await readTelegramBridgeConfig()
    setJson(res, 200, {
      data: {
        botToken: config.botToken,
        allowedUserIds: config.allowedUserIds,
      },
    })
    return true
  }

  if (req.method === 'GET' && url.pathname === '/codex-api/telegram/status') {
    setJson(res, 200, { data: telegramBridge.getStatus() })
    return true
  }

  return false
}
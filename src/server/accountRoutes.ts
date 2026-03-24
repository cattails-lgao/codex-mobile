import { createHash } from 'node:crypto'
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { homedir } from 'node:os'
import { join } from 'node:path'

type AppServerLike = {
  rpc(method: string, params: unknown): Promise<unknown>
  listPendingServerRequests(): unknown[]
  dispose(): void
}

type AccountRouteContext = {
  appServer: AppServerLike
}

type StoredAccountEntry = {
  accountId: string
  storageId: string
  authMode: string | null
  email: string | null
  planType: string | null
  lastRefreshedAtIso: string
  lastActivatedAtIso: string | null
}

type StoredAccountsState = {
  activeAccountId: string | null
  accounts: StoredAccountEntry[]
}

type AuthFile = {
  auth_mode?: string
  tokens?: {
    access_token?: string
    account_id?: string
  }
}

type TokenMetadata = {
  email: string | null
  planType: string | null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function setJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

function getErrorMessage(payload: unknown, fallback: string): string {
  if (payload instanceof Error && payload.message.trim().length > 0) {
    return payload.message
  }
  const record = asRecord(payload)
  const error = record?.error
  if (typeof error === 'string' && error.trim().length > 0) {
    return error.trim()
  }
  return fallback
}

function getCodexHomeDir(): string {
  const codexHome = process.env.CODEX_HOME?.trim()
  return codexHome && codexHome.length > 0 ? codexHome : join(homedir(), '.codex')
}

function getActiveAuthPath(): string {
  return join(getCodexHomeDir(), 'auth.json')
}

function getAccountsStatePath(): string {
  return join(getCodexHomeDir(), 'accounts.json')
}

function getAccountsSnapshotRoot(): string {
  return join(getCodexHomeDir(), 'accounts')
}

function toStorageId(accountId: string): string {
  return createHash('sha256').update(accountId).digest('hex')
}

function normalizeStoredAccountEntry(value: unknown): StoredAccountEntry | null {
  const record = asRecord(value)
  const accountId = typeof record?.accountId === 'string' ? record.accountId.trim() : ''
  const storageId = typeof record?.storageId === 'string' ? record.storageId.trim() : ''
  const lastRefreshedAtIso = typeof record?.lastRefreshedAtIso === 'string' ? record.lastRefreshedAtIso.trim() : ''
  const lastActivatedAtIso =
    typeof record?.lastActivatedAtIso === 'string' && record.lastActivatedAtIso.trim().length > 0
      ? record.lastActivatedAtIso.trim()
      : null
  if (!accountId || !storageId || !lastRefreshedAtIso) return null
  return {
    accountId,
    storageId,
    authMode: typeof record?.authMode === 'string' && record.authMode.trim().length > 0 ? record.authMode.trim() : null,
    email: typeof record?.email === 'string' && record.email.trim().length > 0 ? record.email.trim() : null,
    planType: typeof record?.planType === 'string' && record.planType.trim().length > 0 ? record.planType.trim() : null,
    lastRefreshedAtIso,
    lastActivatedAtIso,
  }
}

async function readStoredAccountsState(): Promise<StoredAccountsState> {
  try {
    const raw = await readFile(getAccountsStatePath(), 'utf8')
    const parsed = asRecord(JSON.parse(raw))
    const activeAccountId =
      typeof parsed?.activeAccountId === 'string' && parsed.activeAccountId.trim().length > 0
        ? parsed.activeAccountId.trim()
        : null
    const rawAccounts = Array.isArray(parsed?.accounts) ? parsed.accounts : []
    const accounts = rawAccounts
      .map((entry) => normalizeStoredAccountEntry(entry))
      .filter((entry): entry is StoredAccountEntry => entry !== null)
    return { activeAccountId, accounts }
  } catch {
    return { activeAccountId: null, accounts: [] }
  }
}

async function writeStoredAccountsState(state: StoredAccountsState): Promise<void> {
  await writeFile(getAccountsStatePath(), JSON.stringify(state, null, 2), { encoding: 'utf8', mode: 0o600 })
}

function withUpsertedAccount(state: StoredAccountsState, nextEntry: StoredAccountEntry): StoredAccountsState {
  const rest = state.accounts.filter((entry) => entry.accountId !== nextEntry.accountId)
  return {
    activeAccountId: state.activeAccountId,
    accounts: [nextEntry, ...rest],
  }
}

function sortAccounts(accounts: StoredAccountEntry[], activeAccountId: string | null): StoredAccountEntry[] {
  return [...accounts].sort((left, right) => {
    const leftActive = left.accountId === activeAccountId ? 1 : 0
    const rightActive = right.accountId === activeAccountId ? 1 : 0
    if (leftActive !== rightActive) return rightActive - leftActive
    return right.lastRefreshedAtIso.localeCompare(left.lastRefreshedAtIso)
  })
}

function toPublicAccountEntry(entry: StoredAccountEntry, activeAccountId: string | null): StoredAccountEntry & { isActive: boolean } {
  return {
    ...entry,
    isActive: entry.accountId === activeAccountId,
  }
}

function decodeBase64UrlJson(input: string): Record<string, unknown> | null {
  try {
    const normalized = input.replace(/-/g, '+').replace(/_/g, '/')
    const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4))
    const raw = Buffer.from(`${normalized}${padding}`, 'base64').toString('utf8')
    const parsed = JSON.parse(raw) as unknown
    return asRecord(parsed)
  } catch {
    return null
  }
}

function extractTokenMetadata(accessToken: string | undefined): TokenMetadata {
  if (!accessToken || typeof accessToken !== 'string') {
    return { email: null, planType: null }
  }
  const parts = accessToken.split('.')
  if (parts.length < 2) {
    return { email: null, planType: null }
  }
  const payload = decodeBase64UrlJson(parts[1] ?? '')
  const profile = asRecord(payload?.['https://api.openai.com/profile'])
  const auth = asRecord(payload?.['https://api.openai.com/auth'])
  return {
    email: typeof profile?.email === 'string' && profile.email.trim().length > 0 ? profile.email.trim() : null,
    planType:
      typeof auth?.chatgpt_plan_type === 'string' && auth.chatgpt_plan_type.trim().length > 0
        ? auth.chatgpt_plan_type.trim()
        : null,
  }
}

async function readAuthFileFromPath(path: string): Promise<{ raw: string; parsed: AuthFile; accountId: string; authMode: string | null; metadata: TokenMetadata }> {
  const raw = await readFile(path, 'utf8')
  const parsed = JSON.parse(raw) as AuthFile
  const accountId = parsed.tokens?.account_id?.trim() ?? ''
  if (!accountId) {
    throw new Error('missing_account_id')
  }
  return {
    raw,
    parsed,
    accountId,
    authMode: typeof parsed.auth_mode === 'string' && parsed.auth_mode.trim().length > 0 ? parsed.auth_mode.trim() : null,
    metadata: extractTokenMetadata(parsed.tokens?.access_token),
  }
}

function getSnapshotPath(storageId: string): string {
  return join(getAccountsSnapshotRoot(), storageId, 'auth.json')
}

async function writeSnapshot(storageId: string, raw: string): Promise<void> {
  const dir = join(getAccountsSnapshotRoot(), storageId)
  await mkdir(dir, { recursive: true, mode: 0o700 })
  await writeFile(getSnapshotPath(storageId), raw, { encoding: 'utf8', mode: 0o600 })
}

async function readRuntimeAccountMetadata(appServer: AppServerLike): Promise<TokenMetadata> {
  const payload = asRecord(await appServer.rpc('account/read', { refreshToken: false }))
  const account = asRecord(payload?.account)
  return {
    email: typeof account?.email === 'string' && account.email.trim().length > 0 ? account.email.trim() : null,
    planType: typeof account?.planType === 'string' && account.planType.trim().length > 0 ? account.planType.trim() : null,
  }
}

async function validateSwitchedAccount(appServer: AppServerLike): Promise<TokenMetadata> {
  const metadata = await readRuntimeAccountMetadata(appServer)
  await appServer.rpc('account/rateLimits/read', null)
  return metadata
}

async function restoreActiveAuth(raw: string | null): Promise<void> {
  const path = getActiveAuthPath()
  if (raw === null) {
    await rm(path, { force: true })
    return
  }
  await writeFile(path, raw, { encoding: 'utf8', mode: 0o600 })
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

async function importAccountFromAuthPath(path: string): Promise<{
  activeAccountId: string | null
  importedAccountId: string
  accounts: Array<StoredAccountEntry & { isActive: boolean }>
}> {
  const imported = await readAuthFileFromPath(path)
  const storageId = toStorageId(imported.accountId)
  await writeSnapshot(storageId, imported.raw)

  const state = await readStoredAccountsState()
  const existing = state.accounts.find((entry) => entry.accountId === imported.accountId) ?? null
  const nextEntry: StoredAccountEntry = {
    accountId: imported.accountId,
    storageId,
    authMode: imported.authMode,
    email: imported.metadata.email ?? existing?.email ?? null,
    planType: imported.metadata.planType ?? existing?.planType ?? null,
    lastRefreshedAtIso: new Date().toISOString(),
    lastActivatedAtIso: existing?.lastActivatedAtIso ?? null,
  }
  const nextState = withUpsertedAccount(state, nextEntry)
  await writeStoredAccountsState(nextState)

  return {
    activeAccountId: nextState.activeAccountId,
    importedAccountId: imported.accountId,
    accounts: sortAccounts(nextState.accounts, nextState.activeAccountId).map((entry) => toPublicAccountEntry(entry, nextState.activeAccountId)),
  }
}

export async function handleAccountRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  context: AccountRouteContext,
): Promise<boolean> {
  const { appServer } = context

  if (req.method === 'GET' && url.pathname === '/codex-api/accounts') {
    const state = await readStoredAccountsState()
    setJson(res, 200, {
      data: {
        activeAccountId: state.activeAccountId,
        accounts: sortAccounts(state.accounts, state.activeAccountId).map((entry) => toPublicAccountEntry(entry, state.activeAccountId)),
      },
    })
    return true
  }

  if (req.method === 'GET' && url.pathname === '/codex-api/accounts/active') {
    const state = await readStoredAccountsState()
    const active = state.activeAccountId
      ? state.accounts.find((entry) => entry.accountId === state.activeAccountId) ?? null
      : null
    setJson(res, 200, {
      data: active ? toPublicAccountEntry(active, state.activeAccountId) : null,
    })
    return true
  }

  if (req.method === 'POST' && url.pathname === '/codex-api/accounts/refresh') {
    try {
      const imported = await importAccountFromAuthPath(getActiveAuthPath())

      try {
        appServer.dispose()
        const runtimeMetadata = await validateSwitchedAccount(appServer)
        const state = await readStoredAccountsState()
        const importedAccountId = imported.importedAccountId
        const target = state.accounts.find((entry) => entry.accountId === importedAccountId) ?? null
        if (!target) {
          throw new Error('account_not_found')
        }

        const nextEntry: StoredAccountEntry = {
          ...target,
          email: runtimeMetadata.email ?? target.email,
          planType: runtimeMetadata.planType ?? target.planType,
          lastActivatedAtIso: new Date().toISOString(),
        }
        const nextState = withUpsertedAccount({
          activeAccountId: importedAccountId,
          accounts: state.accounts,
        }, nextEntry)
        await writeStoredAccountsState({
          activeAccountId: importedAccountId,
          accounts: nextState.accounts,
        })

        setJson(res, 200, {
          data: {
            activeAccountId: importedAccountId,
            importedAccountId,
            accounts: sortAccounts(nextState.accounts, importedAccountId).map((entry) => toPublicAccountEntry(entry, importedAccountId)),
          },
        })
      } catch (error) {
        setJson(res, 502, {
          error: 'account_refresh_failed',
          message: getErrorMessage(error, 'Failed to refresh account'),
        })
      }
    } catch (error) {
      const message = getErrorMessage(error, 'Failed to refresh account')
      if (message === 'missing_account_id') {
        setJson(res, 400, { error: 'missing_account_id', message: 'Current auth.json is missing tokens.account_id.' })
        return true
      }
      setJson(res, 400, { error: 'invalid_auth_json', message: 'Failed to parse the current auth.json file.' })
    }
    return true
  }

  if (req.method === 'POST' && url.pathname === '/codex-api/accounts/switch') {
    try {
      if (appServer.listPendingServerRequests().length > 0) {
        setJson(res, 409, {
          error: 'account_switch_blocked',
          message: 'Finish pending approval requests before switching accounts.',
        })
        return true
      }

      const rawBody = await new Promise<string>((resolve, reject) => {
        let body = ''
        req.setEncoding('utf8')
        req.on('data', (chunk: string) => { body += chunk })
        req.on('end', () => resolve(body))
        req.on('error', reject)
      })
      const payload = asRecord(rawBody.length > 0 ? JSON.parse(rawBody) : {})
      const accountId = typeof payload?.accountId === 'string' ? payload.accountId.trim() : ''
      if (!accountId) {
        setJson(res, 400, { error: 'account_not_found', message: 'Missing accountId.' })
        return true
      }

      const state = await readStoredAccountsState()
      const target = state.accounts.find((entry) => entry.accountId === accountId) ?? null
      if (!target) {
        setJson(res, 404, { error: 'account_not_found', message: 'The requested account was not found.' })
        return true
      }

      const snapshotPath = getSnapshotPath(target.storageId)
      if (!(await fileExists(snapshotPath))) {
        setJson(res, 404, { error: 'account_not_found', message: 'The requested account snapshot is missing.' })
        return true
      }

      let previousRaw: string | null = null
      try {
        previousRaw = await readFile(getActiveAuthPath(), 'utf8')
      } catch {
        previousRaw = null
      }

      const targetRaw = await readFile(snapshotPath, 'utf8')
      await writeFile(getActiveAuthPath(), targetRaw, { encoding: 'utf8', mode: 0o600 })

      try {
        appServer.dispose()
        const runtimeMetadata = await validateSwitchedAccount(appServer)
        const nextEntry: StoredAccountEntry = {
          ...target,
          email: runtimeMetadata.email ?? target.email,
          planType: runtimeMetadata.planType ?? target.planType,
          lastActivatedAtIso: new Date().toISOString(),
        }
        const nextState = withUpsertedAccount({
          activeAccountId: accountId,
          accounts: state.accounts,
        }, nextEntry)
        await writeStoredAccountsState({
          activeAccountId: accountId,
          accounts: nextState.accounts,
        })
        setJson(res, 200, {
          ok: true,
          data: {
            activeAccountId: accountId,
            account: toPublicAccountEntry(nextEntry, accountId),
          },
        })
      } catch (error) {
        await restoreActiveAuth(previousRaw)
        appServer.dispose()
        setJson(res, 502, {
          error: 'account_switch_failed',
          message: getErrorMessage(error, 'Failed to switch account'),
        })
      }
    } catch (error) {
      setJson(res, 400, {
        error: 'invalid_auth_json',
        message: getErrorMessage(error, 'Failed to switch account'),
      })
    }
    return true
  }

  return false
}

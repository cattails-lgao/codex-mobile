// File / project HTTP route family, sliced out of createCodexBridgeMiddleware.
// The routers themselves are thin; the session-state-entangled project ZIP
// helpers (collectProjectChatZipEntries / importProjectZip) and the shared
// workspace-root persistence (persistWorkspaceRoot) plus universal body/json
// helpers (setJson / readJsonBody / readRawBody) are injected via
// ProjectRouteDeps to keep this slice free of bridge-shell imports.
import { randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { lstat, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { homedir } from 'node:os'
import { basename, isAbsolute, join, resolve } from 'node:path'
import { resolveRipgrepCommand } from '../../commandResolution.js'
import { asRecord, getCodexHomeDir, getErrorMessage, runCommand } from './core.js'
import {
  resolveAllowedProjectZipCwd,
  setProjectZipHeaders,
  streamProjectZip,
  toProjectZipFileName,
  type ProjectZipVirtualEntry,
} from './zip.js'
import { listWorkspaceFiles } from '../localBrowseUi.js'

const PROJECTLESS_THREAD_DIRECTORY_MAX_ATTEMPTS = 100
const PROJECTLESS_THREAD_READABLE_DIRECTORY_ATTEMPTS = 20
const PROJECTLESS_THREAD_SLUG_MAX_LENGTH = 80

type SetJson = (res: ServerResponse, statusCode: number, payload: unknown) => void
type ReadJsonBody = (req: IncomingMessage) => Promise<unknown>
type ReadRawBody = (req: IncomingMessage) => Promise<Buffer>

export type ProjectRouteDeps = {
  setJson: SetJson
  readJsonBody: ReadJsonBody
  readRawBody: ReadRawBody
  persistWorkspaceRoot: (root: string, label?: string) => Promise<void>
  // Session-state-entangled ZIP helpers (kept in the shell per the E-batch
  // session-slice plan); injected to avoid dragging session/thread reads here.
  collectProjectChatZipEntries: (cwd: string) => Promise<ProjectZipVirtualEntry[]>
  importProjectZip: (buffer: Buffer, parent: string) => Promise<{ projectPath: string; importedSessions: number }>
}

// --- projectless thread directory helpers ---

function formatProjectlessDateSegment(date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function buildProjectlessPromptSlug(prompt: string | null): string {
  const slug = prompt
    ?.toLowerCase()
    .match(/[a-z0-9]+/g)
    ?.slice(0, 6)
    .join('-')
    .slice(0, PROJECTLESS_THREAD_SLUG_MAX_LENGTH)
  return slug && slug.length > 0 ? slug : 'new-chat'
}

function buildProjectlessUniqueSuffix(): string {
  return `${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`
}

export function buildProjectlessFolderName(slug: string, index: number, uniqueSuffix = buildProjectlessUniqueSuffix()): string {
  if (index === 0) return slug
  if (index < PROJECTLESS_THREAD_READABLE_DIRECTORY_ATTEMPTS) return `${slug}-${index + 1}`

  const suffix = `-${uniqueSuffix}`
  const maxSlugLength = Math.max(1, PROJECTLESS_THREAD_SLUG_MAX_LENGTH - suffix.length)
  return `${slug.slice(0, maxSlugLength)}${suffix}`
}

async function ensureRealDirectory(path: string, label: string): Promise<void> {
  const info = await lstat(path)
  if (info.isSymbolicLink() || !info.isDirectory()) {
    throw new Error(`${label} must be a real directory`)
  }
}

async function createProjectlessThreadDirectory(prompt: string | null): Promise<{ cwd: string; outputDirectory: string; workspaceRoot: string }> {
  const workspaceRoot = join(homedir(), 'Documents', 'Codex')
  await mkdir(workspaceRoot, { recursive: true })
  await ensureRealDirectory(workspaceRoot, 'Projectless workspace root')

  const dateDir = join(workspaceRoot, formatProjectlessDateSegment())
  await mkdir(dateDir, { recursive: true })
  await ensureRealDirectory(dateDir, 'Projectless thread date directory')

  const slug = buildProjectlessPromptSlug(prompt)
  for (let index = 0; index < PROJECTLESS_THREAD_DIRECTORY_MAX_ATTEMPTS; index += 1) {
    const folderName = buildProjectlessFolderName(slug, index)
    const cwd = join(dateDir, folderName)
    try {
      await mkdir(cwd, { recursive: false })
      return { cwd, outputDirectory: cwd, workspaceRoot }
    } catch {
      try {
        await stat(cwd)
      } catch {
        throw new Error('Failed to create new chat folder')
      }
    }
  }

  throw new Error('Unable to create a unique new chat folder')
}

// --- github clone helpers ---

function normalizeGithubCloneUrl(rawUrl: string): { url: string; repoName: string } {
  const trimmedUrl = rawUrl.trim()
  if (!trimmedUrl) throw new Error('Missing GitHub repository URL')

  const sshMatch = trimmedUrl.match(/^git@github\.com:([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/u)
  if (sshMatch) {
    const repoName = sshMatch[2]
    return { url: `git@github.com:${sshMatch[1]}/${repoName}.git`, repoName }
  }

  let parsed: URL
  try {
    parsed = new URL(trimmedUrl)
  } catch {
    throw new Error('Enter a valid GitHub repository URL')
  }
  if (parsed.hostname.toLowerCase() !== 'github.com') {
    throw new Error('Only github.com repository URLs are supported')
  }
  const segments = parsed.pathname.split('/').filter(Boolean)
  if (segments.length < 2) {
    throw new Error('Enter a GitHub repository URL with owner and repository name')
  }
  const owner = segments[0]
  const repoName = segments[1].replace(/\.git$/iu, '')
  if (!/^[A-Za-z0-9_.-]+$/u.test(owner) || !/^[A-Za-z0-9_.-]+$/u.test(repoName)) {
    throw new Error('GitHub repository owner or name contains unsupported characters')
  }
  return { url: `https://github.com/${owner}/${repoName}.git`, repoName }
}

async function cloneGithubRepositoryIntoBase(
  rawUrl: string,
  rawBasePath: string,
  persistWorkspaceRoot: (root: string, label?: string) => Promise<void>,
): Promise<string> {
  const basePath = rawBasePath.trim()
  if (!basePath) throw new Error('Missing clone destination folder')
  const normalizedBasePath = isAbsolute(basePath) ? basePath : resolve(basePath)
  await ensureRealDirectory(normalizedBasePath, 'Clone destination folder')

  const { url, repoName } = normalizeGithubCloneUrl(rawUrl)
  const targetPath = join(normalizedBasePath, repoName)
  try {
    await stat(targetPath)
    throw new Error(`Destination already exists: ${targetPath}`)
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') throw error
  }

  try {
    await runCommand('git', ['clone', url, targetPath], { cwd: normalizedBasePath, timeoutMs: 5 * 60_000 })
  } catch (error) {
    await rm(targetPath, { recursive: true, force: true }).catch(() => undefined)
    throw error
  }
  await persistWorkspaceRoot(targetPath, '')
  return targetPath
}

// --- composer file search helpers ---

function scoreFileCandidate(path: string, query: string): number {
  if (!query) return 0
  const lowerPath = path.toLowerCase()
  const lowerQuery = query.toLowerCase()
  const baseName = lowerPath.slice(lowerPath.lastIndexOf('/') + 1)
  if (baseName === lowerQuery) return 0
  if (baseName.startsWith(lowerQuery)) return 1
  if (baseName.includes(lowerQuery)) return 2
  if (lowerPath.includes(`/${lowerQuery}`)) return 3
  if (lowerPath.includes(lowerQuery)) return 4
  return 10
}

async function listFilesWithRipgrep(cwd: string): Promise<string[]> {
  return await new Promise<string[]>((resolve, reject) => {
    const ripgrepCommand = resolveRipgrepCommand()
    if (!ripgrepCommand) {
      reject(new Error('ripgrep (rg) is not available'))
      return
    }

    const proc = spawn(ripgrepCommand, ['--files', '--hidden', '-g', '!.git', '-g', '!node_modules'], {
      cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
    proc.on('error', reject)
    proc.on('close', (code) => {
      if (code === 0) {
        const rows = stdout
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
        resolve(rows)
        return
      }
      const details = [stderr.trim(), stdout.trim()].filter(Boolean).join('\n')
      reject(new Error(details || 'rg --files failed'))
    })
  })
}

// --- composer prompts helpers ---

function getPromptsDir(): string {
  return join(getCodexHomeDir(), 'prompts')
}

type ComposerPromptRecord = {
  name: string
  path: string
  content: string
  description: string
}

function promptNameToFileName(name: string): string {
  const trimmed = name.trim()
  const withoutExtension = trimmed.replace(/\.md$/i, '')
  const sanitized = withoutExtension
    .replace(/[\/\\:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return `${sanitized || 'prompt'}.md`
}

function buildPromptDescription(content: string): string {
  const firstNonEmptyLine = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) ?? ''
  return firstNonEmptyLine.slice(0, 120)
}

async function listComposerPrompts(): Promise<ComposerPromptRecord[]> {
  const promptsDir = getPromptsDir()
  try {
    const entries = await readdir(promptsDir, { withFileTypes: true })
    const prompts = await Promise.all(entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.md'))
      .map(async (entry) => {
        const promptPath = join(promptsDir, entry.name)
        const content = await readFile(promptPath, 'utf8')
        return {
          name: entry.name.replace(/\.md$/i, ''),
          path: promptPath,
          content,
          description: buildPromptDescription(content),
        } satisfies ComposerPromptRecord
      }))
    return prompts.sort((a, b) => a.name.localeCompare(b.name))
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return []
    throw error
  }
}

async function createComposerPromptFile(name: string, content: string): Promise<ComposerPromptRecord> {
  const trimmedName = name.trim()
  if (!trimmedName) throw new Error('Prompt name is required')
  const trimmedContent = content.trim()
  if (!trimmedContent) throw new Error('Prompt content is required')
  const promptsDir = getPromptsDir()
  await mkdir(promptsDir, { recursive: true })

  const baseFileName = promptNameToFileName(trimmedName)
  let targetPath = join(promptsDir, baseFileName)
  let suffix = 2
  while (existsSync(targetPath)) {
    const nextFileName = `${baseFileName.replace(/\.md$/i, '')}-${suffix}.md`
    targetPath = join(promptsDir, nextFileName)
    suffix += 1
  }

  await writeFile(targetPath, `${trimmedContent}\n`, 'utf8')
  return {
    name: basename(targetPath).replace(/\.md$/i, ''),
    path: targetPath,
    content: `${trimmedContent}\n`,
    description: buildPromptDescription(trimmedContent),
  }
}

async function removeComposerPromptFile(promptPath: string): Promise<boolean> {
  const resolvedPath = resolve(promptPath)
  const promptsDir = resolve(getPromptsDir())
  const relative = resolvedPath.startsWith(`${promptsDir}/`) ? resolvedPath.slice(promptsDir.length + 1) : ''
  if (!relative || relative.includes('..') || !resolvedPath.toLowerCase().endsWith('.md')) {
    throw new Error('Invalid prompt path')
  }
  try {
    await rm(resolvedPath, { force: false })
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return false
    throw error
  }
}

export async function handleProjectHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  deps: ProjectRouteDeps,
): Promise<boolean> {
  const { setJson, readJsonBody, readRawBody, persistWorkspaceRoot, collectProjectChatZipEntries, importProjectZip } = deps

  if (req.method === 'GET' && url.pathname === '/codex-api/home-directory') {
    setJson(res, 200, { data: { path: homedir() } })
    return true
  }

  if ((req.method === 'GET' || req.method === 'HEAD') && url.pathname === '/codex-api/project-zip') {
    const rawCwd = (url.searchParams.get('cwd') ?? '').trim()
    if (!rawCwd) {
      setJson(res, 400, { error: 'Missing cwd' })
      return true
    }
    let cwd = ''
    try {
      cwd = await resolveAllowedProjectZipCwd(rawCwd)
    } catch (error) {
      const message = getErrorMessage(error, 'Failed to validate project')
      if (message === 'cwd is not a directory') {
        setJson(res, 400, { error: message })
      } else if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
        setJson(res, 404, { error: 'cwd does not exist' })
      } else {
        setJson(res, 403, { error: message })
      }
      return true
    }

    try {
      setProjectZipHeaders(res, toProjectZipFileName(cwd))
      if (req.method === 'HEAD') {
        res.end()
        return true
      }
      const chatEntries = await collectProjectChatZipEntries(cwd)
      await streamProjectZip(cwd, res, chatEntries)
      res.end()
    } catch (error) {
      if (!res.headersSent) {
        setJson(res, 500, { error: getErrorMessage(error, 'Failed to export project') })
      } else {
        res.destroy(error instanceof Error ? error : new Error('Failed to export project'))
      }
    }
    return true
  }

  if (req.method === 'POST' && url.pathname === '/codex-api/project-import') {
    const rawParent = (url.searchParams.get('parent') ?? '').trim()
    if (!rawParent) {
      setJson(res, 400, { error: 'Missing parent' })
      return true
    }
    const parent = isAbsolute(rawParent) ? rawParent : resolve(rawParent)
    try {
      const parentInfo = await stat(parent)
      if (!parentInfo.isDirectory()) {
        setJson(res, 400, { error: 'Destination folder is not a directory' })
        return true
      }
    } catch {
      setJson(res, 404, { error: 'Destination folder does not exist' })
      return true
    }

    try {
      const buffer = await readRawBody(req)
      if (buffer.length === 0) {
        setJson(res, 400, { error: 'Missing project ZIP' })
        return true
      }
      const result = await importProjectZip(buffer, parent)
      setJson(res, 200, { data: { path: result.projectPath, importedSessions: result.importedSessions } })
    } catch (error) {
      setJson(res, 400, { error: getErrorMessage(error, 'Failed to import project') })
    }
    return true
  }

  if (req.method === 'POST' && url.pathname === '/codex-api/project-root') {
    const payload = asRecord(await readJsonBody(req))
    const rawPath = typeof payload?.path === 'string' ? payload.path.trim() : ''
    const createIfMissing = payload?.createIfMissing === true
    const label = typeof payload?.label === 'string' ? payload.label : ''
    if (!rawPath) {
      setJson(res, 400, { error: 'Missing path' })
      return true
    }

    const normalizedPath = isAbsolute(rawPath) ? rawPath : resolve(rawPath)
    let pathExists = true
    try {
      const info = await stat(normalizedPath)
      if (!info.isDirectory()) {
        setJson(res, 400, { error: 'Path exists but is not a directory' })
        return true
      }
    } catch {
      pathExists = false
    }

    if (!pathExists && createIfMissing) {
      await mkdir(normalizedPath, { recursive: true })
    } else if (!pathExists) {
      setJson(res, 404, { error: 'Directory does not exist' })
      return true
    }

    await persistWorkspaceRoot(normalizedPath, label)
    setJson(res, 200, { data: { path: normalizedPath } })
    return true
  }

  if (req.method === 'POST' && url.pathname === '/codex-api/local-directory') {
    const payload = asRecord(await readJsonBody(req))
    const rawPath = typeof payload?.path === 'string' ? payload.path.trim() : ''
    if (!rawPath) {
      setJson(res, 400, { error: 'Missing path' })
      return true
    }

    const normalizedPath = isAbsolute(rawPath) ? rawPath : resolve(rawPath)
    try {
      const info = await stat(normalizedPath)
      if (!info.isDirectory()) {
        setJson(res, 400, { error: 'Path exists but is not a directory' })
        return true
      }
    } catch {
      await mkdir(normalizedPath, { recursive: true })
    }

    setJson(res, 200, { data: { path: normalizedPath } })
    return true
  }

  if (req.method === 'POST' && url.pathname === '/codex-api/github-clone') {
    const payload = asRecord(await readJsonBody(req))
    const repoUrl = typeof payload?.url === 'string' ? payload.url.trim() : ''
    const basePath = typeof payload?.basePath === 'string' ? payload.basePath.trim() : ''
    try {
      const clonedPath = await cloneGithubRepositoryIntoBase(repoUrl, basePath, persistWorkspaceRoot)
      setJson(res, 200, { data: { path: clonedPath } })
    } catch (error) {
      setJson(res, 400, { error: error instanceof Error ? error.message : 'Failed to clone GitHub repository' })
    }
    return true
  }

  if (req.method === 'POST' && url.pathname === '/codex-api/projectless-thread-cwd') {
    const payload = asRecord(await readJsonBody(req))
    const prompt = typeof payload?.prompt === 'string' ? payload.prompt : null
    try {
      const directory = await createProjectlessThreadDirectory(prompt)
      setJson(res, 200, { data: directory })
    } catch (error) {
      setJson(res, 500, { error: error instanceof Error ? error.message : 'Failed to create new chat folder' })
    }
    return true
  }

  if (req.method === 'GET' && url.pathname === '/codex-api/project-root-suggestion') {
    const basePath = url.searchParams.get('basePath')?.trim() ?? ''
    if (!basePath) {
      setJson(res, 400, { error: 'Missing basePath' })
      return true
    }
    const normalizedBasePath = isAbsolute(basePath) ? basePath : resolve(basePath)
    try {
      const baseInfo = await stat(normalizedBasePath)
      if (!baseInfo.isDirectory()) {
        setJson(res, 400, { error: 'basePath is not a directory' })
        return true
      }
    } catch {
      setJson(res, 404, { error: 'basePath does not exist' })
      return true
    }

    let index = 1
    while (index < 100000) {
      const candidateName = `New Project (${String(index)})`
      const candidatePath = join(normalizedBasePath, candidateName)
      try {
        await stat(candidatePath)
        index += 1
        continue
      } catch {
        setJson(res, 200, { data: { name: candidateName, path: candidatePath } })
        return true
      }
    }

    setJson(res, 500, { error: 'Failed to compute project name suggestion' })
    return true
  }

  if (req.method === 'POST' && url.pathname === '/codex-api/composer-file-search') {
    const payload = asRecord(await readJsonBody(req))
    const rawCwd = typeof payload?.cwd === 'string' ? payload.cwd.trim() : ''
    const query = typeof payload?.query === 'string' ? payload.query.trim() : ''
    const limitRaw = typeof payload?.limit === 'number' ? payload.limit : 20
    const limit = Math.max(1, Math.min(100, Math.floor(limitRaw)))
    if (!rawCwd) {
      setJson(res, 400, { error: 'Missing cwd' })
      return true
    }
    const cwd = isAbsolute(rawCwd) ? rawCwd : resolve(rawCwd)
    try {
      const info = await stat(cwd)
      if (!info.isDirectory()) {
        setJson(res, 400, { error: 'cwd is not a directory' })
        return true
      }
    } catch {
      setJson(res, 404, { error: 'cwd does not exist' })
      return true
    }

    try {
      let files: string[]
      try {
        files = await listFilesWithRipgrep(cwd)
      } catch {
        // rg 不可用（精简安装未带 ripgrep）时退回纯 Node 目录遍历，
        // 保证 @ 文件提及不因缺少 rg 而整体失效。路径转成相对路径，
        // 与 rg 输出的路径格式保持一致。
        const rows = await listWorkspaceFiles(cwd, { maxEntries: 4000 })
        files = rows.filter((row) => !row.isDirectory).map((row) => row.relativePath)
      }
      const scored = files
        .map((path) => ({ path, score: scoreFileCandidate(path, query) }))
        .filter((row) => query.length === 0 || row.score < 10)
        .sort((a, b) => (a.score - b.score) || a.path.localeCompare(b.path))
        .slice(0, limit)
        .map((row) => ({ path: row.path }))
      setJson(res, 200, { data: scored })
    } catch (error) {
      setJson(res, 500, { error: getErrorMessage(error, 'Failed to search files') })
    }
    return true
  }

  if (req.method === 'GET' && url.pathname === '/codex-api/prompts') {
    setJson(res, 200, { data: await listComposerPrompts() })
    return true
  }

  if (req.method === 'POST' && url.pathname === '/codex-api/prompts') {
    const payload = asRecord(await readJsonBody(req))
    const name = typeof payload?.name === 'string' ? payload.name.trim() : ''
    const content = typeof payload?.content === 'string' ? payload.content : ''
    if (!name || !content.trim()) {
      setJson(res, 400, { error: 'Prompt name and content are required' })
      return true
    }
    try {
      const prompt = await createComposerPromptFile(name, content)
      setJson(res, 200, { data: prompt })
    } catch (error) {
      setJson(res, 500, { error: getErrorMessage(error, 'Failed to create prompt') })
    }
    return true
  }

  if (req.method === 'DELETE' && url.pathname === '/codex-api/prompts') {
    const promptPath = url.searchParams.get('path')?.trim() ?? ''
    if (!promptPath) {
      setJson(res, 400, { error: 'Missing path' })
      return true
    }
    try {
      const removed = await removeComposerPromptFile(promptPath)
      setJson(res, 200, { data: { removed } })
    } catch (error) {
      setJson(res, 400, { error: getErrorMessage(error, 'Failed to remove prompt') })
    }
    return true
  }

  return false
}
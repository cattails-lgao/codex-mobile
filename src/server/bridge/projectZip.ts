// Project chat ZIP orchestration (AF batch), extracted from createCodexBridgeMiddleware.
// Two pure workflow functions over stored session/thread state: exporting the
// current project's chats into a .codex-project virtual file tree for ZIP, and
// importing a stored project ZIP back into codex-home sessions/imported plus the
// project Workspace root. Every dependency is module-level (core / importedSessions /
// threadPreferencesRoutes / workspaceRoots / zip + node:fs-path), so there are zero
// shell-instance closures; the shell imports them and injects them into ProjectRoutesDeps.
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, realpath, utimes, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { getCodexHomeDir, isSameOrDescendantPath, readNonEmptyString, asRecord } from './core.js'
import {
  readImportedSessionRecord,
  readSessionMetaCwd,
  readSessionMetaId,
  readStateDbThreadExportMetadata,
  registerImportedSessionsInStateDb,
  rewriteImportedSession,
  walkFiles,
  type ExportedThreadMetadata,
  type ImportedSessionRecord,
} from './importedSessions.js'
import {
  readMergedThreadTitleCache,
  readThreadTitleCache,
  updateThreadTitleCache,
  writeThreadTitleCache,
} from './threadPreferencesRoutes.js'
import { persistWorkspaceRoot } from './workspaceRoots.js'
import { parseStoredProjectZip, type ProjectZipVirtualEntry } from './zip.js'

export async function collectProjectChatZipEntries(projectRoot: string): Promise<ProjectZipVirtualEntry[]> {
  const canonicalProjectRoot = await realpath(projectRoot)
  const codexHome = getCodexHomeDir()
  const threadTitles = await readMergedThreadTitleCache()
  const stateDbThreadMetadata = readStateDbThreadExportMetadata()
  const exportedTitles: Record<string, string> = {}
  const exportedThreads: Record<string, ExportedThreadMetadata> = {}
  const roots = [
    { disk: join(codexHome, 'sessions'), zip: '.codex-project/chats/sessions' },
    { disk: join(codexHome, 'archived_sessions'), zip: '.codex-project/chats/archived_sessions' },
  ]
  const entries: ProjectZipVirtualEntry[] = [{
    path: '.codex-project/manifest.json',
    data: Buffer.from(JSON.stringify({
      version: 1,
      exportedAt: new Date().toISOString(),
      projectName: basename(canonicalProjectRoot) || 'project',
    }, null, 2)),
    mtime: new Date(),
  }]

  for (const root of roots) {
    for await (const sessionPath of walkFiles(root.disk)) {
      if (extname(sessionPath) !== '.jsonl') continue
      let raw = ''
      try {
        raw = await readFile(sessionPath, 'utf8')
      } catch {
        continue
      }
      const sessionCwd = readSessionMetaCwd(raw)
      if (!sessionCwd) continue
      let canonicalSessionCwd = ''
      try {
        canonicalSessionCwd = await realpath(sessionCwd)
      } catch {
        canonicalSessionCwd = isAbsolute(sessionCwd) ? resolve(sessionCwd) : resolve(sessionCwd)
      }
      if (!isSameOrDescendantPath(canonicalSessionCwd, canonicalProjectRoot)) continue
      const rel = relative(root.disk, sessionPath).split(sep).join('/')
      const zipPath = `${root.zip}/${rel}`
      const sessionId = readSessionMetaId(raw)
      const stateMetadata = sessionId ? stateDbThreadMetadata.get(sessionId) : undefined
      const title = readNonEmptyString(stateMetadata?.title) || (sessionId ? readNonEmptyString(threadTitles.titles[sessionId]) : '')
      if (title) exportedTitles[zipPath] = title
      if (title || (stateMetadata?.updatedAtMs ?? 0) > 0) {
        exportedThreads[zipPath] = {
          title,
          updatedAtMs: stateMetadata?.updatedAtMs ?? 0,
        }
      }
      entries.push({
        path: zipPath,
        filePath: sessionPath,
        mtime: new Date(),
      })
    }
  }
  if (Object.keys(exportedTitles).length > 0 || Object.keys(exportedThreads).length > 0) {
    entries.push({
      path: '.codex-project/chats/thread-titles.json',
      data: Buffer.from(JSON.stringify({ version: 2, titles: exportedTitles, threads: exportedThreads }, null, 2)),
      mtime: new Date(),
    })
  }
  return entries
}

export async function importProjectZip(buffer: Buffer, destinationParent: string): Promise<{ projectPath: string; importedSessions: number }> {
  const entries = parseStoredProjectZip(buffer)
  const manifestEntry = entries.find((entry) => entry.path === '.codex-project/manifest.json' && !entry.isDirectory)
  let projectName = 'imported-project'
  if (manifestEntry) {
    try {
      const manifest = asRecord(JSON.parse(manifestEntry.data.toString('utf8')) as unknown)
      projectName = readNonEmptyString(manifest?.projectName) || projectName
    } catch {
      projectName = 'imported-project'
    }
  }
  projectName = projectName.replace(/[\\/]+/g, '-').replace(/[\u0000-\u001f]+/g, '').trim() || 'imported-project'
  const titleEntry = entries.find((entry) => entry.path === '.codex-project/chats/thread-titles.json' && !entry.isDirectory)
  const importedThreadMetadata = new Map<string, ExportedThreadMetadata>()
  if (titleEntry) {
    try {
      const payload = asRecord(JSON.parse(titleEntry.data.toString('utf8')) as unknown)
      const titles = asRecord(payload?.titles)
      if (titles) {
        for (const [key, value] of Object.entries(titles)) {
          const title = readNonEmptyString(value)
          if (key && title) importedThreadMetadata.set(key, { title, updatedAtMs: 0 })
        }
      }
      const threads = asRecord(payload?.threads)
      if (threads) {
        for (const [key, value] of Object.entries(threads)) {
          const record = asRecord(value)
          const title = readNonEmptyString(record?.title) || importedThreadMetadata.get(key)?.title || ''
          const updatedAtMs = typeof record?.updatedAtMs === 'number' && Number.isFinite(record.updatedAtMs)
            ? Math.trunc(record.updatedAtMs)
            : 0
          if (key && (title || updatedAtMs > 0)) importedThreadMetadata.set(key, { title, updatedAtMs })
        }
      }
    } catch {
      // Ignore malformed optional title metadata; imported chats still fall back to first user messages.
    }
  }

  const parent = await realpath(destinationParent)
  let projectPath = join(parent, projectName)
  for (let index = 2; existsSync(projectPath); index += 1) {
    projectPath = join(parent, `${projectName}-${index}`)
  }
  await mkdir(projectPath, { recursive: true })

  let importedSessions = 0
  const importedSessionRecords: ImportedSessionRecord[] = []
  const importedSessionsRoot = join(getCodexHomeDir(), 'sessions')
  const chatEntries = entries
    .filter((entry) => entry.path.startsWith('.codex-project/chats/') && !entry.isDirectory && extname(entry.path) === '.jsonl')
    .map((entry) => {
      const importedMetadata = importedThreadMetadata.get(entry.path)
      const sourceSessionRaw = entry.data.toString('utf8')
      const sourceRecord = readImportedSessionRecord(sourceSessionRaw, entry.path, projectPath, readSessionMetaId(sourceSessionRaw) || randomUUID(), importedMetadata?.title ?? '')
      const updatedAtMs = (importedMetadata?.updatedAtMs ?? 0) > 0 ? importedMetadata?.updatedAtMs ?? 0 : sourceRecord.updatedAtMs
      return { entry, importedMetadata, sourceSessionRaw, sourceRecord, updatedAtMs }
    })
    .sort((first, second) => second.updatedAtMs - first.updatedAtMs)

  for (const [index, chatEntry] of chatEntries.entries()) {
    const importedThreadId = randomUUID()
    const target = join(importedSessionsRoot, 'imported', `${String(index + 1).padStart(6, '0')}-${importedThreadId}.jsonl`)
    await mkdir(dirname(target), { recursive: true })
    const importedSessionRaw = rewriteImportedSession(chatEntry.sourceSessionRaw, projectPath, importedThreadId)
    await writeFile(target, importedSessionRaw, 'utf8')
    const importedRecord = readImportedSessionRecord(importedSessionRaw, target, projectPath, importedThreadId, chatEntry.importedMetadata?.title ?? '')
    if (chatEntry.updatedAtMs > 0) {
      importedRecord.updatedAtMs = chatEntry.updatedAtMs
      importedRecord.createdAtMs = Math.min(chatEntry.sourceRecord.createdAtMs, importedRecord.updatedAtMs)
      const updatedAtDate = new Date(chatEntry.updatedAtMs)
      await utimes(target, updatedAtDate, updatedAtDate).catch(() => {})
    }
    importedSessionRecords.push(importedRecord)
    if (importedRecord.title) {
      const cache = await readThreadTitleCache()
      await writeThreadTitleCache(updateThreadTitleCache(cache, importedThreadId, importedRecord.title))
    }
    importedSessions += 1
  }
  registerImportedSessionsInStateDb(importedSessionRecords)

  for (const entry of entries) {
    if (entry.path.startsWith('.codex-project/chats/')) {
      continue
    }
    const target = join(projectPath, entry.path)
    if (!isSameOrDescendantPath(target, projectPath)) throw new Error('Project ZIP contains an unsafe path')
    if (entry.isDirectory) {
      await mkdir(target, { recursive: true })
    } else {
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, entry.data)
    }
  }

  await persistWorkspaceRoot(projectPath, projectName)
  return { projectPath, importedSessions }
}
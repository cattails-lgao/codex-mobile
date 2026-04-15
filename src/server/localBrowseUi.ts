import { basename, dirname, extname, join } from 'node:path'
import { open, readFile, readdir, stat } from 'node:fs/promises'

type DirectoryItem = {
  name: string
  path: string
  isDirectory: boolean
  editable: boolean
  mtimeMs: number
}

export type LocalDirectoryListingEntry = {
  name: string
  path: string
}

export type LocalDirectoryListing = {
  path: string
  parentPath: string
  entries: LocalDirectoryListingEntry[]
}

type LocalDirectoryListingOptions = {
  showHidden?: boolean
}

type LocalFileLanguageConfig = {
  label: string
  aceMode: string
}

type LocalTextFileMetadata = {
  language: LocalFileLanguageConfig
  sizeBytes: number
}

type LocalBrowseLocationOptions = {
  newProjectName?: string
  line?: number | null
  column?: number | null
}

const TEXT_LANGUAGE: LocalFileLanguageConfig = {
  label: 'text',
  aceMode: 'text',
}

const BAZEL_LANGUAGE: LocalFileLanguageConfig = {
  label: 'bazel',
  aceMode: 'python',
}

const FILE_LANGUAGE_RULES_BY_NAME = new Map<string, LocalFileLanguageConfig>([
  ['build', BAZEL_LANGUAGE],
  ['build.bazel', BAZEL_LANGUAGE],
  ['workspace', BAZEL_LANGUAGE],
  ['workspace.bazel', BAZEL_LANGUAGE],
  ['module.bazel', BAZEL_LANGUAGE],
  ['.bazelrc', BAZEL_LANGUAGE],
  ['.env', TEXT_LANGUAGE],
  ['.gitignore', TEXT_LANGUAGE],
  ['.npmrc', TEXT_LANGUAGE],
])

const FILE_LANGUAGE_RULES_BY_EXTENSION = new Map<string, LocalFileLanguageConfig>([
  ['.txt', TEXT_LANGUAGE],
  ['.log', TEXT_LANGUAGE],
  ['.csv', TEXT_LANGUAGE],
  ['.md', { label: 'markdown', aceMode: 'markdown' }],
  ['.markdown', { label: 'markdown', aceMode: 'markdown' }],
  ['.json', { label: 'json', aceMode: 'json' }],
  ['.jsonc', { label: 'json', aceMode: 'json' }],
  ['.yaml', { label: 'yaml', aceMode: 'yaml' }],
  ['.yml', { label: 'yaml', aceMode: 'yaml' }],
  ['.lua', { label: 'lua', aceMode: 'lua' }],
  ['.rs', { label: 'rust', aceMode: 'rust' }],
  ['.py', { label: 'python', aceMode: 'python' }],
  ['.c', { label: 'c', aceMode: 'c_cpp' }],
  ['.h', { label: 'c/c++', aceMode: 'c_cpp' }],
  ['.cpp', { label: 'c++', aceMode: 'c_cpp' }],
  ['.cc', { label: 'c++', aceMode: 'c_cpp' }],
  ['.cxx', { label: 'c++', aceMode: 'c_cpp' }],
  ['.hpp', { label: 'c++', aceMode: 'c_cpp' }],
  ['.hh', { label: 'c++', aceMode: 'c_cpp' }],
  ['.hxx', { label: 'c++', aceMode: 'c_cpp' }],
  ['.toml', { label: 'toml', aceMode: 'toml' }],
  ['.bzl', BAZEL_LANGUAGE],
  ['.bazel', BAZEL_LANGUAGE],
  ['.js', { label: 'javascript', aceMode: 'javascript' }],
  ['.mjs', { label: 'javascript', aceMode: 'javascript' }],
  ['.cjs', { label: 'javascript', aceMode: 'javascript' }],
  ['.jsx', { label: 'jsx', aceMode: 'jsx' }],
  ['.ts', { label: 'typescript', aceMode: 'typescript' }],
  ['.mts', { label: 'typescript', aceMode: 'typescript' }],
  ['.cts', { label: 'typescript', aceMode: 'typescript' }],
  ['.tsx', { label: 'tsx', aceMode: 'tsx' }],
  ['.vue', { label: 'vue', aceMode: 'vue' }],
  ['.css', { label: 'css', aceMode: 'css' }],
  ['.scss', { label: 'scss', aceMode: 'scss' }],
  ['.html', { label: 'html', aceMode: 'html' }],
  ['.htm', { label: 'html', aceMode: 'html' }],
  ['.xml', { label: 'xml', aceMode: 'xml' }],
  ['.sql', { label: 'sql', aceMode: 'sql' }],
  ['.sh', { label: 'shell', aceMode: 'sh' }],
  ['.bash', { label: 'shell', aceMode: 'sh' }],
  ['.zsh', { label: 'shell', aceMode: 'sh' }],
  ['.ini', { label: 'ini', aceMode: 'ini' }],
  ['.conf', { label: 'ini', aceMode: 'ini' }],
  ['.ps1', { label: 'powershell', aceMode: 'powershell' }],
  ['.bat', TEXT_LANGUAGE],
  ['.cmd', TEXT_LANGUAGE],
])

const MAX_INLINE_PREVIEW_BYTES = 1024 * 1024

function getLanguageConfigForPath(pathValue: string): { language: LocalFileLanguageConfig; recognized: boolean } {
  const fileName = basename(pathValue).toLowerCase()
  if (fileName === '.env' || fileName.startsWith('.env.')) {
    return { language: TEXT_LANGUAGE, recognized: true }
  }

  const exactMatch = FILE_LANGUAGE_RULES_BY_NAME.get(fileName)
  if (exactMatch) {
    return { language: exactMatch, recognized: true }
  }

  const extensionMatch = FILE_LANGUAGE_RULES_BY_EXTENSION.get(extname(fileName))
  if (extensionMatch) {
    return { language: extensionMatch, recognized: true }
  }

  return { language: TEXT_LANGUAGE, recognized: false }
}

export function normalizeLocalPath(rawPath: string): string {
  const trimmed = rawPath.trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('file://')) {
    try {
      return decodeURIComponent(trimmed.replace(/^file:\/\//u, ''))
    } catch {
      return trimmed.replace(/^file:\/\//u, '')
    }
  }
  return trimmed
}

export function decodeBrowsePath(rawPath: string): string {
  if (!rawPath) return ''
  try {
    return decodeURIComponent(rawPath)
  } catch {
    return rawPath
  }
}

export function isTextEditablePath(pathValue: string): boolean {
  return getLanguageConfigForPath(pathValue).recognized
}

function isHiddenName(value: string): boolean {
  return value.startsWith('.')
}

function looksLikeTextBuffer(buffer: Buffer): boolean {
  if (buffer.length === 0) return true
  for (const byte of buffer) {
    if (byte === 0) return false
  }
  const decoded = buffer.toString('utf8')
  const replacementCount = (decoded.match(/\uFFFD/gu) ?? []).length
  return replacementCount / decoded.length < 0.05
}

async function probeFileIsText(localPath: string): Promise<boolean> {
  const handle = await open(localPath, 'r')
  try {
    const sample = Buffer.allocUnsafe(4096)
    const { bytesRead } = await handle.read(sample, 0, sample.length, 0)
    return looksLikeTextBuffer(sample.subarray(0, bytesRead))
  } finally {
    await handle.close()
  }
}

export async function isTextEditableFile(localPath: string): Promise<boolean> {
  if (isTextEditablePath(localPath)) return true
  try {
    const fileStat = await stat(localPath)
    if (!fileStat.isFile()) return false
    return await probeFileIsText(localPath)
  } catch {
    return false
  }
}

export async function getLocalTextFileMetadata(localPath: string): Promise<LocalTextFileMetadata | null> {
  const { language, recognized } = getLanguageConfigForPath(localPath)
  try {
    const fileStat = await stat(localPath)
    if (!fileStat.isFile()) return null
    if (recognized) {
      return {
        language,
        sizeBytes: fileStat.size,
      }
    }

    const isText = await probeFileIsText(localPath)
    if (!isText) return null
    return {
      language,
      sizeBytes: fileStat.size,
    }
  } catch {
    return null
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;')
}

function normalizeNewProjectName(value: string): string {
  return value.trim().replace(/[\\/]+/gu, '').trim()
}

function normalizeLineTarget(value: number | null | undefined): number | null {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : null
}

function buildLocationQuery(options?: LocalBrowseLocationOptions): string {
  const query = new URLSearchParams()
  const normalizedName = normalizeNewProjectName(options?.newProjectName ?? '')
  const line = normalizeLineTarget(options?.line)
  const column = line ? normalizeLineTarget(options?.column) : null

  if (normalizedName) query.set('newProjectName', normalizedName)
  if (line) query.set('line', String(line))
  if (column) query.set('column', String(column))

  const encoded = query.toString()
  return encoded ? `?${encoded}` : ''
}

function toBrowseHref(pathValue: string, options?: LocalBrowseLocationOptions): string {
  return `/codex-local-browse${encodeURI(pathValue)}${buildLocationQuery(options)}`
}

function toEditHref(pathValue: string, options?: LocalBrowseLocationOptions): string {
  return `/codex-local-edit${encodeURI(pathValue)}${buildLocationQuery(options)}`
}

function toRawFileHref(pathValue: string, options?: { download?: boolean }): string {
  const query = new URLSearchParams({ path: pathValue })
  if (options?.download === true) {
    query.set('download', '1')
  }
  return `/codex-local-file?${query.toString()}`
}

function escapeForInlineScriptString(value: string): string {
  // Prevent breaking out of inline <script> blocks when file content contains HTML/script tokens.
  return JSON.stringify(value)
    .replace(/<\//gu, '<\\/')
    .replace(/<!--/gu, '<\\!--')
    .replace(/\u2028/gu, '\\u2028')
    .replace(/\u2029/gu, '\\u2029')
}

async function getDirectoryItems(localPath: string): Promise<DirectoryItem[]> {
  const entries = await readdir(localPath, { withFileTypes: true })
  const withMeta = await Promise.all(entries.map(async (entry) => {
    const entryPath = join(localPath, entry.name)
    const entryStat = await stat(entryPath)
    const editable = !entry.isDirectory() && await isTextEditableFile(entryPath)
    return {
      name: entry.name,
      path: entryPath,
      isDirectory: entry.isDirectory(),
      editable,
      mtimeMs: entryStat.mtimeMs,
    }
  }))
  return withMeta.sort((a, b) => {
    if (b.mtimeMs !== a.mtimeMs) return b.mtimeMs - a.mtimeMs
    if (a.isDirectory && !b.isDirectory) return -1
    if (!a.isDirectory && b.isDirectory) return 1
    return a.name.localeCompare(b.name)
  })
}

function projectCreationTargetPath(parentPath: string, newProjectName: string): string {
  const normalizedName = normalizeNewProjectName(newProjectName)
  if (!normalizedName) return ''
  return join(parentPath, normalizedName)
}

function projectCreationButtonLabel(newProjectName: string): string {
  const normalizedName = normalizeNewProjectName(newProjectName)
  return normalizedName ? `Create ${normalizedName} here` : ''
}

function projectCreationStatusText(newProjectName: string): string {
  const normalizedName = normalizeNewProjectName(newProjectName)
  return normalizedName ? `Creating ${normalizedName} in Codex...` : 'Creating project in Codex...'
}

function openFolderStatusText(newProjectName: string): string {
  const normalizedName = normalizeNewProjectName(newProjectName)
  return normalizedName
    ? `Opening folder in Codex without creating ${normalizedName}...`
    : 'Opening folder in Codex...'
}

function failureStatusText(newProjectName: string): string {
  const normalizedName = normalizeNewProjectName(newProjectName)
  return normalizedName
    ? `Failed to open folder or create ${normalizedName}.`
    : 'Failed to open folder.'
}

function actionButtonsHtml(localPath: string, newProjectName: string): string {
  const normalizedName = normalizeNewProjectName(newProjectName)
  const createTargetPath = projectCreationTargetPath(localPath, normalizedName)
  const createButton = createTargetPath
    ? `<button class="header-open-btn create-project-btn" type="button" aria-label="${escapeHtml(projectCreationButtonLabel(normalizedName))}" title="${escapeHtml(projectCreationButtonLabel(normalizedName))}" data-path="${escapeHtml(createTargetPath)}" data-label="${escapeHtml(normalizedName)}" data-status="${escapeHtml(projectCreationStatusText(normalizedName))}" data-error="${escapeHtml(failureStatusText(normalizedName))}">${escapeHtml(projectCreationButtonLabel(normalizedName))}</button>`
    : ''
  const openButton = `<button class="header-open-btn open-folder-btn" type="button" aria-label="Open current folder in Codex" title="Open folder in Codex" data-path="${escapeHtml(localPath)}" data-label="" data-status="${escapeHtml(openFolderStatusText(normalizedName))}" data-error="${escapeHtml(failureStatusText(normalizedName))}">Open folder in Codex</button>`
  return `${createButton}${openButton}`
}

function renderTextPreviewToolbar(
  localPath: string,
  options?: LocalBrowseLocationOptions,
): string {
  const newProjectName = normalizeNewProjectName(options?.newProjectName ?? '')
  const line = normalizeLineTarget(options?.line)
  const column = line ? normalizeLineTarget(options?.column) : null
  const backHref = toBrowseHref(dirname(localPath), { newProjectName })
  const rawHref = toRawFileHref(localPath)
  const downloadHref = toRawFileHref(localPath, { download: true })
  const lineLocation = line ? { newProjectName, line, column } : { newProjectName }

  return [
    `<a href="${escapeHtml(backHref)}">Back</a>`,
    `<a href="${escapeHtml(rawHref)}" target="_blank" rel="noopener noreferrer">Raw</a>`,
    `<a href="${escapeHtml(downloadHref)}">Download</a>`,
    `<a href="${escapeHtml(toEditHref(localPath, lineLocation))}">Edit</a>`,
  ].filter(Boolean).join('')
}

function formatLineTargetLabel(line: number | null, column: number | null): string {
  if (!line) return ''
  if (column) return `line ${String(line)}:${String(column)}`
  return `line ${String(line)}`
}

function renderPlainPreviewContent(content: string, targetLine: number | null): string {
  if (!targetLine || targetLine < 1) return escapeHtml(content)

  const trailingNewline = content.endsWith('\n')
  const lines = content.split('\n')
  if (trailingNewline) lines.pop()
  if (targetLine > lines.length) return escapeHtml(content)

  return lines
    .map((line, index) => {
      const escapedLine = escapeHtml(line || ' ')
      if (index + 1 === targetLine) {
        return `<span id="previewTargetLine" class="preview-target-line">${escapedLine}</span>`
      }
      return escapedLine
    })
    .join('\n') + (trailingNewline ? '\n' : '')
}

function formatPreviewSize(sizeBytes: number): string {
  if (sizeBytes >= 1024 * 1024) return `${(sizeBytes / (1024 * 1024)).toFixed(1).replace(/\.0$/u, '')} MiB`
  if (sizeBytes >= 1024) return `${Math.round(sizeBytes / 1024)} KiB`
  return `${sizeBytes} B`
}

function renderAceLineTargetScript(): string {
  return [
    'function selectTargetLine(editorInstance, lineNumber, columnNumber) {',
    '  if (!lineNumber) return;',
    '  const zeroBasedRow = lineNumber - 1;',
    '  const zeroBasedColumn = Math.max(0, (columnNumber ?? 1) - 1);',
    '  editorInstance.gotoLine(lineNumber, zeroBasedColumn, true);',
    '  editorInstance.scrollToLine(lineNumber, true, true, function() {});',
    '  editorInstance.selection.moveCursorToPosition({ row: zeroBasedRow, column: zeroBasedColumn });',
    '  editorInstance.selection.selectLine();',
    '}',
  ].join('\n')
}

export async function getLocalDirectoryListing(
  localPath: string,
  options: LocalDirectoryListingOptions = {},
): Promise<LocalDirectoryListing> {
  const entries = await readdir(localPath, { withFileTypes: true })
  const directories = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      name: entry.name,
      path: join(localPath, entry.name),
    }))
    .filter((entry) => options.showHidden === true || !isHiddenName(entry.name))
    .sort((a, b) => {
      const aHidden = isHiddenName(a.name)
      const bHidden = isHiddenName(b.name)
      if (aHidden !== bHidden) return aHidden ? -1 : 1
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
    })

  return {
    path: localPath,
    parentPath: dirname(localPath),
    entries: directories,
  }
}

export async function createDirectoryListingHtml(localPath: string, options?: { newProjectName?: string }): Promise<string> {
  const newProjectName = normalizeNewProjectName(options?.newProjectName ?? '')
  const items = await getDirectoryItems(localPath)
  const parentPath = dirname(localPath)
  const rows = items
    .map((item) => {
      const suffix = item.isDirectory ? '/' : ''
      const editAction = item.editable
        ? ` <a class="icon-btn" aria-label="Edit ${escapeHtml(item.name)}" href="${escapeHtml(toEditHref(item.path, { newProjectName }))}" title="Edit">✏️</a>`
        : ''
      return `<li class="file-row"><a class="file-link" href="${escapeHtml(toBrowseHref(item.path, { newProjectName }))}">${escapeHtml(item.name)}${suffix}</a><span class="row-actions">${editAction}</span></li>`
    })
    .join('\n')

  const parentLink = localPath !== parentPath
    ? `<a class="header-parent-link" href="${escapeHtml(toBrowseHref(parentPath, { newProjectName }))}">..</a>`
    : ''
  const pickerSummary = newProjectName
    ? `<p class="picker-summary">Browse to the parent folder where you want to create <strong>${escapeHtml(newProjectName)}</strong>, or open the current folder directly.</p>`
    : ''
  const actionButtons = actionButtonsHtml(localPath, newProjectName)

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Index of ${escapeHtml(localPath)}</title>
  <style>
    body { font-family: ui-monospace, Menlo, Monaco, monospace; margin: 16px; background: #0b1020; color: #dbe6ff; }
    a { color: #8cc2ff; text-decoration: none; }
    a:hover { text-decoration: underline; }
    ul { list-style: none; padding: 0; margin: 12px 0 0; display: flex; flex-direction: column; gap: 8px; }
    .file-row { display: grid; grid-template-columns: minmax(0,1fr) auto; align-items: center; gap: 10px; }
    .file-link { display: block; padding: 10px 12px; border: 1px solid #28405f; border-radius: 10px; background: #0f1b33; overflow-wrap: anywhere; }
    .header-actions { display: flex; align-items: center; gap: 10px; margin-top: 10px; flex-wrap: wrap; }
    .header-parent-link { color: #9ec8ff; font-size: 14px; padding: 8px 10px; border: 1px solid #2a4569; border-radius: 10px; background: #101f3a; }
    .header-parent-link:hover { text-decoration: none; filter: brightness(1.08); }
    .header-open-btn {
      height: 42px;
      padding: 0 14px;
      border: 1px solid #4f8de0;
      border-radius: 10px;
      background: linear-gradient(135deg, #2e6ee6 0%, #3d8cff 100%);
      color: #eef6ff;
      font-weight: 700;
      letter-spacing: 0.01em;
      cursor: pointer;
      box-shadow: 0 6px 18px rgba(33, 90, 199, 0.35);
    }
    .header-open-btn:hover { filter: brightness(1.08); }
    .header-open-btn:disabled { opacity: 0.6; cursor: default; }
    .picker-summary { margin: 10px 0 0; color: #b8d5ff; max-width: 60rem; line-height: 1.45; }
    .row-actions { display: inline-flex; align-items: center; gap: 8px; min-width: 42px; justify-content: flex-end; }
    .icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 42px; height: 42px; border: 1px solid #36557a; border-radius: 10px; background: #162643; color: #dbe6ff; text-decoration: none; cursor: pointer; }
    .icon-btn:hover { filter: brightness(1.08); text-decoration: none; }
    .status { margin: 10px 0 0; color: #8cc2ff; min-height: 1.25em; }
    h1 { font-size: 18px; margin: 0; word-break: break-all; }
    @media (max-width: 640px) {
      body { margin: 12px; }
      .file-row { gap: 8px; }
      .file-link { font-size: 15px; padding: 12px; }
      .icon-btn { width: 44px; height: 44px; }
    }
  </style>
</head>
<body>
  <h1>Index of ${escapeHtml(localPath)}</h1>
  ${pickerSummary}
  <div class="header-actions">
    ${parentLink}
    ${actionButtons}
  </div>
  <p id="status" class="status"></p>
  <ul>${rows}</ul>
  <script>
    const status = document.getElementById('status');
    document.addEventListener('click', async (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest('.open-folder-btn, .create-project-btn');
      if (!(button instanceof HTMLButtonElement)) return;

      const path = button.getAttribute('data-path') || '';
      const label = button.getAttribute('data-label') || '';
      const statusText = button.getAttribute('data-status') || 'Opening folder in Codex...';
      const errorText = button.getAttribute('data-error') || 'Failed to open folder.';
      if (!path) return;
      button.disabled = true;
      status.textContent = statusText;
      try {
        const response = await fetch('/codex-api/project-root', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            path,
            createIfMissing: button.classList.contains('create-project-btn'),
            label,
          }),
        });
        if (!response.ok) {
          status.textContent = errorText;
          button.disabled = false;
          return;
        }
        status.textContent = 'Folder opened. Returning to Codex...';
        const nextUrl = '/?openProjectPath=' + encodeURIComponent(path) + '#/';
        window.location.assign(nextUrl);
      } catch {
        status.textContent = errorText;
        button.disabled = false;
      }
    });
  </script>
</body>
</html>`
}

export async function createTextPreviewHtml(localPath: string, options?: LocalBrowseLocationOptions): Promise<string> {
  const newProjectName = normalizeNewProjectName(options?.newProjectName ?? '')
  const line = normalizeLineTarget(options?.line)
  const column = line ? normalizeLineTarget(options?.column) : null
  const metadata = await getLocalTextFileMetadata(localPath)
  if (!metadata) {
    throw new Error('Only text-like files can be previewed inline.')
  }

  const toolbar = renderTextPreviewToolbar(localPath, { newProjectName, line, column })
  const lineTargetLabel = formatLineTargetLabel(line, column)
  const previewMeta = [localPath, metadata.language.label, formatPreviewSize(metadata.sizeBytes), lineTargetLabel]
    .filter(Boolean)
    .join(' · ')
  const previewUnavailable = metadata.sizeBytes > MAX_INLINE_PREVIEW_BYTES
  const previewContent = previewUnavailable
    ? ''
    : await readFile(localPath, 'utf8')
  const previewPlainHtml = renderPlainPreviewContent(previewContent, line)
  const safePreviewLiteral = escapeForInlineScriptString(previewContent)

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(basename(localPath))}</title>
  <style>
    html, body { margin: 0; width: 100%; min-height: 100%; }
    body { min-height: 100vh; font-family: ui-monospace, Menlo, Monaco, monospace; background: #09111f; color: #dbe6ff; display: flex; flex-direction: column; }
    a { color: inherit; text-decoration: none; }
    .toolbar { position: sticky; top: 0; z-index: 10; display: flex; flex-direction: column; gap: 10px; padding: 12px 16px; background: rgba(9, 17, 31, 0.96); backdrop-filter: blur(8px); border-bottom: 1px solid #233958; }
    .toolbar-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .toolbar-row a { display: inline-flex; align-items: center; justify-content: center; min-height: 38px; padding: 0 12px; border: 1px solid #36557a; border-radius: 10px; background: #13233d; }
    .toolbar-row a:hover { filter: brightness(1.08); }
    .meta { color: #8fb8ec; font-size: 12px; overflow-wrap: anywhere; line-height: 1.5; }
    .preview-shell { flex: 1 1 auto; min-height: 0; display: flex; padding: 18px 16px 24px; }
    .preview-card { flex: 1 1 auto; min-height: 0; max-width: 100%; border: 1px solid #20324d; border-radius: 14px; background: #0d182b; overflow: hidden; box-shadow: 0 20px 40px rgba(0, 0, 0, 0.24); display: flex; flex-direction: column; }
    .preview-notice { margin: 0; padding: 12px 16px; border-bottom: 1px solid #20324d; color: #f0cf78; background: rgba(240, 207, 120, 0.08); }
    .preview-unavailable { padding: 26px 20px; }
    .preview-unavailable-title { margin: 0 0 8px; font-size: 15px; font-weight: 700; }
    .preview-unavailable-text { margin: 0; color: #aac5e6; line-height: 1.6; }
    .preview-plain {
      flex: 1 1 auto;
      box-sizing: border-box;
      margin: 0;
      padding: 18px 20px 24px;
      min-height: 0;
      overflow: auto;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      tab-size: 2;
      line-height: 1.55;
      color: #dbe6ff;
      background: #07101f;
    }
    .preview-target-line {
      display: inline-block;
      min-width: 100%;
      margin: 0 -20px;
      padding: 0 20px;
      background: rgba(140, 194, 255, 0.16);
      box-shadow: inset 3px 0 0 #8cc2ff;
    }
    #previewEditor { flex: 1 1 auto; width: 100%; min-height: 0; }
    .ace_editor { background: #07101f !important; color: #dbe6ff !important; width: 100% !important; height: 100% !important; }
    .ace_gutter { background: #07101f !important; color: #6f8eb5 !important; }
    .ace_marker-layer .ace_active-line { background: transparent !important; }
    .ace_marker-layer .ace_selection { background: rgba(140, 194, 255, 0.16) !important; }
    @media (max-width: 640px) {
      .toolbar { padding: 12px; }
      .preview-shell { padding: 12px; }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <div class="toolbar-row">${toolbar}</div>
    <div class="meta">${escapeHtml(previewMeta)}</div>
  </div>
  <main class="preview-shell">
    <section class="preview-card">
      ${previewUnavailable
        ? `<div class="preview-unavailable">
  <p class="preview-unavailable-title">Inline preview disabled</p>
  <p class="preview-unavailable-text">This file is larger than ${String(Math.floor(MAX_INLINE_PREVIEW_BYTES / 1024))} KiB. Use <strong>Raw</strong> or <strong>Download</strong> instead.</p>
</div>`
        : `<pre id="previewFallback" class="preview-plain">${previewPlainHtml}</pre>
<div id="previewEditor" hidden></div>`}
    </section>
  </main>
	  ${previewUnavailable ? '' : `<script src="https://cdnjs.cloudflare.com/ajax/libs/ace/1.36.2/ace.min.js"></script>
	  <script>
	    const targetLineNumber = ${line ?? 'null'};
	    const targetColumnNumber = ${column ?? 'null'};
	    const previewFallback = document.getElementById('previewFallback');
	    const previewTargetLine = document.getElementById('previewTargetLine');
	    const previewEditor = document.getElementById('previewEditor');
	    ${renderAceLineTargetScript()}
	    if (previewTargetLine) {
	      previewTargetLine.scrollIntoView({ block: 'center' });
	    }
	    if (window.ace && previewEditor) {
      previewEditor.hidden = false;
      if (previewFallback) previewFallback.hidden = true;
      ace.config.set('basePath', 'https://cdnjs.cloudflare.com/ajax/libs/ace/1.36.2/');
      const editor = ace.edit('previewEditor');
      editor.setTheme('ace/theme/tomorrow_night');
      editor.session.setMode('ace/mode/${escapeHtml(metadata.language.aceMode)}');
      editor.session.setUseWorker(false);
      editor.setValue(${safePreviewLiteral}, -1);
      editor.setOptions({
        readOnly: true,
        highlightActiveLine: !!targetLineNumber,
        highlightGutterLine: false,
        showPrintMargin: false,
        fontSize: '13px',
        wrap: true,
        behavioursEnabled: false,
        displayIndentGuides: true,
	      });
	      editor.renderer.setShowGutter(true);
	      editor.renderer.$cursorLayer.element.style.display = 'none';
	      if (targetLineNumber) {
	        selectTargetLine(editor, targetLineNumber, targetColumnNumber);
	      }
	      editor.resize();
	    }
	  </script>`}
</body>
</html>`
}

export async function createTextEditorHtml(localPath: string, options?: LocalBrowseLocationOptions): Promise<string> {
  const newProjectName = normalizeNewProjectName(options?.newProjectName ?? '')
  const line = normalizeLineTarget(options?.line)
  const column = line ? normalizeLineTarget(options?.column) : null
  const metadata = await getLocalTextFileMetadata(localPath)
  if (!metadata) {
    throw new Error('Only text-like files are editable.')
  }

  const content = await readFile(localPath, 'utf8')
  const parentPath = dirname(localPath)
  const safeContentLiteral = escapeForInlineScriptString(content)
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Edit ${escapeHtml(localPath)}</title>
  <style>
    html, body { width: 100%; height: 100%; margin: 0; }
    body { font-family: ui-monospace, Menlo, Monaco, monospace; background: #0b1020; color: #dbe6ff; display: flex; flex-direction: column; overflow: hidden; }
    .toolbar { position: sticky; top: 0; z-index: 10; display: flex; flex-direction: column; gap: 8px; padding: 10px 12px; background: #0b1020; border-bottom: 1px solid #243a5a; }
    .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    button, a { background: #1b2a4a; color: #dbe6ff; border: 1px solid #345; padding: 6px 10px; border-radius: 6px; text-decoration: none; cursor: pointer; }
    button:hover, a:hover { filter: brightness(1.08); }
    #editor { flex: 1 1 auto; min-height: 0; width: 100%; border: none; overflow: hidden; }
    #status { margin-left: 8px; color: #8cc2ff; }
    .ace_editor { background: #07101f !important; color: #dbe6ff !important; width: 100% !important; height: 100% !important; }
    .ace_gutter { background: #07101f !important; color: #6f8eb5 !important; }
    .ace_marker-layer .ace_active-line { background: #10213c !important; }
    .ace_marker-layer .ace_selection { background: rgba(140, 194, 255, 0.3) !important; }
    .meta { opacity: 0.9; font-size: 12px; overflow-wrap: anywhere; }
  </style>
</head>
<body>
  <div class="toolbar">
    <div class="row">
      <a href="${escapeHtml(toBrowseHref(parentPath, { newProjectName }))}">Back</a>
      <a href="${escapeHtml(toBrowseHref(localPath, { newProjectName, line, column }))}">Preview</a>
      <a href="${escapeHtml(toRawFileHref(localPath))}" target="_blank" rel="noopener noreferrer">Raw</a>
      <a href="${escapeHtml(toRawFileHref(localPath, { download: true }))}">Download</a>
      <button id="saveBtn" type="button">Save</button>
      <span id="status"></span>
    </div>
    <div class="meta">${escapeHtml([localPath, metadata.language.label, formatLineTargetLabel(line, column)].filter(Boolean).join(' · '))}</div>
  </div>
  <div id="editor"></div>
	  <script src="https://cdnjs.cloudflare.com/ajax/libs/ace/1.36.2/ace.min.js"></script>
	  <script>
	    const targetLineNumber = ${line ?? 'null'};
	    const targetColumnNumber = ${column ?? 'null'};
	    const saveBtn = document.getElementById('saveBtn');
	    const status = document.getElementById('status');
	    ${renderAceLineTargetScript()}
	    ace.config.set('basePath', 'https://cdnjs.cloudflare.com/ajax/libs/ace/1.36.2/');
	    const editor = ace.edit('editor');
    editor.setTheme('ace/theme/tomorrow_night');
    editor.session.setMode('ace/mode/${escapeHtml(metadata.language.aceMode)}');
    editor.session.setUseWorker(false);
    editor.setValue(${safeContentLiteral}, -1);
    editor.setOptions({
      fontSize: '13px',
      wrap: true,
      showPrintMargin: false,
      useSoftTabs: true,
      tabSize: 2,
	      behavioursEnabled: true,
	    });
	    if (targetLineNumber) {
	      selectTargetLine(editor, targetLineNumber, targetColumnNumber);
	    }
	    editor.resize();

    saveBtn.addEventListener('click', async () => {
      status.textContent = 'Saving...';
      const response = await fetch(location.pathname, {
        method: 'PUT',
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        body: editor.getValue(),
      });
      status.textContent = response.ok ? 'Saved' : 'Save failed';
    });
  </script>
</body>
</html>`
}

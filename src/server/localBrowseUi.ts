import { dirname, extname, join } from 'node:path'
import { readFile, readdir, stat } from 'node:fs/promises'

type DirectoryItem = {
  name: string
  path: string
  isDirectory: boolean
  editable: boolean
  mtimeMs: number
}

const TEXT_EDITABLE_EXTENSIONS = new Set([
  '.txt', '.md', '.json', '.js', '.ts', '.tsx', '.jsx', '.css', '.scss',
  '.html', '.htm', '.xml', '.yml', '.yaml', '.log', '.csv', '.env', '.py',
  '.sh', '.toml', '.ini', '.conf', '.sql',
])

function languageForPath(pathValue: string): string {
  const extension = extname(pathValue).toLowerCase()
  switch (extension) {
    case '.js': return 'javascript'
    case '.ts': return 'typescript'
    case '.jsx': return 'javascript'
    case '.tsx': return 'typescript'
    case '.py': return 'python'
    case '.sh': return 'bash'
    case '.css':
    case '.scss': return 'css'
    case '.html':
    case '.htm': return 'xml'
    case '.json': return 'json'
    case '.md': return 'markdown'
    case '.yaml':
    case '.yml': return 'yaml'
    case '.xml': return 'xml'
    case '.sql': return 'sql'
    case '.toml': return 'ini'
    case '.ini':
    case '.conf': return 'ini'
    default: return 'plaintext'
  }
}

function codeMirrorLanguageImport(pathValue: string): string {
  const extension = extname(pathValue).toLowerCase()
  switch (extension) {
    case '.js':
    case '.jsx':
      return "import { javascript } from 'https://esm.sh/@codemirror/lang-javascript'"
    case '.ts':
    case '.tsx':
      return "import { javascript } from 'https://esm.sh/@codemirror/lang-javascript'"
    case '.py':
      return "import { python } from 'https://esm.sh/@codemirror/lang-python'"
    case '.sh':
      return "import { shell } from 'https://esm.sh/@codemirror/legacy-modes/mode/shell'"
    case '.css':
    case '.scss':
      return "import { css } from 'https://esm.sh/@codemirror/lang-css'"
    case '.html':
    case '.htm':
      return "import { html } from 'https://esm.sh/@codemirror/lang-html'"
    case '.json':
      return "import { json } from 'https://esm.sh/@codemirror/lang-json'"
    case '.md':
      return "import { markdown } from 'https://esm.sh/@codemirror/lang-markdown'"
    case '.yaml':
    case '.yml':
      return "import { StreamLanguage } from 'https://esm.sh/@codemirror/language'\nimport { yaml } from 'https://esm.sh/@codemirror/legacy-modes/mode/yaml'"
    case '.xml':
      return "import { xml } from 'https://esm.sh/@codemirror/lang-xml'"
    case '.sql':
      return "import { sql } from 'https://esm.sh/@codemirror/lang-sql'"
    case '.toml':
    case '.ini':
    case '.conf':
      return "import { StreamLanguage } from 'https://esm.sh/@codemirror/language'\nimport { properties } from 'https://esm.sh/@codemirror/legacy-modes/mode/properties'"
    default:
      return ''
  }
}

function codeMirrorLanguageSetup(pathValue: string): string {
  const extension = extname(pathValue).toLowerCase()
  switch (extension) {
    case '.js':
    case '.jsx':
      return 'javascript()'
    case '.ts':
    case '.tsx':
      return 'javascript({ typescript: true })'
    case '.py':
      return 'python()'
    case '.sh':
      return 'StreamLanguage.define(shell)'
    case '.css':
    case '.scss':
      return 'css()'
    case '.html':
    case '.htm':
      return 'html()'
    case '.json':
      return 'json()'
    case '.md':
      return 'markdown()'
    case '.yaml':
    case '.yml':
      return 'StreamLanguage.define(yaml)'
    case '.xml':
      return 'xml()'
    case '.sql':
      return 'sql()'
    case '.toml':
    case '.ini':
    case '.conf':
      return 'StreamLanguage.define(properties)'
    default:
      return 'null'
  }
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
  return TEXT_EDITABLE_EXTENSIONS.has(extname(pathValue).toLowerCase())
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;')
}

function toBrowseHref(pathValue: string): string {
  return `/codex-local-browse${encodeURI(pathValue)}`
}

function toEditHref(pathValue: string): string {
  return `/codex-local-edit${encodeURI(pathValue)}`
}

async function getDirectoryItems(localPath: string): Promise<DirectoryItem[]> {
  const entries = await readdir(localPath, { withFileTypes: true })
  const withMeta = await Promise.all(entries.map(async (entry) => {
    const entryPath = join(localPath, entry.name)
    const entryStat = await stat(entryPath)
    return {
      name: entry.name,
      path: entryPath,
      isDirectory: entry.isDirectory(),
      editable: !entry.isDirectory() && isTextEditablePath(entryPath),
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

export async function createDirectoryListingHtml(localPath: string): Promise<string> {
  const items = await getDirectoryItems(localPath)
  const parentPath = dirname(localPath)
  const rows = items
    .map((item) => {
      const suffix = item.isDirectory ? '/' : ''
      const editAction = item.editable
        ? ` <a class="icon-btn" aria-label="Edit ${escapeHtml(item.name)}" href="${escapeHtml(toEditHref(item.path))}" title="Edit">✏️</a>`
        : ''
      return `<li class="file-row"><a class="file-link" href="${escapeHtml(toBrowseHref(item.path))}">${escapeHtml(item.name)}${suffix}</a>${editAction}</li>`
    })
    .join('\n')

  const parentLink = localPath !== parentPath
    ? `<p><a href="${escapeHtml(toBrowseHref(parentPath))}">..</a></p>`
    : ''

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
    .icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 42px; height: 42px; border: 1px solid #36557a; border-radius: 10px; background: #162643; text-decoration: none; }
    .icon-btn:hover { filter: brightness(1.08); text-decoration: none; }
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
  ${parentLink}
  <ul>${rows}</ul>
</body>
</html>`
}

export async function createTextEditorHtml(localPath: string): Promise<string> {
  const content = await readFile(localPath, 'utf8')
  const parentPath = dirname(localPath)
  const language = languageForPath(localPath)
  const languageImport = codeMirrorLanguageImport(localPath)
  const languageSetup = codeMirrorLanguageSetup(localPath)
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Edit ${escapeHtml(localPath)}</title>
  <style>
    body { font-family: ui-monospace, Menlo, Monaco, monospace; margin: 16px; background: #0b1020; color: #dbe6ff; }
    .row { display: flex; gap: 8px; align-items: center; margin-bottom: 10px; flex-wrap: wrap; }
    button, a { background: #1b2a4a; color: #dbe6ff; border: 1px solid #345; padding: 6px 10px; border-radius: 6px; text-decoration: none; cursor: pointer; }
    button:hover, a:hover { filter: brightness(1.08); }
    #editor { min-height: calc(100vh - 170px); border: 1px solid #345; border-radius: 8px; overflow: hidden; }
    #status { margin-left: 8px; color: #8cc2ff; }
    .cm-editor { height: calc(100vh - 170px); background: #07101f; color: #dbe6ff; }
    .cm-scroller { font-family: ui-monospace, Menlo, Monaco, monospace; font-size: 13px; line-height: 1.5; }
    .cm-gutters { background: #07101f; color: #6f8eb5; border-right: 1px solid #243a5a; }
    .cm-activeLineGutter { background: #10213c; }
    .cm-activeLine { background: #10213c; }
    .cm-content { caret-color: #dbe6ff; }
    .cm-cursor, .cm-dropCursor { border-left-color: #dbe6ff; }
    .cm-selectionBackground, .cm-content ::selection { background: rgba(140, 194, 255, 0.3) !important; }
    @media (max-width: 900px) {
      #editor { min-height: calc(65vh - 90px); }
      .cm-editor { height: calc(65vh - 90px); }
    }
  </style>
</head>
<body>
  <div class="row">
    <a href="${escapeHtml(toBrowseHref(parentPath))}">Back</a>
    <button id="saveBtn" type="button">Save</button>
    <span id="status"></span>
  </div>
  <div class="row">${escapeHtml(localPath)} · ${escapeHtml(language)}</div>
  <div id="editor"></div>
  <script type="module">
    import { EditorView, keymap, lineNumbers, highlightActiveLineGutter } from 'https://esm.sh/@codemirror/view';
    import { EditorState } from 'https://esm.sh/@codemirror/state';
    import { defaultKeymap, indentWithTab } from 'https://esm.sh/@codemirror/commands';
    import { bracketMatching, indentOnInput, syntaxHighlighting, defaultHighlightStyle } from 'https://esm.sh/@codemirror/language';
    ${languageImport}

    const saveBtn = document.getElementById('saveBtn');
    const status = document.getElementById('status');
    const editorRoot = document.getElementById('editor');
    const langExt = ${languageSetup};
    const state = EditorState.create({
      doc: ${JSON.stringify(content)},
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        bracketMatching(),
        indentOnInput(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        keymap.of([...defaultKeymap, indentWithTab]),
        EditorView.lineWrapping,
        ...(langExt ? [langExt] : []),
      ]
    });
    const view = new EditorView({ state, parent: editorRoot });

    saveBtn.addEventListener('click', async () => {
      status.textContent = 'Saving...';
      const response = await fetch(location.pathname, {
        method: 'PUT',
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        body: view.state.doc.toString(),
      });
      status.textContent = response.ok ? 'Saved' : 'Save failed';
    });
  </script>
</body>
</html>`
}

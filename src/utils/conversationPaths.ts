/**
 * 会话消息渲染用的路径/文件引用解析纯函数。
 * 原为 ThreadConversation.vue 内联函数（第十五轮拆分提取），不依赖组件状态。
 */

export function isFilePath(value: string): boolean {
  if (!value || /[\r\n]/u.test(value)) return false
  if (value.endsWith('/') || value.endsWith('\\')) return false
  if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\//u.test(value)) return false

  const looksLikeUnixAbsolute = value.startsWith('/')
  const looksLikeWindowsAbsolute = /^[A-Za-z]:[\\/]/u.test(value)
  const looksLikeRelative = value.startsWith('./') || value.startsWith('../') || value.startsWith('~/')
  if (looksLikeUnixAbsolute || looksLikeWindowsAbsolute || looksLikeRelative) return true

  const looksLikeBareFilename = /^[A-Za-z0-9._@() -]+\.[A-Za-z0-9]{1,12}$/u.test(value)
  if (looksLikeBareFilename) return true

  // Bare relative paths should look like actual path segments, not arbitrary prose containing "/".
  return /^[A-Za-z0-9._@() -]+(?:[\\/][A-Za-z0-9._@() -]+)+$/u.test(value)
}

export function getBasename(pathValue: string): string {
  const normalized = pathValue.replace(/\\/gu, '/')
  const name = normalized.split('/').filter(Boolean).pop()
  return name || pathValue
}

export function normalizePathSeparators(pathValue: string): string {
  return pathValue.replace(/\\/gu, '/')
}

export function normalizeFileUrlToPath(pathValue: string): string {
  if (!pathValue.startsWith('file://')) return pathValue
  let stripped = pathValue.replace(/^file:\/\//u, '')
  try {
    stripped = decodeURIComponent(stripped)
  } catch {
    // Keep best-effort path if decoding fails.
  }
  if (/^\/[A-Za-z]:\//u.test(stripped)) {
    stripped = stripped.slice(1)
  }
  return stripped
}

export function inferHomeFromCwd(cwd: string): string {
  const normalized = normalizePathSeparators(cwd)
  const userMatch = normalized.match(/^\/Users\/([^/]+)/u)
  if (userMatch) return `/Users/${userMatch[1]}`
  const homeMatch = normalized.match(/^\/home\/([^/]+)/u)
  if (homeMatch) return `/home/${homeMatch[1]}`
  return ''
}

export function normalizePathDots(pathValue: string): string {
  const normalized = normalizePathSeparators(pathValue)
  if (!normalized) return normalized

  let root = ''
  let rest = normalized
  const driveMatch = rest.match(/^([A-Za-z]:)(\/.*)?$/u)
  if (driveMatch) {
    root = `${driveMatch[1]}/`
    rest = (driveMatch[2] ?? '').replace(/^\/+/u, '')
  } else if (rest.startsWith('/')) {
    root = '/'
    rest = rest.slice(1)
  }

  const parts = rest.split('/').filter(Boolean)
  const stack: string[] = []
  for (const part of parts) {
    if (part === '.') continue
    if (part === '..') {
      if (stack.length > 0) stack.pop()
      continue
    }
    stack.push(part)
  }

  const joined = stack.join('/')
  if (root) return `${root}${joined}`.replace(/\/+$/u, '') || root
  return joined || normalized
}

export function resolveRelativePath(pathValue: string, cwd: string): string {
  const normalizedPath = normalizePathSeparators(normalizeFileUrlToPath(pathValue.trim()))
  if (!normalizedPath) return ''

  const looksLikeAbsolute = normalizedPath.startsWith('/') || /^[A-Za-z]:\//u.test(normalizedPath)
  if (looksLikeAbsolute) return normalizePathDots(normalizedPath)

  if (normalizedPath.startsWith('~/')) {
    const homeBase = inferHomeFromCwd(cwd)
    if (homeBase) {
      return normalizePathDots(`${homeBase}/${normalizedPath.slice(2)}`)
    }
  }

  const base = normalizePathSeparators(cwd.trim())
  if (!base) return normalizePathDots(normalizedPath)
  return normalizePathDots(`${base.replace(/\/+$/u, '')}/${normalizedPath}`)
}

export function trimLinkWrappers(value: string): { core: string; leading: string; trailing: string } {
  let core = value
  let leading = ''
  let trailing = ''

  const wrapperPairs: Record<string, string> = {
    '(': ')',
    '[': ']',
    '{': '}',
    '<': '>',
    '"': '"',
    '\'': '\'',
    '`': '`',
    '“': '”',
    '‘': '’',
  }

  while (core.length > 0) {
    const opening = core[0]
    const closing = Object.prototype.hasOwnProperty.call(wrapperPairs, opening) ? wrapperPairs[opening] : ''
    if (!closing || !core.endsWith(closing)) break
    leading += opening
    trailing += closing
    core = core.slice(1, -1)
  }

  return { core, leading, trailing }
}

export function parseFileReference(value: string): { path: string; line: number | null } | null {
  if (!value) return null

  let pathValue = value.trim()
  const wrapped = trimLinkWrappers(pathValue)
  pathValue = wrapped.core.trim()
  let line: number | null = null

  const hashLineMatch = pathValue.match(/^(.*)#L(\d+)(?:C\d+)?$/u)
  if (hashLineMatch) {
    pathValue = hashLineMatch[1]
    line = Number(hashLineMatch[2])
  } else {
    const colonLineMatch = pathValue.match(/^(.*):(\d+)(?::\d+)?$/u)
    if (colonLineMatch) {
      pathValue = colonLineMatch[1]
      line = Number(colonLineMatch[2])
    }
  }

  pathValue = normalizeFileUrlToPath(pathValue)
  if (!isFilePath(pathValue)) return null
  return { path: pathValue, line }
}

export function countAsterisksBefore(value: string, endIndex: number, minIndex: number): number {
  let count = 0
  let index = endIndex - 1
  while (index >= minIndex && value[index] === '*') {
    count += 1
    index -= 1
  }
  return count
}

export function countAsterisksAfter(value: string, startIndex: number): number {
  let count = 0
  let index = startIndex
  while (index < value.length && value[index] === '*') {
    count += 1
    index += 1
  }
  return count
}

export function readAsteriskLinkWrapper(
  source: string,
  matchStart: number,
  matchEnd: number,
  cursor: number,
  matchedToken: string,
): { segmentStart: number; segmentEnd: number; tokenEndTrim: number } | null {
  const leadingCount = countAsterisksBefore(source, matchStart, cursor)
  if (leadingCount < 2) return null

  const trailingOutsideCount = countAsterisksAfter(source, matchEnd)
  if (trailingOutsideCount >= leadingCount) {
    return {
      segmentStart: matchStart - leadingCount,
      segmentEnd: matchEnd + leadingCount,
      tokenEndTrim: 0,
    }
  }

  const trailingInsideCount = countAsterisksBefore(matchedToken, matchedToken.length, 0)
  if (trailingInsideCount >= leadingCount) {
    return {
      segmentStart: matchStart - leadingCount,
      segmentEnd: matchEnd,
      tokenEndTrim: leadingCount,
    }
  }

  return null
}

export function parseMarkdownLinkToken(value: string): { label: string; target: string } | null {
  const trimmed = value.trim()
  if (!trimmed.startsWith('[') || !trimmed.endsWith(')')) return null
  const labelCloseIndex = trimmed.indexOf(']')
  if (labelCloseIndex <= 1) return null
  if (trimmed[labelCloseIndex + 1] !== '(') return null
  const labelRaw = trimmed.slice(1, labelCloseIndex).trim()
  const targetRaw = trimmed.slice(labelCloseIndex + 2, -1).trim()
  if (labelRaw.includes('\n') || targetRaw.includes('\n')) return null
  const label = trimLinkWrappers(labelRaw).core.trim() || labelRaw
  const target = trimLinkWrappers(targetRaw).core.trim()
  if (!target) return null
  return { label, target }
}

export function toLocalThreadUrl(value: string): string | null {
  const match = value.trim().match(/^codex:\/\/threads\/([A-Za-z0-9-]+)$/u)
  if (!match) return null
  if (typeof window === 'undefined') return `/#/thread/${match[1]}`
  const basePath = window.location.pathname.replace(/\/?$/u, '/')
  return `${window.location.origin}${basePath}#/thread/${match[1]}`
}

export function headingTag(level: number): string {
  const normalizedLevel = Math.min(6, Math.max(1, Math.trunc(level)))
  return `h${String(normalizedLevel)}`
}

export function headingClass(level: number): string {
  switch (Math.min(6, Math.max(1, Math.trunc(level)))) {
    case 1:
      return 'message-heading-h1'
    case 2:
      return 'message-heading-h2'
    case 3:
      return 'message-heading-h3'
    case 4:
      return 'message-heading-h4'
    case 5:
      return 'message-heading-h5'
    default:
      return 'message-heading-h6'
  }
}

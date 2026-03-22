function normalizeBasePath(value: string | undefined): string {
  const trimmed = (value ?? '/').trim()
  if (!trimmed || trimmed === '/') return '/'
  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  const withoutTrailingSlashes = withLeadingSlash.replace(/\/+$/u, '')
  return `${withoutTrailingSlashes}/`
}

function isExternalUrl(value: string): boolean {
  return /^[a-zA-Z][a-zA-Z\d+.-]*:/u.test(value) || value.startsWith('//')
}

export const APP_BASE_PATH = normalizeBasePath(import.meta.env.BASE_URL)

export function appPath(target: string): string {
  const trimmed = target.trim()
  if (!trimmed) return APP_BASE_PATH
  if (isExternalUrl(trimmed)) return trimmed

  const normalizedTarget = trimmed.replace(/^\/+/u, '')
  if (!normalizedTarget) return APP_BASE_PATH
  return `${APP_BASE_PATH}${normalizedTarget}`
}

export function appWsUrl(target: string): string {
  const resolvedPath = appPath(target)
  if (typeof window === 'undefined' || isExternalUrl(resolvedPath)) {
    return resolvedPath
  }

  const url = new URL(resolvedPath, window.location.origin)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}

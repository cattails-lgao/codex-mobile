// round-183：把缓存名绑到构建产物上，并让安装过程不会因为一次瞬时失败而卡死。
//
// 背景（线上现象）：重部署后有些标签页会「坏一阵子，清掉应用缓存就好了」。
// 两条叠加的原因：
//   1) CACHE_NAME 写死成固定字符串（旧值以 `v2` 结尾）⇒ sw.js 的字节在两次构建之间**完全
//      相同**，浏览器不会判定 SW 需要更新，所以既不会重新 install，也不会在
//      activate 里清掉旧缓存 ⇒ 旧 shell 与旧 chunk 可以一直留着（旧标签页请求
//      已下线的 chunk 时，networkFirstStatic 还会从缓存里把旧文件喂回去，
//      于是整页继续跑旧构建，而服务端早已是新版本）。
//   2) install 里用了 cache.addAll：任一资源失败就整体 reject ⇒ 新 SW 装不上、
//      旧 SW 继续服务。重部署瞬间最容易踩这个。
//
// 修法：BUILD_ID 由构建期注入（见 vite.config.ts 的 codex-sw-version 插件），
// 每次产物变化 ⇒ sw.js 字节变化 ⇒ 走标准更新流程 ⇒ activate 清掉所有非当前
// 版本的缓存；install 改成逐个 add 且各自吞错。
const BUILD_ID = '__CODEX_SW_BUILD_ID__'
const CACHE_NAME = `codexweb-shell-${BUILD_ID}`
const APP_SHELL_PATHS = ['/', '/manifest.webmanifest']
const STATIC_DESTINATIONS = new Set(['document', 'script', 'style', 'image', 'font'])
const BYPASS_PREFIXES = ['/codex-api/', '/codex-local-image', '/codex-local-file', '/codex-local-browse/', '/codex-local-edit/']

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME)
      // 逐个装入：单个资源失败不该让新版本装不上（旧行为是 addAll 整体 reject）。
      await Promise.all(
        APP_SHELL_PATHS.map((path) => cache.add(path).catch(() => undefined)),
      )
    })(),
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      )
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (BYPASS_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) return

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request))
    return
  }

  if (request.destination === 'script' || request.destination === 'style') {
    event.respondWith(networkFirstStatic(request))
    return
  }

  if (STATIC_DESTINATIONS.has(request.destination) || url.pathname === '/manifest.webmanifest') {
    event.respondWith(staleWhileRevalidate(request))
  }
})

async function networkFirstNavigation(request) {
  const cache = await caches.open(CACHE_NAME)
  try {
    const response = await fetch(request)
    if (response.ok) {
      cache.put('/', response.clone())
    }
    return response
  } catch {
    // 仅真正的离线才回退缓存；此时缓存一定是本构建写入的（缓存名带 BUILD_ID）。
    return (await cache.match('/')) || Response.error()
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME)
  const cached = await cache.match(request)
  const networkPromise = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(request, response.clone())
      }
      return response
    })
    .catch(() => null)

  if (cached) {
    return cached
  }

  const response = await networkPromise
  return response || Response.error()
}

async function networkFirstStatic(request) {
  const cache = await caches.open(CACHE_NAME)
  try {
    const response = await fetch(request)
    if (response.ok) {
      cache.put(request, response.clone())
      return response
    }
    return (await cache.match(request)) || response
  } catch {
    return (await cache.match(request)) || Response.error()
  }
}

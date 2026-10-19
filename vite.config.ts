import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { createCodexBridgeMiddleware } from "./src/server/codexAppServerBridge";
import { createDirectoryListingHtml, createTextEditorHtml, decodeBrowsePath, getFilePreview, getLocalDirectoryListing, isTextEditableFile, listWorkspaceFiles, normalizeLocalPath } from "./src/server/localBrowseUi";
import tailwindcss from "@tailwindcss/vite";
import { spawnSync } from "node:child_process";
import { createReadStream, existsSync, readFileSync } from "node:fs";
import { readFile, stat, writeFile } from "node:fs/promises";
import { basename, extname, isAbsolute, join } from "node:path";
import { createHash } from "node:crypto";
import { WebSocketServer, type WebSocket } from "ws";
import { attachHeartbeatToWebSocket } from "./src/server/bridge/wsHeartbeat";
import pkg from "./package.json";

const IMAGE_CONTENT_TYPES: Record<string, string> = {
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".mkv": "video/x-matroska",
  ".ogv": "video/ogg",
  ".mpeg": "video/mpeg",
  ".avi": "video/x-msvideo",
};

function normalizeLocalImagePath(rawPath: string): string {
  const trimmed = rawPath.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("file://")) {
    try {
      return decodeURIComponent(trimmed.replace(/^file:\/\//u, ""));
    } catch {
      return trimmed.replace(/^file:\/\//u, "");
    }
  }
  return trimmed;
}

function getWorktreeName(): string {
  const normalizedCwd = process.cwd().replace(/\\/g, "/");
  const segments = normalizedCwd.split("/").filter(Boolean);
  const worktreesIndex = segments.lastIndexOf("worktrees");
  if (worktreesIndex >= 0 && worktreesIndex + 1 < segments.length) {
    return segments[worktreesIndex + 1];
  }

  const gitDir = spawnSync("git", ["rev-parse", "--path-format=absolute", "--git-dir"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  if (gitDir.status === 0) {
    const resolvedGitDir = gitDir.stdout.trim().replace(/\\/g, "/");
    const worktreeMarker = "/.git/worktrees/";
    const markerIndex = resolvedGitDir.indexOf(worktreeMarker);
    if (markerIndex >= 0) {
      const worktreeSegments = resolvedGitDir.slice(markerIndex + worktreeMarker.length).split("/").filter(Boolean);
      if (worktreeSegments.length > 0) {
        return worktreeSegments[0] ?? "unknown";
      }
    }
  }

  const gitCommonDir = spawnSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  if (gitCommonDir.status === 0) {
    const resolvedGitCommonDir = gitCommonDir.stdout.trim().replace(/\\/g, "/");
    if (resolvedGitCommonDir.endsWith("/.git")) {
      const commonDirSegments = resolvedGitCommonDir.split("/").filter(Boolean);
      if (commonDirSegments.length >= 2) {
        return commonDirSegments[commonDirSegments.length - 2] ?? "unknown";
      }
    }
  }

  return segments[segments.length - 1] ?? "unknown";
}

const worktreeName = getWorktreeName();
const appVersion = typeof pkg.version === "string" ? pkg.version : "unknown";
const WS_UPGRADE_ATTACHED_KEY = "__codexBridgeWsAttached__";

function readEnvValueFromFile(filePath: string, key: string): string {
  if (!existsSync(filePath)) return "";
  const raw = readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    const currentKey = trimmed.slice(0, separator).trim();
    if (currentKey !== key) continue;
    return trimmed.slice(separator + 1).trim();
  }
  return "";
}

function resolveViteRollbackDebugFallback(): string {
  const fromEnvLocal = readEnvValueFromFile(".env.local", "VITE_ROLLBACK_DEBUG");
  if (fromEnvLocal) return fromEnvLocal;
  return readEnvValueFromFile(".env", "VITE_ROLLBACK_DEBUG");
}

const viteRollbackDebugFallback = resolveViteRollbackDebugFallback();

// round-183：Service Worker 的缓存名必须随构建变化，否则浏览器认为 sw.js 没变，
// 既不会重新 install，activate 也不会清旧缓存 —— 线上表现就是「重部署后某些
// 标签页一直跑旧构建，清掉应用缓存才恢复」。这里把 dist/index.html 的指纹注入
// 到 sw.js 里（index.html 里含全部 chunk 哈希，产物一变指纹必变）。
const SW_BUILD_PLACEHOLDER = "__CODEX_SW_BUILD_ID__";

async function stampServiceWorkerBuildId(outDir: string): Promise<void> {
  const swPath = join(outDir, "sw.js");
  if (!existsSync(swPath)) return;
  const indexPath = join(outDir, "index.html");
  const fingerprint = createHash("sha256")
    .update(existsSync(indexPath) ? readFileSync(indexPath) : "no-index")
    .digest("hex")
    .slice(0, 10);
  const raw = await readFile(swPath, "utf8");
  const next = raw.includes(SW_BUILD_PLACEHOLDER)
    ? raw.split(SW_BUILD_PLACEHOLDER).join(fingerprint)
    : raw.replace(/const BUILD_ID = '[^']*'/u, `const BUILD_ID = '${fingerprint}'`);
  if (next !== raw) await writeFile(swPath, next, "utf8");
}

function assertServiceWorkerStamped(outDir: string): void {
  const swPath = join(outDir, "sw.js");
  if (!existsSync(swPath)) {
    throw new Error(`codex-sw-version: ${swPath} 不存在，构建产物不完整`);
  }
  const stamped = readFileSync(swPath, "utf8");
  const buildId = /const BUILD_ID = '([^']*)'/u.exec(stamped)?.[1] ?? "";
  if (buildId.includes(SW_BUILD_PLACEHOLDER) || buildId.length < 6) {
    throw new Error(
      "codex-sw-version: sw.js 的 BUILD_ID 未被注入（占位符仍在）。"
        + " 这样上线后会退回「缓存永不失效」的老行为，构建按失败处理。",
    );
  }
}

export default defineConfig({
  define: {
    "import.meta.env.VITE_WORKTREE_NAME": JSON.stringify(worktreeName),
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(appVersion),
    "import.meta.env.VITE_ROLLBACK_DEBUG_FALLBACK": JSON.stringify(viteRollbackDebugFallback),
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    allowedHosts: [".trycloudflare.com"],
    watch: {
      ignored: [
        '**/.omx/**',
        '**/.cursor/**',
        '**/.codex/**',
        '**/.playwright-cli/**',
        '**/dist/**',
        '**/dist-cli/**',
      ],
    },
  },
  plugins: [
    vue(),
    tailwindcss(),
    {
      name: "codex-sw-version",
      apply: "build",
      async writeBundle(options) {
        await stampServiceWorkerBuildId(options.dir ?? "dist");
      },
      async closeBundle() {
        // public/ 的拷贝与 writeBundle 的先后顺序在 Vite 版本间有差异，
        // 这里再兜一次；重复注入是幂等的（占位符已被替换后走正则覆写分支）。
        await stampServiceWorkerBuildId("dist");
        assertServiceWorkerStamped("dist");
      },
    },
    {
      name: "codex-bridge",
      configureServer(server) {
        process.env.CODEXUI_SERVER_PORT = String(server.config.server.port ?? 5173);
        const bridge = createCodexBridgeMiddleware();
        const httpServer = server.httpServer;
        if (httpServer) {
          httpServer.once("listening", () => {
            const addr = httpServer.address();
            if (addr && typeof addr === "object" && addr.port) {
              process.env.CODEXUI_SERVER_PORT = String(addr.port);
            }
          });
          const hostScope = httpServer as typeof httpServer & {
            [WS_UPGRADE_ATTACHED_KEY]?: boolean;
          };
          if (!hostScope[WS_UPGRADE_ATTACHED_KEY]) {
            hostScope[WS_UPGRADE_ATTACHED_KEY] = true;
            const wss = new WebSocketServer({ noServer: true });

            httpServer.on("upgrade", (req, socket, head) => {
              const requestUrl = new URL(req.url ?? "", "http://localhost");
              if (requestUrl.pathname !== "/codex-api/ws") return;
              wss.handleUpgrade(req, socket, head, (ws: WebSocket) => {
                wss.emit("connection", ws, req);
              });
            });

            wss.on("connection", (ws: WebSocket) => {
              // round-183：与 src/server/httpServer.ts 同口径加心跳，避免 dev
              // （含 trycloudflare 隧道）下空闲 120s 被中间层掐断。
              attachHeartbeatToWebSocket(ws);
              ws.send(
                JSON.stringify({
                  method: "ready",
                  params: { ok: true },
                  atIso: new Date().toISOString(),
                }),
              );
              const unsubscribe = bridge.subscribeNotifications((notification) => {
                if (ws.readyState !== ws.OPEN) return;
                ws.send(JSON.stringify(notification));
              });

              ws.on("close", unsubscribe);
              ws.on("error", unsubscribe);
            });

            httpServer.once("close", () => {
              wss.close();
            });
          }
        }
        server.middlewares.use((req, res, next) => {
          if (!req.url || (req.method !== "GET" && req.method !== "HEAD")) return next();
          const url = new URL(req.url, "http://localhost");
          if (url.pathname !== "/codex-local-image") return next();

          const localPath = normalizeLocalImagePath(url.searchParams.get("path") ?? "");
          if (!localPath || !isAbsolute(localPath)) {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "Expected absolute local file path." }));
            return;
          }

          const contentType = IMAGE_CONTENT_TYPES[extname(localPath).toLowerCase()];
          if (!contentType) {
            res.statusCode = 415;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "Unsupported image type." }));
            return;
          }

          res.statusCode = 200;
          res.setHeader("Content-Type", contentType);
          res.setHeader("Cache-Control", "private, max-age=300");
          const stream = createReadStream(localPath);
          stream.on("error", () => {
            if (res.headersSent) return;
            res.statusCode = 404;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "Image file not found." }));
          });
          stream.pipe(res);
        });
        server.middlewares.use((req, res, next) => {
          if (!req.url || (req.method !== "GET" && req.method !== "HEAD")) return next();
          const url = new URL(req.url, "http://localhost");
          if (url.pathname !== "/codex-local-file") return next();

          const localPath = normalizeLocalPath(url.searchParams.get("path") ?? "");
          if (!localPath || !isAbsolute(localPath)) {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "Expected absolute local file path." }));
            return;
          }

          res.statusCode = 200;
          res.setHeader("Cache-Control", "private, no-store");
          res.setHeader("Content-Disposition", `inline; filename="${basename(localPath)}"`);

          const stream = createReadStream(localPath);
          stream.on("error", () => {
            if (res.headersSent) return;
            res.statusCode = 404;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "File not found." }));
          });
          stream.pipe(res);
        });
        server.middlewares.use(async (req, res, next) => {
          if (!req.url || (req.method !== "GET" && req.method !== "HEAD")) return next();
          const url = new URL(req.url, "http://localhost");
          if (url.pathname !== "/codex-local-directories") return next();

          const showHidden = ["1", "true", "yes", "on"].includes((url.searchParams.get("showHidden") ?? "").toLowerCase());
          const localPath = normalizeLocalPath(url.searchParams.get("path") ?? "");
          if (!localPath || !isAbsolute(localPath)) {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "Expected absolute local directory path." }));
            return;
          }

          try {
            const fileStat = await stat(localPath);
            if (!fileStat.isDirectory()) {
              res.statusCode = 400;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "Expected directory path." }));
              return;
            }

            const data = await getLocalDirectoryListing(localPath, { showHidden });
            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ data }));
          } catch {
            res.statusCode = 404;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "Directory not found." }));
          }
        });
        server.middlewares.use(async (req, res, next) => {
          if (!req.url || (req.method !== "GET" && req.method !== "HEAD")) return next();
          const url = new URL(req.url, "http://localhost");
          if (url.pathname !== "/codex-local-files") return next();

          const localPath = normalizeLocalPath(url.searchParams.get("path") ?? "");
          if (!localPath || !isAbsolute(localPath)) {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "Expected absolute local directory path." }));
            return;
          }

          try {
            const fileStat = await stat(localPath);
            if (!fileStat.isDirectory()) {
              res.statusCode = 400;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "Expected directory path." }));
              return;
            }

            const data = await listWorkspaceFiles(localPath);
            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ data }));
          } catch {
            res.statusCode = 404;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "Directory not found." }));
          }
        });
        server.middlewares.use(async (req, res, next) => {
          if (!req.url || (req.method !== "GET" && req.method !== "HEAD")) return next();
          const url = new URL(req.url, "http://localhost");
          if (url.pathname !== "/codex-local-preview") return next();

          const localPath = normalizeLocalPath(url.searchParams.get("path") ?? "");
          if (!localPath || !isAbsolute(localPath)) {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "Expected absolute local file path." }));
            return;
          }

          try {
            const fileStat = await stat(localPath);
            if (!fileStat.isFile()) {
              res.statusCode = 400;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "Expected file path." }));
              return;
            }
            const preview = await getFilePreview(localPath);
            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ data: preview }));
          } catch {
            res.statusCode = 404;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "File not found." }));
          }
        });
        server.middlewares.use(async (req, res, next) => {
          if (!req.url || (req.method !== "GET" && req.method !== "HEAD")) return next();
          const url = new URL(req.url, "http://localhost");
          if (!url.pathname.startsWith("/codex-local-browse/")) return next();

          const localPath = decodeBrowsePath(url.pathname.slice("/codex-local-browse".length));
          const newProjectName = url.searchParams.get("newProjectName") ?? "";
          if (!localPath || !isAbsolute(localPath)) {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "Expected absolute local file path." }));
            return;
          }

          try {
            const fileStat = await stat(localPath);
            res.setHeader("Cache-Control", "private, no-store");
            if (fileStat.isDirectory()) {
              const html = await createDirectoryListingHtml(localPath, { newProjectName });
              res.statusCode = 200;
              res.setHeader("Content-Type", "text/html; charset=utf-8");
              res.end(html);
              return;
            }

            res.statusCode = 200;
            const stream = createReadStream(localPath);
            stream.on("error", () => {
              if (res.headersSent) return;
              res.statusCode = 404;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "File not found." }));
            });
            stream.pipe(res);
          } catch {
            res.statusCode = 404;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "File not found." }));
          }
        });
        server.middlewares.use(async (req, res, next) => {
          if (!req.url || (req.method !== "GET" && req.method !== "HEAD")) return next();
          const url = new URL(req.url, "http://localhost");
          if (!url.pathname.startsWith("/codex-local-edit/")) return next();
          const localPath = decodeBrowsePath(url.pathname.slice("/codex-local-edit".length));
          if (!localPath || !isAbsolute(localPath)) {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "Expected absolute local file path." }));
            return;
          }
          try {
            const fileStat = await stat(localPath);
            if (!fileStat.isFile()) {
              res.statusCode = 400;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "Expected file path." }));
              return;
            }
            const html = await createTextEditorHtml(localPath);
            res.statusCode = 200;
            res.setHeader("Content-Type", "text/html; charset=utf-8");
            res.end(html);
          } catch {
            res.statusCode = 404;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "File not found." }));
          }
        });
        server.middlewares.use(async (req, res, next) => {
          if (!req.url || req.method !== "PUT") return next();
          const url = new URL(req.url, "http://localhost");
          if (!url.pathname.startsWith("/codex-local-edit/")) return next();
          const localPath = decodeBrowsePath(url.pathname.slice("/codex-local-edit".length));
          if (!localPath || !isAbsolute(localPath)) {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "Expected absolute local file path." }));
            return;
          }
          if (!(await isTextEditableFile(localPath))) {
            res.statusCode = 415;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "Only text-like files are editable." }));
            return;
          }
          const chunks: Buffer[] = [];
          req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
          req.on("end", async () => {
            try {
              await writeFile(localPath, Buffer.concat(chunks).toString("utf8"), "utf8");
              res.statusCode = 200;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ ok: true }));
            } catch {
              res.statusCode = 404;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "File not found." }));
            }
          });
          req.on("error", () => {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "Write failed." }));
          });
        });
        server.middlewares.use(bridge);
        server.httpServer?.once("close", () => {
          bridge.dispose();
        });
      },
    },
  ],
});

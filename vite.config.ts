import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { createCodexBridgeMiddleware } from "./src/server/codexAppServerBridge";
import tailwindcss from "@tailwindcss/vite";
import { createReadStream } from "node:fs";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { basename, extname, isAbsolute } from "node:path";
import { WebSocketServer, type WebSocket } from "ws";

const IMAGE_CONTENT_TYPES: Record<string, string> = {
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
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

function normalizeLocalPath(rawPath: string): string {
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

function decodeBrowsePath(rawPath: string): string {
  if (!rawPath) return "";
  try {
    return decodeURIComponent(rawPath);
  } catch {
    return rawPath;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#39;");
}

function toBrowseHref(pathValue: string): string {
  return `/codex-local-browse${encodeURI(pathValue)}`;
}

function toEditHref(pathValue: string): string {
  return `/codex-local-edit${encodeURI(pathValue)}`;
}

function isTextEditablePath(pathValue: string): boolean {
  const extension = extname(pathValue).toLowerCase();
  return [
    ".txt", ".md", ".json", ".js", ".ts", ".tsx", ".jsx", ".css", ".scss",
    ".html", ".htm", ".xml", ".yml", ".yaml", ".log", ".csv", ".env", ".py",
    ".sh", ".toml", ".ini", ".conf", ".sql",
  ].includes(extension);
}

async function renderTextEditor(res: import("node:http").ServerResponse, localPath: string): Promise<void> {
  if (!isTextEditablePath(localPath)) {
    res.statusCode = 415;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Only text-like files are editable." }));
    return;
  }
  const content = await readFile(localPath, "utf8");
  const parentPath = localPath === "/" ? "/" : localPath.replace(/\/+$/u, "").replace(/\/[^/]+$/u, "") || "/";
  const html = `<!doctype html>
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
    textarea { width: 100%; min-height: calc(100vh - 130px); background: #07101f; color: #dbe6ff; border: 1px solid #345; border-radius: 8px; padding: 12px; box-sizing: border-box; }
    #status { margin-left: 8px; color: #8cc2ff; }
  </style>
</head>
<body>
  <div class="row">
    <a href="${escapeHtml(toBrowseHref(parentPath))}">Back</a>
    <button id="saveBtn" type="button">Save</button>
    <span id="status"></span>
  </div>
  <div class="row">${escapeHtml(localPath)}</div>
  <textarea id="editor">${escapeHtml(content)}</textarea>
  <script>
    const saveBtn = document.getElementById('saveBtn');
    const status = document.getElementById('status');
    const editor = document.getElementById('editor');
    saveBtn.addEventListener('click', async () => {
      status.textContent = 'Saving...';
      const response = await fetch(location.pathname, {
        method: 'PUT',
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        body: editor.value,
      });
      status.textContent = response.ok ? 'Saved' : 'Save failed';
    });
  </script>
</body>
</html>`;
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(html);
}

async function renderDirectoryListing(res: import("node:http").ServerResponse, localPath: string): Promise<void> {
  const entries = await readdir(localPath, { withFileTypes: true });
  const entriesWithMeta = await Promise.all(entries.map(async (entry) => {
    const entryPath = `${localPath.replace(/\/+$/u, "")}/${entry.name}`;
    const entryStat = await stat(entryPath);
    return { entry, entryPath, mtimeMs: entryStat.mtimeMs };
  }));
  const sorted = entriesWithMeta.slice().sort((a, b) => {
    if (b.mtimeMs !== a.mtimeMs) return b.mtimeMs - a.mtimeMs;
    if (a.entry.isDirectory() && !b.entry.isDirectory()) return -1;
    if (!a.entry.isDirectory() && b.entry.isDirectory()) return 1;
    return a.entry.name.localeCompare(b.entry.name);
  });

  const rows = sorted
    .map(({ entry, entryPath }) => {
      const suffix = entry.isDirectory() ? "/" : "";
      const editAction = (!entry.isDirectory() && isTextEditablePath(entryPath))
        ? ` <a href="${escapeHtml(toEditHref(entryPath))}">Edit</a>`
        : "";
      return `<li><a href="${escapeHtml(toBrowseHref(entryPath))}">${escapeHtml(entry.name)}${suffix}</a>${editAction}</li>`;
    })
    .join("\n");

  const parentPath = localPath === "/" ? "/" : localPath.replace(/\/+$/u, "").replace(/\/[^/]+$/u, "") || "/";
  const parentLink = localPath !== parentPath
    ? `<p><a href="${escapeHtml(toBrowseHref(parentPath))}">..</a></p>`
    : "";

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Index of ${escapeHtml(localPath)}</title>
  <style>
    body { font-family: ui-monospace, Menlo, Monaco, monospace; margin: 24px; background: #0b1020; color: #dbe6ff; }
    a { color: #8cc2ff; text-decoration: none; }
    a:hover { text-decoration: underline; }
    ul { list-style: none; padding: 0; margin: 12px 0 0; }
    li { padding: 3px 0; }
    h1 { font-size: 18px; margin: 0; word-break: break-all; }
  </style>
</head>
<body>
  <h1>Index of ${escapeHtml(localPath)}</h1>
  ${parentLink}
  <ul>${rows}</ul>
</body>
</html>`;

  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(html);
}

function getWorktreeName(): string {
  const normalizedCwd = process.cwd().replace(/\\/g, "/");
  const segments = normalizedCwd.split("/").filter(Boolean);
  const worktreesIndex = segments.lastIndexOf("worktrees");
  if (worktreesIndex >= 0 && worktreesIndex + 1 < segments.length) {
    return segments[worktreesIndex + 1];
  }
  return segments[segments.length - 1] ?? "unknown";
}

const worktreeName = getWorktreeName();
const WS_UPGRADE_ATTACHED_KEY = "__codexBridgeWsAttached__";

export default defineConfig({
  define: {
    "import.meta.env.VITE_WORKTREE_NAME": JSON.stringify(worktreeName),
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    allowedHosts: [".trycloudflare.com"],
    watch: {
      ignored: [
        '**/.omx/**',
        '**/.cursor/**',
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
      name: "codex-bridge",
      configureServer(server) {
        const bridge = createCodexBridgeMiddleware();
        const httpServer = server.httpServer;
        if (httpServer) {
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
          if (!url.pathname.startsWith("/codex-local-browse/")) return next();

          const localPath = decodeBrowsePath(url.pathname.slice("/codex-local-browse".length));
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
              await renderDirectoryListing(res, localPath);
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
            await renderTextEditor(res, localPath);
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
          if (!isTextEditablePath(localPath)) {
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

import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { createCodexBridgeMiddleware } from "./src/server/codexAppServerBridge";
import tailwindcss from "@tailwindcss/vite";
import { createReadStream } from "node:fs";
import { extname, isAbsolute } from "node:path";

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

export default defineConfig({
  define: {
    "import.meta.env.VITE_WORKTREE_NAME": JSON.stringify(worktreeName),
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
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
        server.middlewares.use(bridge);
        server.httpServer?.once("close", () => {
          bridge.dispose();
        });
      },
    },
  ],
});

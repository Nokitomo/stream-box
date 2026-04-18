import { defineConfig } from "vite";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

function normalizePathname(value) {
  const raw = String(value || "/").split("?")[0].split("#")[0] || "/";
  return raw.startsWith("/") ? raw : `/${raw}`;
}

function createApiDevPlugin() {
  const rootDir = process.cwd();
  const apiRoot = path.resolve(rootDir, "api");

  function resolveApiFile(pathname) {
    if (!pathname.startsWith("/api/")) return "";
    if (path.extname(pathname)) return "";
    const safe = path.normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, "");
    const absolute = path.resolve(rootDir, `.${safe}.mjs`);
    if (!absolute.startsWith(apiRoot)) return "";
    return absolute;
  }

  async function loadHandler(apiFile) {
    const stat = await fs.stat(apiFile);
    const moduleUrl = `${pathToFileURL(apiFile).href}?v=${stat.mtimeMs}`;
    const mod = await import(moduleUrl);
    return mod && typeof mod.default === "function" ? mod.default : null;
  }

  return {
    name: "streambox-api-dev-runtime",
    apply: "serve",
    enforce: "pre",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const pathname = normalizePathname(req.url);
        const apiFile = resolveApiFile(pathname);
        if (!apiFile) return next();

        try {
          await fs.access(apiFile);
        } catch {
          res.statusCode = 404;
          res.setHeader("content-type", "application/json; charset=utf-8");
          res.end('{"ok":false,"error":"API route not found"}\n');
          return;
        }

        try {
          const handler = await loadHandler(apiFile);
          if (!handler) {
            res.statusCode = 500;
            res.setHeader("content-type", "application/json; charset=utf-8");
            res.end('{"ok":false,"error":"Invalid API handler"}\n');
            return;
          }
          await handler(req, res);
        } catch (error) {
          const message =
            error && error.message ? String(error.message) : "Internal API error";
          res.statusCode = 500;
          res.setHeader("content-type", "application/json; charset=utf-8");
          res.end(
            `${JSON.stringify({ ok: false, error: message })}\n`
          );
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [createApiDevPlugin()],
});


import http from "node:http";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const apiRoot = path.join(rootDir, "api");

const mimeByExt = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8",
};

function readArg(flag, fallback) {
  const index = process.argv.indexOf(flag);
  if (index < 0 || index + 1 >= process.argv.length) return fallback;
  return process.argv[index + 1];
}

function toPort(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

const debug = process.argv.includes("--debug");
const requestedPort = toPort(
  readArg("--port", process.env.PORT || process.env.VERCEL_DEV_PORT || "3000"),
  3000
);
let fallbackTried = false;

function log(...args) {
  if (debug) console.log("[local-vercel]", ...args);
}

function isInsideRoot(filePath, rootPath) {
  const relative = path.relative(rootPath, filePath);
  return !!relative && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function normalizePathname(rawPathname) {
  const value = String(rawPathname || "/").split("?")[0].split("#")[0] || "/";
  if (!value.startsWith("/")) return `/${value}`;
  return value;
}

function resolveStaticPath(pathname) {
  const normalized = normalizePathname(pathname);
  const safePath = path.normalize(normalized).replace(/^(\.\.(\/|\\|$))+/, "");
  const mapped = safePath === "/" ? "/index.html" : safePath;
  const absolute = path.resolve(rootDir, `.${mapped}`);
  return isInsideRoot(absolute, rootDir) || absolute === rootDir ? absolute : "";
}

function resolveApiFile(pathname) {
  const normalized = normalizePathname(pathname);
  if (!normalized.startsWith("/api/")) return "";
  if (path.extname(normalized)) return "";
  const safePath = path.normalize(normalized).replace(/^(\.\.(\/|\\|$))+/, "");
  const absolute = path.resolve(rootDir, `.${safePath}.mjs`);
  if (!absolute.startsWith(apiRoot)) return "";
  return absolute;
}

async function loadApiHandler(apiFile) {
  const fileUrl = pathToFileURL(apiFile).href;
  const mod = await import(fileUrl);
  return mod && typeof mod.default === "function" ? mod.default : null;
}

function writeText(res, statusCode, text) {
  if (res.writableEnded) return;
  res.statusCode = statusCode;
  res.setHeader("content-type", "text/plain; charset=utf-8");
  res.end(text);
}

async function serveStatic(req, res, pathname) {
  const absolute = resolveStaticPath(pathname);
  if (!absolute) {
    writeText(res, 403, "Forbidden");
    return;
  }

  try {
    const stat = await fsp.stat(absolute);
    if (!stat.isFile()) {
      writeText(res, 404, "Not found");
      return;
    }

    const ext = path.extname(absolute).toLowerCase();
    const contentType = mimeByExt[ext] || "application/octet-stream";
    res.statusCode = 200;
    res.setHeader("content-type", contentType);
    res.setHeader("cache-control", "no-store");
    fs.createReadStream(absolute).pipe(res);
  } catch {
    writeText(res, 404, "Not found");
  }
}

async function handleApi(req, res, pathname) {
  const apiFile = resolveApiFile(pathname);
  if (!apiFile) return false;

  try {
    await fsp.access(apiFile);
  } catch {
    writeText(res, 404, "API route not found");
    return true;
  }

  try {
    const handler = await loadApiHandler(apiFile);
    if (!handler) {
      writeText(res, 500, "Invalid API handler");
      return true;
    }
    log(req.method, pathname, "->", path.relative(rootDir, apiFile));
    await handler(req, res);
    return true;
  } catch (error) {
    console.error("[local-vercel] API error:", error && error.stack ? error.stack : error);
    writeText(res, 500, "Internal API error");
    return true;
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const pathname = normalizePathname(url.pathname);

  if (await handleApi(req, res, pathname)) return;
  await serveStatic(req, res, pathname);
});

function logStartup() {
  const address = server.address();
  const activePort =
    address && typeof address === "object" && Number.isFinite(address.port)
      ? address.port
      : requestedPort;
  console.log(`Local Vercel runtime on http://localhost:${activePort}`);
  console.log("Serving static files + api/*.mjs handlers");
  if (!debug) console.log("Tip: add --debug for API route logs");
}

function startListening(port) {
  server.listen(port, logStartup);
}

server.on("error", (error) => {
  if (error && error.code === "EADDRINUSE" && requestedPort !== 0) {
    if (fallbackTried) {
      console.error("[local-vercel] Startup error:", error);
      process.exit(1);
    }
    fallbackTried = true;
    console.warn(`Port ${requestedPort} occupata, fallback automatico su porta libera...`);
    startListening(0);
    return;
  }
  console.error("[local-vercel] Startup error:", error);
  process.exit(1);
});

startListening(requestedPort);

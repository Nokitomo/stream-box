import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import https from "node:https";
import dns from "node:dns";
import { URL } from "node:url";

const DEFAULT_RETRY_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

export function parseCliArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

export function toInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function toFloat(value, fallback) {
  const parsed = Number.parseFloat(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function toBool(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  const text = normalizeText(value).toLowerCase();
  if (!text) {
    return fallback;
  }

  if (["1", "true", "yes", "y", "on"].includes(text)) {
    return true;
  }
  if (["0", "false", "no", "n", "off"].includes(text)) {
    return false;
  }

  return fallback;
}

export function normalizeText(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

export function decodeHtmlEntities(value) {
  return String(value ?? "")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export function extractDataPage(html) {
  const match = String(html ?? "").match(/data-page="([\s\S]*?)"/i);
  if (!match?.[1]) return null;
  const decoded = decodeHtmlEntities(match[1]);
  try {
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

export function pickTranslation(translations, key, locale = "it") {
  if (!Array.isArray(translations)) return "";
  const exact = translations.find(
    (item) => item && item.key === key && item.locale === locale
  );
  if (exact?.value) return normalizeText(exact.value);
  const anyLocale = translations.find((item) => item && item.key === key);
  return normalizeText(anyLocale?.value || "");
}

export function toAbsoluteUrl(baseUrl, input) {
  const text = normalizeText(input);
  if (!text) return "";
  try {
    return new URL(text, baseUrl).href;
  } catch {
    return text;
  }
}

export function uniqueBy(items, keyFn) {
  const seen = new Set();
  const output = [];
  for (const item of items) {
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}

export async function ensureParentDir(filePath) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
}

export async function writeJsonAtomic(filePath, payload, pretty = false) {
  await ensureParentDir(filePath);
  const tempPath = `${filePath}.tmp`;
  const json = JSON.stringify(payload, null, pretty ? 2 : 0);
  await fs.writeFile(tempPath, `${json}\n`, "utf8");
  await fs.rename(tempPath, filePath);
}

export async function writeShardedJson({
  outDir,
  indexFileName = "index.json",
  chunksDirName = "chunks",
  shardSize = 300,
  items = [],
  indexPayload = {},
  pretty = true,
}) {
  const safeShardSize = Math.max(1, Number(shardSize) || 300);
  const rootDir = path.resolve(outDir);
  const chunksDir = path.join(rootDir, chunksDirName);

  await fs.mkdir(rootDir, { recursive: true });
  await fs.rm(chunksDir, { recursive: true, force: true });
  await fs.mkdir(chunksDir, { recursive: true });

  const chunksMeta = [];
  for (let start = 0, chunkIndex = 0; start < items.length; start += safeShardSize, chunkIndex += 1) {
    const chunkItems = items.slice(start, start + safeShardSize);
    const fileName = `chunk-${String(chunkIndex + 1).padStart(4, "0")}.json`;
    const relativePath = `${chunksDirName}/${fileName}`;
    const filePath = path.join(rootDir, relativePath);
    await writeJsonAtomic(
      filePath,
      {
        ...indexPayload,
        chunk: chunkIndex + 1,
        shardSize: safeShardSize,
        count: chunkItems.length,
        items: chunkItems,
      },
      pretty
    );

    chunksMeta.push({
      chunk: chunkIndex + 1,
      file: relativePath,
      count: chunkItems.length,
      from: start,
      to: start + chunkItems.length - 1,
    });
  }

  const indexPath = path.join(rootDir, indexFileName);
  await writeJsonAtomic(
    indexPath,
    {
      ...indexPayload,
      count: items.length,
      shardSize: safeShardSize,
      chunks: chunksMeta,
    },
    pretty
  );

  return {
    indexPath,
    chunksDir,
    chunks: chunksMeta,
    count: items.length,
    shardSize: safeShardSize,
  };
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function asyncMapLimit(items, limit, mapper) {
  if (!Array.isArray(items) || items.length === 0) return [];
  const safeLimit = Math.max(1, Number(limit) || 1);
  const results = new Array(items.length);
  let cursor = 0;

  const workers = Array.from({ length: Math.min(safeLimit, items.length) }).map(
    async () => {
      while (true) {
        const index = cursor;
        cursor += 1;
        if (index >= items.length) return;
        results[index] = await mapper(items[index], index);
      }
    }
  );

  await Promise.all(workers);
  return results;
}

export function createHttpClient({
  defaultHeaders = {},
  timeoutMs = 20000,
  maxRedirects = 5,
  retries = 3,
  retryDelayMs = 1200,
  dnsServers = [],
} = {}) {
  const resolver = dnsServers.length > 0 ? new dns.Resolver() : null;
  const dnsCache = new Map();
  if (resolver) {
    resolver.setServers(dnsServers);
  }

  const lookup = resolver
    ? (hostname, options, callback) => {
        let cb = callback;
        let opts = options;
        if (typeof options === "function") {
          cb = options;
          opts = {};
        }

        if (dnsCache.has(hostname)) {
          const cached = dnsCache.get(hostname);
          if (opts?.all) {
            cb(
              null,
              cached.addresses.map((address) => ({ address, family: 4 }))
            );
            return;
          }
          cb(null, cached.addresses[0], 4);
          return;
        }

        resolver.resolve4(hostname, (err, addresses) => {
          if (err) {
            cb(err);
            return;
          }
          if (!Array.isArray(addresses) || addresses.length === 0) {
            cb(new Error(`No IPv4 records for ${hostname}`));
            return;
          }
          dnsCache.set(hostname, { addresses });
          if (opts?.all) {
            cb(
              null,
              addresses.map((address) => ({ address, family: 4 }))
            );
            return;
          }
          cb(null, addresses[0], 4);
        });
      }
    : undefined;

  const doRequest = async ({
    url,
    method = "GET",
    headers = {},
    body,
    timeout = timeoutMs,
    redirectCount = 0,
  }) => {
    const target = new URL(url);
    const isHttps = target.protocol === "https:";
    const transport = isHttps ? https : http;
    const mergedHeaders = {
      "accept-encoding": "identity",
      ...defaultHeaders,
      ...headers,
    };

    let requestBody = body;
    if (
      requestBody != null &&
      typeof requestBody !== "string" &&
      !Buffer.isBuffer(requestBody)
    ) {
      requestBody = JSON.stringify(requestBody);
      if (!mergedHeaders["content-type"]) {
        mergedHeaders["content-type"] = "application/json";
      }
    }

    if (requestBody != null && !mergedHeaders["content-length"]) {
      mergedHeaders["content-length"] = String(
        Buffer.byteLength(requestBody, "utf8")
      );
    }

    const options = {
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || undefined,
      path: `${target.pathname}${target.search}`,
      method,
      headers: mergedHeaders,
      timeout,
      lookup,
    };

    const response = await new Promise((resolve, reject) => {
      const req = transport.request(options, (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const responseBody = Buffer.concat(chunks).toString("utf8");
          resolve({
            statusCode: res.statusCode || 0,
            headers: res.headers || {},
            body: responseBody,
            url: target.href,
          });
        });
      });

      req.on("error", reject);
      req.on("timeout", () => {
        req.destroy(new Error(`Request timeout (${timeout}ms): ${target.href}`));
      });
      if (requestBody != null) {
        req.write(requestBody);
      }
      req.end();
    });

    const shouldRedirect =
      response.statusCode >= 300 &&
      response.statusCode < 400 &&
      response.headers.location;

    if (shouldRedirect && redirectCount < maxRedirects) {
      const nextUrl = new URL(response.headers.location, target.href).href;
      const nextMethod =
        response.statusCode === 303 ||
        ((response.statusCode === 301 || response.statusCode === 302) &&
          method.toUpperCase() === "POST")
          ? "GET"
          : method;
      return doRequest({
        url: nextUrl,
        method: nextMethod,
        headers,
        body: nextMethod === "GET" ? undefined : requestBody,
        timeout,
        redirectCount: redirectCount + 1,
      });
    }

    return response;
  };

  const request = async (options = {}) => {
    let attempt = 0;
    let lastError = null;
    while (attempt <= retries) {
      attempt += 1;
      try {
        const response = await doRequest(options);
        if (
          DEFAULT_RETRY_STATUSES.has(response.statusCode) &&
          attempt <= retries
        ) {
          await sleep(retryDelayMs * attempt);
          continue;
        }
        return response;
      } catch (err) {
        lastError = err;
        if (attempt > retries) {
          throw err;
        }
        await sleep(retryDelayMs * attempt);
      }
    }
    throw lastError || new Error("Unknown HTTP request failure");
  };

  const requestJson = async (options = {}) => {
    const response = await request(options);
    let data = null;
    try {
      data = JSON.parse(response.body);
    } catch {
      data = null;
    }
    return { ...response, data };
  };

  return {
    request,
    requestJson,
  };
}

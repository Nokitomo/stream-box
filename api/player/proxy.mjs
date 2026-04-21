import http from "node:http";
import https from "node:https";
import dns from "node:dns";
import { URL } from "node:url";
import { badRequest, json } from "../_lib/common.mjs";

const DNS_SERVERS = ["1.1.1.1", "1.0.0.1"];
const MAX_REDIRECTS = 5;
const REQUEST_TIMEOUT_MS = 30000;

function buildLookup(dnsServers) {
  const servers = Array.isArray(dnsServers)
    ? dnsServers.map((entry) => String(entry || "").trim()).filter(Boolean)
    : [];
  if (!servers.length) return undefined;

  const resolver = new dns.Resolver();
  resolver.setServers(servers);
  const cache = new Map();

  return function lookup(hostname, options, callback) {
    let cb = callback;
    let opts = options;
    if (typeof options === "function") {
      cb = options;
      opts = {};
    }

    if (cache.has(hostname)) {
      const cached = cache.get(hostname);
      if (opts && opts.all) {
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
      if (!Array.isArray(addresses) || !addresses.length) {
        cb(new Error(`No IPv4 records for ${hostname}`));
        return;
      }
      cache.set(hostname, { addresses });
      if (opts && opts.all) {
        cb(
          null,
          addresses.map((address) => ({ address, family: 4 }))
        );
        return;
      }
      cb(null, addresses[0], 4);
    });
  };
}

const lookup = buildLookup(DNS_SERVERS);

function normalizeText(value) {
  return String(value == null ? "" : value)
    .replace(/\s+/g, " ")
    .trim();
}

function isPrivateHost(hostname) {
  const host = String(hostname || "").toLowerCase();
  if (!host) return true;
  if (host === "localhost") return true;
  if (host === "::1" || host === "[::1]") return true;
  if (/^127\./.test(host)) return true;
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)) return true;
  return false;
}

function decodeHeaders(rawHeaders) {
  if (!rawHeaders) return {};
  try {
    const parsed = JSON.parse(rawHeaders);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch {
    return {};
  }
}

function sanitizeUpstreamHeaders(source, reqHeaders = {}) {
  const allowed = new Set([
    "accept",
    "accept-language",
    "cache-control",
    "pragma",
    "range",
    "origin",
    "referer",
    "user-agent",
  ]);
  const out = {};

  if (reqHeaders.range) out.range = String(reqHeaders.range);
  if (reqHeaders["accept-language"]) {
    out["accept-language"] = String(reqHeaders["accept-language"]);
  }

  const input = source && typeof source === "object" ? source : {};
  for (const key of Object.keys(input)) {
    const normalizedKey = String(key || "").toLowerCase();
    if (!allowed.has(normalizedKey)) continue;
    const value = normalizeText(input[key]);
    if (!value) continue;
    out[normalizedKey] = value;
  }
  if (!out.accept) out.accept = "*/*";
  return out;
}

function isLikelyManifest(contentType, url, body) {
  const type = normalizeText(contentType).toLowerCase();
  if (
    type.includes("application/vnd.apple.mpegurl") ||
    type.includes("application/x-mpegurl") ||
    type.includes("audio/mpegurl")
  ) {
    return true;
  }
  const parsedUrl = String(url || "").toLowerCase();
  if (parsedUrl.includes(".m3u8")) return true;
  const text = String(body || "");
  return text.startsWith("#EXTM3U");
}

function buildProxyUrl(targetUrl) {
  const query = new URLSearchParams();
  query.set("url", targetUrl);
  return `/api/player/proxy?${query.toString()}`;
}

function rewriteManifest(manifestText, baseUrl) {
  const lines = String(manifestText || "").split(/\r?\n/);
  const out = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) {
      out.push(line);
      continue;
    }

    if (trimmed.startsWith("#")) {
      // Rewrite URI="..." attributes in tags (#EXT-X-KEY, #EXT-X-MEDIA, ...)
      out.push(
        line.replace(/URI="([^"]+)"/g, (_, uriValue) => {
          try {
            const resolved = new URL(uriValue, baseUrl).href;
            return `URI="${buildProxyUrl(resolved)}"`;
          } catch {
            return `URI="${uriValue}"`;
          }
        })
      );
      continue;
    }

    try {
      const resolved = new URL(trimmed, baseUrl).href;
      out.push(buildProxyUrl(resolved));
    } catch {
      out.push(line);
    }
  }
  return out.join("\n");
}

function requestUpstream(url, headers) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const transport = parsed.protocol === "https:" ? https : http;
    const req = transport.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || undefined,
        path: `${parsed.pathname}${parsed.search}`,
        method: "GET",
        headers,
        timeout: REQUEST_TIMEOUT_MS,
        lookup,
      },
      (res) => resolve(res)
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error(`Upstream timeout: ${url}`)));
    req.end();
  });
}

async function fetchWithRedirects(url, headers, redirectCount = 0) {
  const response = await requestUpstream(url, headers);
  const statusCode = Number(response.statusCode) || 0;

  if (
    statusCode >= 300 &&
    statusCode < 400 &&
    response.headers &&
    response.headers.location
  ) {
    if (redirectCount >= MAX_REDIRECTS) {
      return { finalUrl: url, response };
    }
    const nextUrl = new URL(String(response.headers.location), url).href;
    response.resume();
    return fetchWithRedirects(nextUrl, headers, redirectCount + 1);
  }

  return { finalUrl: url, response };
}

function copyHeadersToClient(upstreamHeaders, res, isManifest) {
  const hopByHop = new Set([
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
  ]);
  for (const [rawKey, rawValue] of Object.entries(upstreamHeaders || {})) {
    const key = String(rawKey || "").toLowerCase();
    if (!key || hopByHop.has(key)) continue;
    if (isManifest && key === "content-length") continue;
    if (rawValue == null) continue;
    res.setHeader(rawKey, rawValue);
  }
  res.setHeader("cache-control", "no-store");
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return json(res, 405, { ok: false, error: "Method not allowed" });
  }

  const urlObj = new URL(req.url || "/", "http://localhost");
  const targetUrl = normalizeText(urlObj.searchParams.get("url"));
  if (!targetUrl) return badRequest(res, "Parametro url mancante");

  let parsedTarget = null;
  try {
    parsedTarget = new URL(targetUrl);
  } catch {
    return badRequest(res, "URL non valido");
  }
  if (!/^https?:$/i.test(parsedTarget.protocol)) {
    return badRequest(res, "Protocollo non supportato");
  }
  if (isPrivateHost(parsedTarget.hostname)) {
    return badRequest(res, "Host non consentito");
  }

  const requestedHeaders = decodeHeaders(urlObj.searchParams.get("headers"));
  const upstreamHeaders = sanitizeUpstreamHeaders(requestedHeaders, req.headers || {});

  try {
    const { finalUrl, response } = await fetchWithRedirects(targetUrl, upstreamHeaders);
    const statusCode = Number(response.statusCode) || 502;
    const contentType = String(response.headers && response.headers["content-type"] || "");
    const shouldHandleAsManifest = isLikelyManifest(contentType, finalUrl, "");

    if (!shouldHandleAsManifest) {
      res.statusCode = statusCode;
      copyHeadersToClient(response.headers, res, false);
      response.pipe(res);
      return;
    }

    const chunks = [];
    response.on("data", (chunk) => chunks.push(chunk));
    response.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      const rewritten = rewriteManifest(raw, finalUrl);
      res.statusCode = statusCode;
      copyHeadersToClient(response.headers, res, true);
      if (!res.getHeader("content-type")) {
        res.setHeader("content-type", "application/vnd.apple.mpegurl; charset=utf-8");
      }
      res.end(rewritten);
    });
    response.on("error", (error) => {
      json(res, 502, {
        ok: false,
        error: normalizeText(error && (error.message || error)) || "Upstream stream error",
      });
    });
  } catch (error) {
    json(res, 502, {
      ok: false,
      error: normalizeText(error && (error.message || error)) || "Proxy stream error",
    });
  }
}

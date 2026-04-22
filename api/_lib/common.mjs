export function normalizeText(value) {
  return String(value == null ? "" : value)
    .replace(/\s+/g, " ")
    .trim();
}

export function decodeHtmlEntities(value) {
  return String(value == null ? "" : value)
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export function safeJsonParse(value, fallback = null) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function toNumber(value, fallback = undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function pickTranslation(translations, key, locale = "it") {
  if (!Array.isArray(translations)) return "";
  const exact = translations.find(
    (entry) => entry && entry.key === key && entry.locale === locale
  );
  if (exact && exact.value != null) return normalizeText(exact.value);
  const anyLocale = translations.find((entry) => entry && entry.key === key);
  return anyLocale && anyLocale.value != null ? normalizeText(anyLocale.value) : "";
}

export function uniqueBy(items, keyFn) {
  const seen = new Set();
  const out = [];
  const source = Array.isArray(items) ? items : [];
  for (const item of source) {
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export function extractDataPage(html) {
  const source = String(html || "");
  const match = source.match(/data-page="([\s\S]*?)"/i);
  if (!match || !match[1]) return null;
  const decoded = decodeHtmlEntities(match[1]);
  const parsed = safeJsonParse(decoded, null);
  if (parsed) return parsed;
  return safeJsonParse(decodeHtmlEntities(decoded), null);
}

export function resolveUrl(baseUrl, input) {
  const value = normalizeText(input);
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("//")) return `https:${value}`;
  try {
    return new URL(value, baseUrl).href;
  } catch {
    return value;
  }
}

export function getQueryString(req) {
  if (!req || !req.url) return "";
  try {
    const url = new URL(req.url, "http://localhost");
    return url.search || "";
  } catch {
    return "";
  }
}

export function getQueryParam(req, key) {
  if (!req || !key) return "";
  try {
    const url = new URL(req.url, "http://localhost");
    return normalizeText(url.searchParams.get(key) || "");
  } catch {
    return "";
  }
}

export function json(res, statusCode, payload, options = {}) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", options.cacheControl || "no-store");
  res.end(`${JSON.stringify(payload)}\n`);
}

export function badRequest(res, message) {
  json(res, 400, {
    ok: false,
    error: normalizeText(message) || "Bad request",
  });
}

export function internalError(res, error) {
  const message = normalizeText(error && (error.message || error)) || "Internal error";
  json(res, 500, {
    ok: false,
    error: message,
  });
}

export function getClientIp(req) {
  const headers = req && req.headers ? req.headers : {};
  const xff = headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.trim()) {
    return xff.split(",")[0].trim();
  }
  const realIp = headers["x-real-ip"];
  if (typeof realIp === "string" && realIp.trim()) {
    return realIp.trim();
  }
  const socketAddress = req && req.socket ? req.socket.remoteAddress : "";
  return normalizeText(socketAddress || "unknown");
}

export function logEvent(name, payload = {}) {
  const record = {
    ts: new Date().toISOString(),
    event: normalizeText(name || "event"),
    ...payload,
  };
  console.log(JSON.stringify(record));
}

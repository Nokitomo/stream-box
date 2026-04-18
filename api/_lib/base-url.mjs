import { createHttpClient } from "./http.mjs";
import { normalizeText } from "./common.mjs";

const PASTEBIN_URL = "https://pastebin.com/raw/KgQ4jTy6";
const MODFLIX_URL = "https://himanshu8443.github.io/providers/modflix.json";
const CACHE_TTL_MS = 60 * 60 * 1000;

const PROVIDER_CONFIG = {
  animeunity: {
    match: /(?:^|\.)animeunity\./i,
    fallback: "https://www.animeunity.so",
  },
  streamingunity: {
    match: /(?:^|\.)streamingunity\./i,
    fallback: "https://streamingunity.biz",
  },
};

const baseCache = new Map();
const sharedClient = createHttpClient({ timeoutMs: 12000, retries: 1 });

function normalizeBaseUrl(value) {
  return String(value || "").replace(/\/+$/, "").trim();
}

async function fromPastebin(provider) {
  const config = PROVIDER_CONFIG[provider];
  if (!config) return "";

  try {
    const response = await sharedClient.request({
      url: PASTEBIN_URL,
      headers: {
        accept: "text/plain",
      },
    });
    if (response.statusCode < 200 || response.statusCode >= 400) return "";

    const lines = String(response.body || "")
      .split(/\r?\n/)
      .map((line) => normalizeText(line))
      .filter(Boolean);

    for (const line of lines) {
      try {
        const host = new URL(line).hostname;
        if (config.match.test(host)) return normalizeBaseUrl(line);
      } catch {
        // ignore invalid lines
      }
    }
    return "";
  } catch {
    return "";
  }
}

async function fromModflix(provider) {
  try {
    const response = await sharedClient.requestJson({
      url: MODFLIX_URL,
      headers: {
        accept: "application/json",
      },
    });
    if (response.statusCode < 200 || response.statusCode >= 400) return "";
    const data = response.data && typeof response.data === "object" ? response.data : {};
    const entry = data[provider] && typeof data[provider] === "object" ? data[provider] : null;
    if (!entry || !entry.url) return "";
    return normalizeBaseUrl(entry.url);
  } catch {
    return "";
  }
}

export async function resolveProviderBaseUrl(provider) {
  const key = normalizeText(provider).toLowerCase();
  const config = PROVIDER_CONFIG[key];
  if (!config) return "";

  const cached = baseCache.get(key);
  const now = Date.now();
  if (cached && now - cached.at < CACHE_TTL_MS && cached.url) {
    return cached.url;
  }

  const fromPastebinUrl = await fromPastebin(key);
  if (fromPastebinUrl) {
    baseCache.set(key, { url: fromPastebinUrl, at: now });
    return fromPastebinUrl;
  }

  const fromModflixUrl = await fromModflix(key);
  const resolved = fromModflixUrl || normalizeBaseUrl(config.fallback);
  baseCache.set(key, { url: resolved, at: now });
  return resolved;
}
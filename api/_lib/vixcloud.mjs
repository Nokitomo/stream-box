function decodeHtmlEntities(value) {
  return String(value || "").replace(/&amp;/g, "&");
}

function decodeEscapedValue(value) {
  return decodeHtmlEntities(
    String(value || "")
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, code) =>
        String.fromCharCode(parseInt(code, 16))
      )
      .replace(/\\\//g, "/")
  );
}

export function normalizeUrl(value) {
  return decodeEscapedValue(value).trim();
}

function safeDecode(value) {
  if (!value) return value;
  try {
    return decodeURIComponent(String(value).replace(/\+/g, " "));
  } catch {
    return value;
  }
}

function getOrigin(url) {
  const match = normalizeUrl(url).match(/^(https?:\/\/[^/?#]+)/i);
  return match && match[1] ? match[1] : "";
}

function extractQueryParamsFromUrl(url) {
  const out = {};
  const source = String(url || "");
  const queryStart = source.indexOf("?");
  if (queryStart === -1) return out;

  const hashStart = source.indexOf("#", queryStart);
  const query = hashStart === -1 ? source.slice(queryStart + 1) : source.slice(queryStart + 1, hashStart);
  if (!query) return out;

  query.split("&").forEach((chunk) => {
    if (!chunk) return;
    const parts = chunk.split("=");
    const key = safeDecode(parts.shift() || "");
    if (!key) return;
    out[key] = safeDecode(parts.join("=") || "");
  });
  return out;
}

function appendQueryParams(url, params) {
  const normalized = normalizeUrl(url);
  if (!normalized) return normalized;

  const sections = normalized.split("#", 2);
  const baseWithQuery = sections[0];
  const hash = sections[1] || "";
  const base = baseWithQuery.split("?")[0];
  const existing = extractQueryParamsFromUrl(baseWithQuery);
  const merged = { ...existing };

  Object.keys(params || {}).forEach((key) => {
    if (!key || merged[key] || !params[key]) return;
    merged[key] = params[key];
  });

  const query = Object.entries(merged)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
  const rebuilt = query ? `${base}?${query}` : base;
  return hash ? `${rebuilt}#${hash}` : rebuilt;
}

function resolveUrl(rawUrl, baseUrl) {
  const normalized = normalizeUrl(rawUrl);
  if (!normalized) return normalized;
  if (normalized.startsWith("http://") || normalized.startsWith("https://")) return normalized;
  if (normalized.startsWith("//")) return `https:${normalized}`;
  const origin = getOrigin(baseUrl);
  if (!origin) return normalized;
  if (normalized.startsWith("/")) return `${origin}${normalized}`;
  return `${origin}/${normalized}`;
}

export function extractFirstUrl(value) {
  const match = String(value || "").match(/https?:\/\/[^\s"'<>]+/);
  return match && match[0] ? normalizeUrl(match[0]) : "";
}

function normalizeHtmlUrls(html) {
  return String(html || "").replace(/\\\//g, "/");
}

function extractEmbedParams(embedUrl) {
  const params = extractQueryParamsFromUrl(embedUrl);
  const out = {};
  if (params.token) out.token = params.token;
  if (params.expires) out.expires = params.expires;
  if (params.asn) out.asn = params.asn;
  return out;
}

function extractEmbedId(embedUrl) {
  const match = normalizeUrl(embedUrl).match(/\/(?:embed|playlist)\/(\d+)/);
  return match && match[1] ? match[1] : "";
}

function extractVideoId(html) {
  const match = String(html || "").match(/window\.video\s*=\s*{[\s\S]*?id\s*:\s*'(\d+)'/);
  return match && match[1] ? match[1] : "";
}

function extractVixCloudIdFromHtml(html) {
  const normalized = normalizeHtmlUrls(html);
  const match = normalized.match(/vixcloud\.co\/(?:embed|playlist)\/(\d+)/);
  return match && match[1] ? match[1] : "";
}

function buildFallbackMasterUrl(html, embedUrl) {
  const id = extractEmbedId(embedUrl) || extractVideoId(html) || extractVixCloudIdFromHtml(html);
  if (!id) return "";
  const origin = getOrigin(embedUrl);
  return origin ? `${origin}/playlist/${id}` : "";
}

function parseStreamsBlock(rawBlock) {
  if (!rawBlock) return [];

  try {
    const parsed = JSON.parse(rawBlock);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => ({
        name: item && item.name ? String(item.name) : "",
        url: item && item.url ? decodeEscapedValue(item.url) : "",
      }));
    }
  } catch {
    // fallback regex parsing
  }

  const out = [];
  const items = String(rawBlock).match(/{[\s\S]*?}/g) || [];
  items.forEach((item, index) => {
    const nameMatch = item.match(/name\s*:\s*['"]([^'"]+)['"]/i);
    const urlMatch = item.match(/url\s*:\s*['"]([^'"]+)['"]/i);
    if (!urlMatch || !urlMatch[1]) return;
    out.push({
      name: nameMatch && nameMatch[1] ? nameMatch[1] : `Server${index + 1}`,
      url: decodeEscapedValue(urlMatch[1]),
    });
  });
  return out;
}

export function buildStreamHeaders(embedUrl, userAgent) {
  const origin = getOrigin(embedUrl);
  const out = {
    Accept: "*/*",
    "User-Agent": userAgent || "Mozilla/5.0",
  };
  if (origin) out.Origin = origin;
  if (embedUrl) out.Referer = embedUrl;
  return out;
}

function extractMasterPlaylistParams(html, embedUrl) {
  const out = {};
  const block = String(html || "").match(
    /window\.masterPlaylist\s*=\s*{[\s\S]*?params\s*:\s*{([\s\S]*?)}[\s\S]*?}/
  );
  const source = block && block[1] ? block[1] : "";
  const regex = /['"]([^'"]+)['"]\s*:\s*'([^']*)'/g;
  let match = null;
  while ((match = regex.exec(source)) !== null) {
    if (match[1] && match[2]) out[match[1]] = match[2];
  }

  if (!out.token) {
    const tokenMatch = String(html || "").match(/['"]token['"]\s*:\s*'([^']*)'/);
    if (tokenMatch && tokenMatch[1]) out.token = tokenMatch[1];
  }
  if (!out.expires) {
    const expMatch = String(html || "").match(/['"]expires['"]\s*:\s*'([^']*)'/);
    if (expMatch && expMatch[1]) out.expires = expMatch[1];
  }
  if (!out.asn) {
    const asnMatch = String(html || "").match(/['"]asn['"]\s*:\s*'([^']*)'/);
    if (asnMatch && asnMatch[1]) out.asn = asnMatch[1];
  }

  const embedParams = extractEmbedParams(embedUrl);
  Object.keys(embedParams).forEach((key) => {
    if (!out[key] && embedParams[key]) out[key] = embedParams[key];
  });

  return out;
}

function extractMasterPlaylistUrl(html, embedUrl) {
  const match = String(html || "").match(
    /window\.masterPlaylist\s*=\s*{[\s\S]*?url\s*:\s*['"]([^'"]+)['"]/ 
  );
  if (match && match[1]) return decodeEscapedValue(match[1]);
  return buildFallbackMasterUrl(html, embedUrl);
}

function canPlayFhd(html, embedUrl) {
  if (/window\.canPlayFHD\s*=\s*true/.test(String(html || ""))) return true;
  const params = extractQueryParamsFromUrl(embedUrl);
  return Object.prototype.hasOwnProperty.call(params, "canPlayFHD") || params.h === "1";
}

function buildPlaylistUrl(rawUrl, embedUrl, params, allowFhd) {
  const resolved = resolveUrl(rawUrl, embedUrl);
  if (!resolved) return "";
  const merged = { ...(params || {}) };
  if (allowFhd && !merged.h) merged.h = "1";
  return appendQueryParams(resolved, merged);
}

export function extractDownloadUrl(html) {
  const direct = String(html || "").match(/window\.downloadUrl\s*=\s*['"]([^'"]+)['"]/);
  if (direct && direct[1]) return decodeEscapedValue(direct[1]);
  const fallback = String(html || "").match(/(https?:\/\/[^\s"'<>]+(?:mp4|m3u8)[^\s"'<>]*)/i);
  return fallback && fallback[1] ? decodeEscapedValue(fallback[1]) : "";
}

export function extractVixCloudStreams(html, embedUrl, userAgent, options = {}) {
  const serverPrefix = String(options.serverPrefix || "AnimeUnity").trim() || "AnimeUnity";
  const streamsMatch = String(html || "").match(/window\.streams\s*=\s*(\[[\s\S]*?\]);/);
  const streams = streamsMatch && streamsMatch[1] ? parseStreamsBlock(streamsMatch[1]) : [];

  const params = extractMasterPlaylistParams(html, embedUrl);
  const masterUrl = extractMasterPlaylistUrl(html, embedUrl);
  const allowFhd = canPlayFhd(html, embedUrl);
  const streamHeaders = buildStreamHeaders(embedUrl, userAgent || "Mozilla/5.0");

  const derived = [];
  if (masterUrl && streams.length < 2) {
    const baseUrl = resolveUrl(masterUrl, embedUrl);
    if (baseUrl) {
      derived.push(
        { name: "Server1", url: appendQueryParams(baseUrl, { ub: "1" }) },
        { name: "Server2", url: appendQueryParams(baseUrl, { ab: "1" }) }
      );
    }
  }

  const fallbackStreams = [];
  const parsed = [...streams, ...derived]
    .filter((entry) => entry && entry.url)
    .map((entry) => {
      const rawUrl = resolveUrl(entry.url, embedUrl);
      if (!rawUrl) return null;
      const playlistUrl = buildPlaylistUrl(rawUrl, embedUrl, params, allowFhd);
      const name = entry.name ? String(entry.name) : "Server";
      const server = `${serverPrefix} ${name}`.trim();
      if (!playlistUrl) {
        fallbackStreams.push({
          server,
          link: rawUrl,
          type: rawUrl.toLowerCase().includes(".mp4") ? "mp4" : "m3u8",
          headers: streamHeaders,
        });
        return null;
      }
      return {
        server,
        link: playlistUrl,
        type: "m3u8",
        headers: streamHeaders,
      };
    })
    .filter(Boolean);

  const uniqueParsed = parsed.filter(
    (stream, index, list) => list.findIndex((entry) => entry.link === stream.link) === index
  );
  if (uniqueParsed.length) return uniqueParsed;

  const uniqueFallback = fallbackStreams.filter(
    (stream, index, list) => list.findIndex((entry) => entry.link === stream.link) === index
  );
  if (uniqueFallback.length) return uniqueFallback;

  if (masterUrl) {
    const playlistUrl = buildPlaylistUrl(masterUrl, embedUrl, params, allowFhd);
    if (playlistUrl) {
      return [
        {
          server: serverPrefix,
          link: playlistUrl,
          type: "m3u8",
          headers: streamHeaders,
        },
      ];
    }
  }

  return [];
}
const cache = new Map();

function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || "").replace(/\/+$/, "");
}

function withLeadingSlash(pathname) {
  const value = String(pathname || "");
  return value.startsWith("/") ? value : `/${value}`;
}

function absoluteUrl(baseUrl, pathname) {
  return `${normalizeBaseUrl(baseUrl)}${withLeadingSlash(pathname)}`;
}

async function fetchJson(url) {
  if (cache.has(url)) return cache.get(url);
  const response = await fetch(url, { cache: "force-cache" });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${url}`);
  }
  const parsed = await response.json();
  cache.set(url, parsed);
  return parsed;
}

function appPath(filePath) {
  const value = String(filePath || "").replace(/^\/+/, "");
  return value.startsWith("data/app/") ? value : `data/app/${value}`;
}

export async function loadCatalogIndex(baseUrl) {
  return fetchJson(absoluteUrl(baseUrl, "/data/app/catalog-index.json"));
}

export async function loadDetailById(contentId, baseUrl) {
  const index = await loadCatalogIndex(baseUrl);
  const summary = Array.isArray(index?.items)
    ? index.items.find((item) => item.id === contentId)
    : null;
  if (!summary?.detailChunk) return null;
  const chunk = await fetchJson(absoluteUrl(baseUrl, `/${appPath(summary.detailChunk)}`));
  const item = Array.isArray(chunk?.items)
    ? chunk.items.find((entry) => entry.id === contentId)
    : null;
  return item || null;
}

export async function loadEpisodesBySeason(contentId, seasonKey, baseUrl) {
  const episodesIndex = await fetchJson(absoluteUrl(baseUrl, "/data/app/episodes-index.json"));
  const chunks = Array.isArray(episodesIndex?.chunks) ? episodesIndex.chunks : [];
  for (const chunkMeta of chunks) {
    const chunk = await fetchJson(absoluteUrl(baseUrl, `/${appPath(chunkMeta.file || "")}`));
    const items = Array.isArray(chunk?.items) ? chunk.items : [];
    const target = items.find(
      (item) => item.contentId === contentId && item.seasonKey === seasonKey
    );
    if (target) return target;
  }
  return null;
}

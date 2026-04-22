import fs from "node:fs/promises";
import path from "node:path";

const rootDir = process.cwd();
const appDataDir = path.join(rootDir, "data", "app");
const cache = new Map();

async function readJson(filePath) {
  if (cache.has(filePath)) return cache.get(filePath);
  const raw = await fs.readFile(filePath, "utf8");
  const parsed = JSON.parse(raw);
  cache.set(filePath, parsed);
  return parsed;
}

export async function loadCatalogIndex() {
  return readJson(path.join(appDataDir, "catalog-index.json"));
}

export async function loadDetailById(contentId) {
  const index = await loadCatalogIndex();
  const summary = Array.isArray(index?.items)
    ? index.items.find((item) => item.id === contentId)
    : null;
  if (!summary?.detailChunk) return null;
  const chunkPath = path.join(appDataDir, String(summary.detailChunk || ""));
  const chunk = await readJson(chunkPath);
  const item = Array.isArray(chunk?.items)
    ? chunk.items.find((entry) => entry.id === contentId)
    : null;
  return item || null;
}

export async function loadEpisodesBySeason(contentId, seasonKey) {
  const episodesIndex = await readJson(path.join(appDataDir, "episodes-index.json"));
  const chunks = Array.isArray(episodesIndex?.chunks) ? episodesIndex.chunks : [];
  for (const chunkMeta of chunks) {
    const chunkPath = path.join(appDataDir, String(chunkMeta.file || ""));
    const chunk = await readJson(chunkPath);
    const items = Array.isArray(chunk?.items) ? chunk.items : [];
    const target = items.find(
      (item) => item.contentId === contentId && item.seasonKey === seasonKey
    );
    if (target) return target;
  }
  return null;
}

import type {
  AppManifest,
  CatalogDetailItem,
  CatalogIndex,
  EpisodesSeasonItem,
  SearchIndexEntry,
} from "../types";

type EpisodeIndexPayload = {
  schemaVersion: number;
  generatedAt: string;
  count: number;
  shardSize: number;
  chunks: Array<{ chunk: number; file: string; count: number; from: number; to: number }>;
};

const cache = new Map<string, unknown>();

async function fetchJson<T>(url: string): Promise<T> {
  if (cache.has(url)) return cache.get(url) as T;
  const response = await fetch(url, { cache: "force-cache" });
  if (!response.ok) throw new Error(`HTTP ${response.status} ${url}`);
  const data = (await response.json()) as T;
  cache.set(url, data);
  return data;
}

function normalizePath(path: string): string {
  return `/${String(path || "").replace(/^\/+/, "")}`;
}

function splitProviderLocalId(contentId: string): { provider: string; localId: string } {
  const dash = contentId.indexOf("-");
  if (dash <= 0) return { provider: "", localId: contentId };
  return {
    provider: contentId.slice(0, dash),
    localId: contentId.slice(dash + 1),
  };
}

function buildAnimeUnityPlaybackFallback(detail: CatalogDetailItem): CatalogDetailItem {
  if (detail.provider !== "animeunity") return detail;
  const result = { ...detail };
  const episodesCount = Number(detail.episodesCount || 0);
  const localId = splitProviderLocalId(detail.id).localId;
  const linkList: CatalogDetailItem["playback"] = { linkList: [] };
  if (episodesCount > 0 && localId) {
    const chunk = 120;
    let start = 1;
    let seasonNumber = 1;
    while (start <= episodesCount) {
      const end = Math.min(start + chunk - 1, episodesCount);
      linkList.linkList.push({
        title: `Episodi ${start}-${end}`,
        seasonNumber,
        seasonKey: `range-${start}-${end}`,
        episodesLink: `${localId}|${start}|${end}`,
        availabilityStatus: "available",
      });
      seasonNumber += 1;
      start = end + 1;
    }
  } else if (localId) {
    linkList.linkList.push({
      title: "Episodi",
      seasonNumber: 1,
      seasonKey: "default",
      episodesLink: localId,
      availabilityStatus: "available",
    });
  }
  result.playback = linkList;
  return result;
}

function buildStreamingUnityPlaybackFallback(detail: CatalogDetailItem): CatalogDetailItem {
  if (detail.provider !== "streamingunity") return detail;
  const result = { ...detail };
  const linkList: CatalogDetailItem["playback"] = { linkList: [] };
  const page = detail.links?.page || "";
  const seasons = Array.isArray(detail.seasons) ? detail.seasons : [];
  if (seasons.length > 0 && page) {
    const sorted = [...seasons].sort((a, b) => (a.number || 0) - (b.number || 0));
    for (const season of sorted) {
      const seasonNumber = Number(season.number || 0) || undefined;
      if (!seasonNumber) continue;
      linkList.linkList.push({
        title: season.name || `Stagione ${seasonNumber}`,
        seasonNumber,
        seasonKey: `season-${seasonNumber}`,
        episodesLink: `${page}/season-${seasonNumber}`,
        availabilityStatus: "available",
      });
    }
  } else if (detail.links?.watch || detail.links?.source) {
    linkList.linkList.push({
      title: "Riproduci",
      seasonKey: "movie",
      availabilityStatus: "available",
      directLinks: [
        {
          title: "Riproduci",
          link: detail.links.watch || detail.links.source || "",
          type: "movie",
        },
      ],
    });
  }
  result.playback = linkList;
  return result;
}

export class CatalogClient {
  private manifest: AppManifest | null = null;

  private index: CatalogIndex | null = null;

  private detailsChunks = new Map<string, CatalogDetailItem[]>();

  private detailsMap = new Map<string, CatalogDetailItem>();

  private searchIndex: SearchIndexEntry[] | null = null;

  private episodesManifest: EpisodeIndexPayload | null = null;

  private episodesBySeason = new Map<string, EpisodesSeasonItem>();

  async getManifest(): Promise<AppManifest | null> {
    if (this.manifest) return this.manifest;
    try {
      this.manifest = await fetchJson<AppManifest>("/data/app/manifest.json");
      return this.manifest;
    } catch {
      return null;
    }
  }

  async getIndex(): Promise<CatalogIndex> {
    if (this.index) return this.index;
    const manifest = await this.getManifest();
    const indexPath = manifest?.datasets?.catalogIndex || "data/app/catalog-index.json";
    this.index = await fetchJson<CatalogIndex>(normalizePath(indexPath));
    return this.index;
  }

  async getDetail(contentId: string): Promise<CatalogDetailItem | null> {
    if (this.detailsMap.has(contentId)) return this.detailsMap.get(contentId) || null;
    const index = await this.getIndex();
    const summary = index.items.find((item) => item.id === contentId);
    if (!summary || !summary.detailChunk) return null;
    if (!this.detailsChunks.has(summary.detailChunk)) {
      const payload = await fetchJson<{ items: CatalogDetailItem[] }>(
        normalizePath(`/data/app/${summary.detailChunk}`)
      );
      this.detailsChunks.set(summary.detailChunk, payload.items || []);
      for (const item of payload.items || []) this.detailsMap.set(item.id, item);
    }
    const raw = this.detailsMap.get(contentId) || null;
    if (!raw) return null;
    if (raw.playback && Array.isArray(raw.playback.linkList) && raw.playback.linkList.length > 0) {
      return raw;
    }
    return buildStreamingUnityPlaybackFallback(buildAnimeUnityPlaybackFallback(raw));
  }

  async getSearchEntries(): Promise<SearchIndexEntry[]> {
    if (this.searchIndex) return this.searchIndex;
    const manifest = await this.getManifest();
    const path = manifest?.datasets?.searchIndex;
    if (path) {
      this.searchIndex = await fetchJson<SearchIndexEntry[]>(normalizePath(path));
      return this.searchIndex;
    }
    const index = await this.getIndex();
    this.searchIndex = index.items.map((item) => ({
      id: item.id,
      provider: item.provider,
      title: item.title,
      type: item.type,
      year: item.year,
      aliases: item.genres || [],
      tokens: [item.title, ...(item.genres || []), ...(item.categoryTags || [])]
        .join(" ")
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(Boolean),
    }));
    return this.searchIndex;
  }

  async getEpisodes(contentId: string, seasonKey: string): Promise<EpisodesSeasonItem | null> {
    const compoundKey = `${contentId}::${seasonKey}`;
    if (this.episodesBySeason.has(compoundKey)) return this.episodesBySeason.get(compoundKey) || null;
    if (!this.episodesManifest) {
      const manifest = await this.getManifest();
      const episodesPath = manifest?.datasets?.episodesIndex;
      if (!episodesPath) return null;
      this.episodesManifest = await fetchJson<EpisodeIndexPayload>(normalizePath(episodesPath));
    }
    if (!this.episodesManifest) return null;
    for (const chunk of this.episodesManifest.chunks) {
      const payload = await fetchJson<{ items: EpisodesSeasonItem[] }>(
        normalizePath(`/data/app/${chunk.file}`)
      );
      for (const item of payload.items || []) {
        const key = `${item.contentId}::${item.seasonKey}`;
        this.episodesBySeason.set(key, item);
      }
      if (this.episodesBySeason.has(compoundKey)) {
        return this.episodesBySeason.get(compoundKey) || null;
      }
    }
    return null;
  }
}

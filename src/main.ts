import "./styles.css";
import type {
  CatalogDetailItem,
  CatalogSummaryItem,
  EpisodeLink,
  PlaybackLink,
  Provider,
  SearchIndexEntry,
  Stream,
  WatchlistItem,
} from "./types";
import { CatalogClient } from "./lib/catalog";
import { buildProxyUrl, fetchEpisodesFromProvider, fetchStreams } from "./lib/api";
import {
  getHistory,
  getProgressById,
  getSettings,
  getWatchlist,
  pushHistory,
  removeWatchlist,
  updateSettings,
  upsertProgress,
  upsertWatchlist,
} from "./lib/storage";
import { getCurrentSession, getSupabaseClient, signInWithEmail, signOut } from "./lib/supabase";
import { runInitialSync } from "./lib/sync";

const appElement = document.querySelector<HTMLDivElement>("#app");
if (!appElement) throw new Error("Elemento radice dell'app non trovato");
const app = appElement;

const catalog = new CatalogClient();

type Route =
  | { name: "home" }
  | { name: "search"; query: string }
  | { name: "info"; id: string; seasonKey?: string }
  | { name: "player"; id: string; provider: Provider; link: string; episodeTitle?: string; seasonKey?: string }
  | { name: "watchlist" }
  | { name: "history" }
  | { name: "settings" };

let renderToken = 0;
const HOME_CATEGORY_LIMIT = 30;
const STREAMINGUNITY_FALLBACK_REFERER = "https://streamingunity.biz/";
const BROWSER_SUPPORTS_WEBP = detectWebpSupport();

type HomeCategory = {
  id: string;
  title: string;
  items: CatalogSummaryItem[];
};

type ImageFallbackPlan = {
  primary: string;
  fallback1?: string;
  fallback2?: string;
};

function escapeHtml(value: string): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function parseRoute(): Route {
  const raw = String(location.hash || "#/home");
  const [pathRaw, queryRaw = ""] = raw.replace(/^#/, "").split("?", 2);
  const path = pathRaw || "/home";
  const query = new URLSearchParams(queryRaw);

  if (path === "/home" || path === "/") return { name: "home" };
  if (path === "/search") return { name: "search", query: query.get("q") || "" };
  if (path.startsWith("/info/")) {
    return {
      name: "info",
      id: decodeURIComponent(path.replace("/info/", "")),
      seasonKey: query.get("season") || undefined,
    };
  }
  if (path.startsWith("/player/")) {
    return {
      name: "player",
      id: decodeURIComponent(path.replace("/player/", "")),
      provider: (query.get("provider") || "animeunity") as Provider,
      link: query.get("link") || "",
      episodeTitle: query.get("episodeTitle") || undefined,
      seasonKey: query.get("season") || undefined,
    };
  }
  if (path === "/watchlist") return { name: "watchlist" };
  if (path === "/history") return { name: "history" };
  if (path === "/settings") return { name: "settings" };
  return { name: "home" };
}

function nav(): string {
  return `<header class="topbar">
    <a href="#/home" class="brand">Vega</a>
    <nav class="menu">
      <a href="#/home">Home</a>
      <a href="#/search">Cerca</a>
      <a href="#/watchlist">La mia lista</a>
      <a href="#/history">Cronologia</a>
      <a href="#/settings">Impostazioni</a>
    </nav>
  </header>`;
}

function toProviderLabel(provider: Provider): string {
  return provider === "animeunity" ? "AnimeUnity" : "StreamingUnity";
}

function toTypeLabel(type: "movie" | "series"): string {
  return type === "movie" ? "Film" : "Serie";
}

function toPlaybackLabel(title: string): string {
  const text = String(title || "").trim();
  const episodesRange = text.match(/^Episodes\s+(\d+)-(\d+)$/i);
  if (episodesRange) {
    return `Episodi ${episodesRange[1]}-${episodesRange[2]}`;
  }
  if (/^Episodes$/i.test(text)) return "Episodi";
  const season = text.match(/^Season\s+(\d+)$/i);
  if (season) return `Stagione ${season[1]}`;
  if (/^Play$/i.test(text)) return "Riproduci";
  return text;
}

function detectWebpSupport(): boolean {
  try {
    const canvas = document.createElement("canvas");
    if (!canvas.getContext) return false;
    return canvas.toDataURL("image/webp").indexOf("data:image/webp") === 0;
  } catch {
    return false;
  }
}

function parseHostFromUrl(value: string): string {
  try {
    const parsed = new URL(value);
    return parsed.origin;
  } catch {
    return "";
  }
}

function toWeservJpegUrl(sourceUrl: string): string {
  const normalized = String(sourceUrl || "").replace(/^https?:\/\//i, "");
  return `https://images.weserv.nl/?url=${encodeURIComponent(normalized)}&output=jpg&q=82`;
}

function getImageFallbackPlan(
  provider: Provider,
  sourceUrl: string,
  providerPageUrl = ""
): ImageFallbackPlan | null {
  const image = String(sourceUrl || "").trim();
  if (!image) return null;
  if (provider !== "streamingunity") {
    return { primary: image };
  }
  const referer = parseHostFromUrl(providerPageUrl) || STREAMINGUNITY_FALLBACK_REFERER;
  const proxy = buildProxyUrl(image, {
    referer,
    origin: referer,
  });
  const weserv = toWeservJpegUrl(image);
  if (BROWSER_SUPPORTS_WEBP) {
    return { primary: image, fallback1: proxy, fallback2: weserv };
  }
  return { primary: weserv, fallback1: proxy, fallback2: image };
}

function renderImageMarkup(
  plan: ImageFallbackPlan | null,
  className: string,
  alt: string,
  loading: "lazy" | "eager" = "lazy"
): string {
  const attrs = [
    `class="${escapeHtml(className)}"`,
    `alt="${escapeHtml(alt)}"`,
    `loading="${loading}"`,
    "decoding=\"async\"",
  ];
  if (!plan || !plan.primary) {
    attrs.push("src=\"\"");
    return `<img ${attrs.join(" ")} />`;
  }
  attrs.push(`src="${escapeHtml(plan.primary)}"`);
  if (plan.fallback1) attrs.push(`data-fallback-1="${escapeHtml(plan.fallback1)}"`);
  if (plan.fallback2) attrs.push(`data-fallback-2="${escapeHtml(plan.fallback2)}"`);
  return `<img ${attrs.join(" ")} />`;
}

function setupAdaptiveImages(): void {
  const images = app.querySelectorAll<HTMLImageElement>("img[data-fallback-1], img[data-fallback-2]");
  images.forEach((image) => {
    if (image.getAttribute("data-fallback-bound") === "1") return;
    image.setAttribute("data-fallback-bound", "1");
    image.addEventListener("error", () => {
      const fallback1 = image.getAttribute("data-fallback-1") || "";
      const fallback2 = image.getAttribute("data-fallback-2") || "";
      const exhausted = image.getAttribute("data-fallback-exhausted") === "1";
      if (!exhausted && fallback1 && image.src !== fallback1) {
        image.setAttribute("data-fallback-exhausted", "1");
        image.src = fallback1;
        return;
      }
      if (fallback2 && image.src !== fallback2) {
        image.setAttribute("data-fallback-2", "");
        image.src = fallback2;
        return;
      }
      image.classList.add("image-load-failed");
    });
  });
}

function poster(summary: CatalogSummaryItem, options?: { row?: boolean; clone?: boolean }): string {
  const row = options?.row === true;
  const clone = options?.clone === true;
  const image = summary.poster || summary.backdrop;
  const safeTitle = escapeHtml(summary.title);
  const meta = `${summary.year} · ${toProviderLabel(summary.provider)} · ${toTypeLabel(summary.type)}`;
  const cardClass = row ? "card row-card" : "card";
  const cloneAttrs = clone ? `aria-hidden="true" tabindex="-1"` : "";
  const imagePlan = getImageFallbackPlan(summary.provider, image, summary.sourceLink);
  return `<article class="${cardClass}">
    <a href="#/info/${encodeURIComponent(summary.id)}" class="card-link" ${cloneAttrs}>
      <div class="card-poster">
        ${renderImageMarkup(imagePlan, "card-poster-image", summary.title)}
      </div>
      <div class="card-body">
        <h3>${safeTitle}</h3>
        <p>${escapeHtml(meta)}</p>
      </div>
    </a>
  </article>`;
}

function normalizeTokens(text: string): string[] {
  return String(text || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function hasAnyTag(item: CatalogSummaryItem, tags: string[]): boolean {
  const source = new Set((item.categoryTags || []).map((entry) => String(entry || "").toLowerCase()));
  return tags.some((tag) => source.has(tag));
}

function hasAnyGenre(item: CatalogSummaryItem, terms: string[]): boolean {
  const source = new Set((item.genres || []).map((entry) => normalizeTokens(entry).join(" ")).filter(Boolean));
  return terms.some((term) => source.has(normalizeTokens(term).join(" ")));
}

function scoreForHome(item: CatalogSummaryItem): number {
  const viewsScore = Math.min(item.views || 0, 5_000_000) / 20_000;
  const dailyScore = (item.dailyViews || 0) * 3;
  const scoreBoost = (item.score || 0) * 22;
  const matchBoost = item.match || 0;
  const freshnessBoost = item.isNew ? 90 : 0;
  return Math.round(viewsScore + dailyScore + scoreBoost + matchBoost + freshnessBoost);
}

function sortForHome(items: CatalogSummaryItem[]): CatalogSummaryItem[] {
  return [...items].sort((a, b) => {
    const delta = scoreForHome(b) - scoreForHome(a);
    if (delta !== 0) return delta;
    return a.title.localeCompare(b.title, "it");
  });
}

function uniqueById(items: CatalogSummaryItem[]): CatalogSummaryItem[] {
  const map = new Map<string, CatalogSummaryItem>();
  for (const item of items) {
    if (!map.has(item.id)) map.set(item.id, item);
  }
  return [...map.values()];
}

function toHomeCategory(
  id: string,
  title: string,
  source: CatalogSummaryItem[],
  predicate: (item: CatalogSummaryItem) => boolean
): HomeCategory | null {
  const items = uniqueById(sortForHome(source.filter(predicate))).slice(0, HOME_CATEGORY_LIMIT);
  if (items.length === 0) return null;
  return { id, title, items };
}

function buildHomeCategories(items: CatalogSummaryItem[]): HomeCategory[] {
  const categories: Array<HomeCategory | null> = [
    toHomeCategory("in-evidenza", "In evidenza", items, () => true),
    toHomeCategory("nuove-uscite", "Nuove uscite", items, (item) => item.isNew || item.year >= new Date().getFullYear() - 1),
    toHomeCategory("film", "Film", items, (item) => item.type === "movie"),
    toHomeCategory("serie-tv", "Serie TV", items, (item) => item.type === "series"),
    toHomeCategory("anime", "Anime", items, (item) => item.provider === "animeunity" || hasAnyTag(item, ["anime"])),
    toHomeCategory("azione", "Azione", items, (item) =>
      hasAnyTag(item, ["azione"]) || hasAnyGenre(item, ["action", "azione", "adventure", "avventura"])
    ),
    toHomeCategory("crime-thriller", "Crime e Thriller", items, (item) =>
      hasAnyTag(item, ["crime", "thriller"]) || hasAnyGenre(item, ["crime", "thriller", "mystery", "mistero"])
    ),
    toHomeCategory("fantasy-scifi", "Fantasy e Fantascienza", items, (item) =>
      hasAnyTag(item, ["fantasy", "fantascienza"]) || hasAnyGenre(item, ["fantasy", "science fiction", "sci fi", "sci-fi"])
    ),
    toHomeCategory("commedie", "Commedie", items, (item) =>
      hasAnyTag(item, ["commedie"]) || hasAnyGenre(item, ["comedy", "commedia", "sitcom"])
    ),
    toHomeCategory("documentari", "Documentari", items, (item) =>
      hasAnyTag(item, ["documentari"]) || hasAnyGenre(item, ["documentary", "documentario"])
    ),
  ];
  return categories.filter((item): item is HomeCategory => Boolean(item));
}

function setupHomeInfiniteRows(): void {
  const rows = app.querySelectorAll<HTMLElement>(".row-scroll[data-infinite='1']");
  rows.forEach((row) => {
    const track = row.querySelector<HTMLElement>(".row-track");
    if (!track) return;
    const loopWidth = track.scrollWidth / 2;
    if (!Number.isFinite(loopWidth) || loopWidth <= 0) return;
    row.scrollLeft = loopWidth;

    row.addEventListener(
      "wheel",
      (event) => {
        if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
        event.preventDefault();
        row.scrollLeft += event.deltaY;
      },
      { passive: false }
    );

    row.addEventListener("scroll", () => {
      if (row.scrollLeft <= 0) {
        row.scrollLeft += loopWidth;
        return;
      }
      const maxBeforeReset = loopWidth * 2 - row.clientWidth;
      if (row.scrollLeft >= maxBeforeReset) {
        row.scrollLeft -= loopWidth;
      }
    });
  });
}

function resolveStreamUrl(provider: Provider, stream: Stream, forceProxy: boolean): string {
  const settings = getSettings();
  if (provider === "animeunity") {
    if (forceProxy || settings.preferProxyPlayback) {
      return buildProxyUrl(stream.link, stream.headers);
    }
    return stream.link;
  }
  if (forceProxy) return buildProxyUrl(stream.link, stream.headers);
  const isManifest = /\.m3u8($|\?)/i.test(stream.link) || String(stream.type || "").toLowerCase() === "m3u8";
  if (stream.headers && Object.keys(stream.headers).length > 0) {
    return buildProxyUrl(stream.link, stream.headers);
  }
  if (isManifest) {
    if (!settings.preferDirectPlayback || settings.preferProxyPlayback) {
      return buildProxyUrl(stream.link, stream.headers);
    }
  }
  return stream.link;
}

function isDirectMediaLink(link: string): boolean {
  const value = String(link || "").trim();
  if (!/^https?:\/\//i.test(value)) return false;
  if (/\.(mp4|m3u8|mpd|webm)(\?|$)/i.test(value)) return true;
  return /\/DDL\//i.test(value);
}

function streamFromDirectLink(provider: Provider, link: string): Stream | null {
  if (!isDirectMediaLink(link)) return null;
  const type = /\.m3u8(\?|$)/i.test(link) ? "m3u8" : "mp4";
  return {
    server: provider === "animeunity" ? "AnimeUnity Diretto" : "Diretto",
    link,
    type,
  };
}

function splitProviderLocalId(contentId: string): { provider: Provider; localId: string } {
  const dash = contentId.indexOf("-");
  if (dash <= 0) return { provider: "animeunity", localId: contentId };
  const provider = contentId.slice(0, dash).toLowerCase() === "streamingunity" ? "streamingunity" : "animeunity";
  return {
    provider,
    localId: contentId.slice(dash + 1),
  };
}

async function getSummaryById(id: string): Promise<CatalogSummaryItem | null> {
  const index = await catalog.getIndex();
  return index.items.find((item) => item.id === id) || null;
}

async function getEpisodesForLink(
  detail: CatalogDetailItem,
  season: PlaybackLink
): Promise<EpisodeLink[]> {
  if (Array.isArray(season.directLinks) && season.directLinks.length > 0) {
    return season.directLinks.map((link) => ({
      title: link.title,
      episodeNumber: link.episodeNumber,
      seasonNumber: link.seasonNumber,
      link: link.link,
    }));
  }

  const seasonKey = season.seasonKey || season.episodesLink || "default";
  const staticEpisodes = await catalog.getEpisodes(detail.id, seasonKey);
  if (staticEpisodes && Array.isArray(staticEpisodes.episodes) && staticEpisodes.episodes.length > 0) {
    return staticEpisodes.episodes;
  }

  if (!season.episodesLink) return [];
  return fetchEpisodesFromProvider(detail.provider, season.episodesLink);
}

function toggleWatchlist(summary: CatalogSummaryItem): boolean {
  const watchlist = getWatchlist();
  const exists = watchlist.some((item) => item.id === summary.id);
  if (exists) {
    removeWatchlist(summary.id);
    return false;
  }
  const item: WatchlistItem = {
    id: summary.id,
    provider: summary.provider,
    title: summary.title,
    poster: summary.poster,
    sourceLink: summary.sourceLink,
    addedAt: new Date().toISOString(),
  };
  upsertWatchlist(item);
  return true;
}

async function renderHome(token: number): Promise<void> {
  const index = await catalog.getIndex();
  if (token !== renderToken) return;
  const categories = buildHomeCategories(index.items);
  const sections = categories
    .map((category) => {
      const baseItems = category.items.slice(0, HOME_CATEGORY_LIMIT);
      const loopItems = baseItems.length > 1 ? [...baseItems, ...baseItems] : baseItems;
      const cards = loopItems
        .map((item, idx) => poster(item, { row: true, clone: idx >= baseItems.length }))
        .join("");
      return `<section class="section category-section">
        <h2>${escapeHtml(category.title)}</h2>
        <div class="row-scroll" data-infinite="${baseItems.length > 1 ? "1" : "0"}">
          <div class="row-track">${cards}</div>
        </div>
      </section>`;
    })
    .join("");
  app.innerHTML = `${nav()}<main class="container">${sections}</main>`;
  setupHomeInfiniteRows();
  setupAdaptiveImages();
}

async function renderSearch(query: string, token: number): Promise<void> {
  const entries = await catalog.getSearchEntries();
  if (token !== renderToken) return;
  const tokens = normalizeTokens(query);
  const scored = entries
    .map((entry) => {
      if (!tokens.length) return { entry, score: 0 };
      const haystack = new Set(entry.tokens);
      let score = 0;
      for (const term of tokens) {
        if (haystack.has(term)) score += 1;
      }
      const inTitle = normalizeTokens(entry.title).join(" ").includes(tokens.join(" "));
      if (inTitle) score += 3;
      return { entry, score };
    })
    .filter((item) => !tokens.length || item.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title))
    .slice(0, 300);

  const byId = new Map((await catalog.getIndex()).items.map((item) => [item.id, item]));
  const cards = scored
    .map((item) => byId.get(item.entry.id))
    .filter((item): item is CatalogSummaryItem => Boolean(item))
    .map((item) => poster(item))
    .join("");

  app.innerHTML = `${nav()}<main class="container">
    <section class="section">
      <h2>Cerca</h2>
      <form id="search-form" class="search-form">
        <input name="q" value="${escapeHtml(query)}" placeholder="Cerca per titolo, tag, cast..." />
        <button type="submit">Cerca</button>
      </form>
      <p class="muted">${scored.length} risultati</p>
      <div class="grid">${cards || `<p>Nessun risultato</p>`}</div>
    </section>
  </main>`;

  const form = document.querySelector<HTMLFormElement>("#search-form");
  setupAdaptiveImages();
  if (form) {
    form.onsubmit = (event) => {
      event.preventDefault();
      const value = String(new FormData(form).get("q") || "");
      location.hash = `#/search?q=${encodeURIComponent(value)}`;
    };
  }
}

function renderSeasonButtons(detail: CatalogDetailItem, selectedSeasonKey?: string): string {
  const links = detail.playback?.linkList || [];
  return links
    .map((item) => {
      const seasonKey = item.seasonKey || item.episodesLink || item.title;
      const active = selectedSeasonKey === seasonKey ? "active" : "";
      const upcoming = item.availabilityStatus === "upcoming";
      const href = upcoming
        ? "#"
        : `#/info/${encodeURIComponent(detail.id)}?season=${encodeURIComponent(seasonKey)}`;
      return `<a class="pill ${active} ${upcoming ? "disabled" : ""}" href="${href}" data-season-key="${escapeHtml(
        seasonKey
      )}">${escapeHtml(toPlaybackLabel(item.title))}</a>`;
    })
    .join("");
}

async function renderInfo(id: string, seasonKey: string | undefined, token: number): Promise<void> {
  const [detail, summary] = await Promise.all([catalog.getDetail(id), getSummaryById(id)]);
  if (token !== renderToken) return;
  if (!detail || !summary) {
    app.innerHTML = `${nav()}<main class="container"><p>Contenuto non trovato</p></main>`;
    return;
  }

  const links = detail.playback?.linkList || [];
  const selected =
    links.find((item) => (item.seasonKey || item.episodesLink || item.title) === seasonKey) ||
    links.find((item) => item.availabilityStatus !== "upcoming") ||
    links[0];
  const selectedKey = selected ? selected.seasonKey || selected.episodesLink || selected.title : undefined;
  const episodes = selected ? await getEpisodesForLink(detail, selected) : [];
  if (token !== renderToken) return;

  const watchlist = getWatchlist();
  const inWatchlist = watchlist.some((item) => item.id === summary.id);
  const description = detail.synopsis || summary.description || "Sinossi non disponibile.";
  const image = detail.images.background || detail.images.image || summary.backdrop || summary.poster;
  const heroImagePlan = getImageFallbackPlan(
    detail.provider,
    image,
    detail.links.page || detail.links.source || summary.sourceLink || ""
  );

  const episodesHtml =
    episodes.length > 0
      ? `<ol class="episode-list">${episodes
          .map((episode) => {
            const playerHref = `#/player/${encodeURIComponent(detail.id)}?provider=${encodeURIComponent(
              detail.provider
            )}&link=${encodeURIComponent(episode.link)}&season=${encodeURIComponent(
              selectedKey || ""
            )}&episodeTitle=${encodeURIComponent(episode.title)}`;
            return `<li><a href="${playerHref}">${escapeHtml(episode.title)}</a></li>`;
          })
          .join("")}</ol>`
      : `<p class="muted">Episodi non disponibili al momento.</p>`;

  app.innerHTML = `${nav()}<main class="container">
    <section class="hero">
      ${renderImageMarkup(heroImagePlan, "hero-image", detail.title, "eager")}
      <div class="overlay">
        <h1>${escapeHtml(detail.title)}</h1>
        <p>${escapeHtml(description)}</p>
        <p class="muted">${escapeHtml(
          `${toProviderLabel(detail.provider)} · ${toTypeLabel(detail.type)} · ${detail.year} · ${detail.maturity}`
        )}</p>
        <div class="actions">
          <button id="watchlist-toggle">${inWatchlist ? "Rimuovi dalla Lista" : "Aggiungi alla Lista"}</button>
          ${
            selected && episodes.length > 0
              ? `<a class="button-link" href="#/player/${encodeURIComponent(detail.id)}?provider=${encodeURIComponent(
                  detail.provider
                )}&link=${encodeURIComponent(episodes[0].link)}&season=${encodeURIComponent(
                  selectedKey || ""
                )}&episodeTitle=${encodeURIComponent(episodes[0].title)}">Riproduci</a>`
              : ""
          }
        </div>
      </div>
    </section>

    <section class="section">
      <h2>Stagioni / Sorgenti</h2>
      <div class="pill-wrap">${renderSeasonButtons(detail, selectedKey)}</div>
      ${selected?.availabilityStatus === "upcoming" ? `<p class="muted">Disponibile in futuro</p>` : episodesHtml}
    </section>
    <section class="section">
      <h2>Dettagli</h2>
      <p><strong>Generi:</strong> ${escapeHtml((detail.genres || []).join(", ") || "N/D")}</p>
      <p><strong>Cast:</strong> ${escapeHtml((detail.cast || []).join(", ") || "N/D")}</p>
      <p><strong>Valutazione:</strong> ${escapeHtml(String(detail.score || summary.score || "N/D"))}</p>
      <p><strong>Qualità:</strong> ${escapeHtml(String(detail.quality || "N/D"))}</p>
    </section>
  </main>`;

  const watchlistButton = document.querySelector<HTMLButtonElement>("#watchlist-toggle");
  if (watchlistButton) {
    watchlistButton.onclick = () => {
      const nowInWatchlist = toggleWatchlist(summary);
      watchlistButton.textContent = nowInWatchlist ? "Rimuovi dalla Lista" : "Aggiungi alla Lista";
    };
  }
  setupAdaptiveImages();
}

function setupPlayerBehavior(
  detail: CatalogDetailItem | null,
  route: Extract<Route, { name: "player" }>,
  streams: Stream[]
): void {
  const video = document.querySelector<HTMLVideoElement>("#video-player");
  const list = document.querySelector<HTMLDivElement>("#streams-list");
  if (!video || !list || streams.length === 0) return;
  const videoElement = video;
  const listElement = list;

  const settings = getSettings();
  let currentStream = streams[0];
  let forceProxy = settings.preferProxyPlayback;
  let hasFallbackAttempt = false;
  const progressKey = route.id;
  const summaryTitle = detail?.title || route.id;
  const poster = detail?.images.poster || detail?.images.image || "";

  const progress = getProgressById(progressKey);

  function setTracks(stream: Stream): void {
    const existing = videoElement.querySelectorAll("track[data-stream-sub]");
    existing.forEach((node) => node.remove());
    const subtitles = Array.isArray(stream.subtitles) ? stream.subtitles : [];
    subtitles.forEach((sub, index) => {
      const track = document.createElement("track");
      track.kind = "subtitles";
      track.label = sub.title || `Sub ${index + 1}`;
      track.srclang = sub.language || "it";
      track.src = sub.uri;
      track.default = index === 0;
      track.setAttribute("data-stream-sub", "1");
      videoElement.appendChild(track);
    });
  }

  function setSource(stream: Stream): void {
    const url = resolveStreamUrl(route.provider, stream, forceProxy);
    videoElement.src = url;
    setTracks(stream);
    videoElement.play().catch(() => {
      // autoplay blocked
    });
  }

  function pushProgress(): void {
    if (!videoElement.duration || !Number.isFinite(videoElement.duration) || !videoElement.currentTime) return;
    upsertProgress({
      id: progressKey,
      provider: route.provider,
      title: summaryTitle,
      poster,
      sourceLink: detail?.links.source || "",
      seasonKey: route.seasonKey,
      episodeLink: route.link,
      episodeTitle: route.episodeTitle,
      position: Math.floor(videoElement.currentTime),
      duration: Math.floor(videoElement.duration),
      updatedAt: new Date().toISOString(),
    });
  }

  function setActiveButton(server: string): void {
    const buttons = listElement.querySelectorAll<HTMLButtonElement>("button[data-server]");
    buttons.forEach((button) => {
      if (button.getAttribute("data-server") === server) button.classList.add("active");
      else button.classList.remove("active");
    });
  }

  streams.forEach((stream) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = `${stream.server}${stream.quality ? ` (${stream.quality}p)` : ""}`;
    button.setAttribute("data-server", stream.server);
    button.onclick = () => {
      currentStream = stream;
      forceProxy = settings.preferProxyPlayback;
      hasFallbackAttempt = false;
      setSource(stream);
      setActiveButton(stream.server);
    };
    listElement.appendChild(button);
  });

  videoElement.addEventListener("loadedmetadata", () => {
    if (progress && progress.episodeLink === route.link && progress.position > 0) {
      videoElement.currentTime = Math.min(progress.position, Math.max(1, (videoElement.duration || 0) - 1));
    }
  });

  let lastSaved = 0;
  videoElement.addEventListener("timeupdate", () => {
    const now = Date.now();
    if (now - lastSaved > 5000) {
      pushProgress();
      lastSaved = now;
    }
  });

  videoElement.addEventListener("ended", () => {
    pushHistory({
      id: route.id,
      provider: route.provider,
      title: summaryTitle,
      poster,
      sourceLink: detail?.links.source || "",
      watchedAt: new Date().toISOString(),
      seasonKey: route.seasonKey,
      episodeLink: route.link,
      episodeTitle: route.episodeTitle,
    });
  });

  videoElement.addEventListener("error", () => {
    if (route.provider === "animeunity") {
      if (!hasFallbackAttempt && !forceProxy) {
        hasFallbackAttempt = true;
        forceProxy = true;
        setSource(currentStream);
      }
      return;
    }
    if (!hasFallbackAttempt && !forceProxy) {
      hasFallbackAttempt = true;
      forceProxy = true;
      setSource(currentStream);
    }
  });

  setActiveButton(currentStream.server);
  setSource(currentStream);
}

async function renderPlayer(route: Extract<Route, { name: "player" }>, token: number): Promise<void> {
  if (!route.link) {
    app.innerHTML = `${nav()}<main class="container"><p>Link episodio mancante</p></main>`;
    return;
  }
  const detail = await catalog.getDetail(route.id);
  const directStream = streamFromDirectLink(route.provider, route.link);
  const streams = directStream ? [directStream] : await fetchStreams(route.provider, route.link);
  if (token !== renderToken) return;

  if (!Array.isArray(streams) || streams.length === 0) {
    app.innerHTML = `${nav()}<main class="container">
      <section class="section">
        <h2>${escapeHtml(detail?.title || route.id)}</h2>
        <p class="muted">Nessuno stream disponibile per questo episodio.</p>
      </section>
    </main>`;
    return;
  }

  app.innerHTML = `${nav()}<main class="container">
    <section class="section">
      <h2>${escapeHtml(detail?.title || route.id)}</h2>
      <p class="muted">${escapeHtml(route.episodeTitle || "Riproduzione")}</p>
      <video id="video-player" controls playsinline preload="metadata" class="player"></video>
      <div class="stream-list" id="streams-list"></div>
    </section>
  </main>`;
  setupPlayerBehavior(detail, route, streams);
}

function renderWatchlist(): void {
  const list = getWatchlist();
  app.innerHTML = `${nav()}<main class="container">
    <section class="section">
      <h2>La mia lista</h2>
      <div class="grid">
        ${
          list.length
            ? list
                .map(
                  (item) => {
                    const imagePlan = getImageFallbackPlan(item.provider, item.poster, item.sourceLink);
                    return (
                    `<article class="card">
                      <a href="#/info/${encodeURIComponent(item.id)}">
                        <div class="card-poster">${renderImageMarkup(imagePlan, "card-poster-image", item.title)}</div>
                        <div class="card-body"><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(toProviderLabel(item.provider))}</p></div>
                      </a>
                    </article>`
                    );
                  }
                )
                .join("")
            : "<p>Nessun contenuto nella tua lista.</p>"
        }
      </div>
    </section>
  </main>`;
  setupAdaptiveImages();
}

function renderHistory(): void {
  const history = getHistory();
  app.innerHTML = `${nav()}<main class="container">
    <section class="section">
      <h2>Cronologia</h2>
      <ul class="history-list">
        ${
          history.length
            ? history
                .map(
                  (item) =>
                    `<li>
                      <a href="#/info/${encodeURIComponent(item.id)}">${escapeHtml(item.title)}</a>
                      <span>${new Date(item.watchedAt).toLocaleString()}</span>
                    </li>`
                )
                .join("")
            : "<li>Nessuna cronologia disponibile.</li>"
        }
      </ul>
    </section>
  </main>`;
}

async function renderSettings(token: number): Promise<void> {
  const settings = getSettings();
  const accountEnabled = Boolean(getSupabaseClient());
  const session = await getCurrentSession();
  if (token !== renderToken) return;

  app.innerHTML = `${nav()}<main class="container">
    <section class="section">
      <h2>Impostazioni</h2>
      <form id="settings-form" class="settings-form">
        <label><input type="checkbox" name="preferProxyPlayback" ${settings.preferProxyPlayback ? "checked" : ""}/> Preferisci riproduzione tramite proxy</label>
        <label><input type="checkbox" name="preferDirectPlayback" ${settings.preferDirectPlayback ? "checked" : ""}/> Preferisci riproduzione diretta</label>
        <label><input type="checkbox" name="subtitlesEnabled" ${settings.subtitlesEnabled ? "checked" : ""}/> Sottotitoli abilitati</label>
        <label><input type="checkbox" name="autoSyncOnLogin" ${settings.autoSyncOnLogin ? "checked" : ""}/> Sincronizza automaticamente al login</label>
        <button type="submit">Salva impostazioni</button>
      </form>
      <hr />
      <h3>Account</h3>
      <p class="muted">${
        accountEnabled
          ? session
            ? `Accesso effettuato come ${escapeHtml(session.user.email || session.user.id)}`
            : "Accedi per sincronizzare lista, cronologia e progresso su più dispositivi."
          : "Accesso account non disponibile al momento."
      }</p>
      ${
        !accountEnabled
          ? ""
          : session
            ? `<button id="logout-button">Esci</button>`
            : `<form id="login-form" class="settings-form">
              <input name="email" type="email" placeholder="email@domain.com" required />
              <button type="submit">Invia link di accesso</button>
            </form>`
      }
    </section>
  </main>`;

  const settingsForm = document.querySelector<HTMLFormElement>("#settings-form");
  if (settingsForm) {
    settingsForm.onsubmit = (event) => {
      event.preventDefault();
      const form = new FormData(settingsForm);
      updateSettings({
        preferProxyPlayback: form.get("preferProxyPlayback") === "on",
        preferDirectPlayback: form.get("preferDirectPlayback") === "on",
        subtitlesEnabled: form.get("subtitlesEnabled") === "on",
        autoSyncOnLogin: form.get("autoSyncOnLogin") === "on",
      });
      void render();
    };
  }

  const loginForm = document.querySelector<HTMLFormElement>("#login-form");
  if (loginForm) {
    loginForm.onsubmit = async (event) => {
      event.preventDefault();
      const email = String(new FormData(loginForm).get("email") || "").trim();
      if (!email) return;
      try {
        await signInWithEmail(email);
        alert("Link di accesso inviato. Controlla la tua email.");
      } catch (error) {
        alert(error instanceof Error ? error.message : "Impossibile avviare l'accesso.");
      }
    };
  }

  const logoutButton = document.querySelector<HTMLButtonElement>("#logout-button");
  if (logoutButton) {
    logoutButton.onclick = async () => {
      await signOut();
      void render();
    };
  }

  if (session && settings.autoSyncOnLogin) {
    void runInitialSync(session.user.id).catch(() => {
      // best effort
    });
  }
}

async function render(): Promise<void> {
  const token = ++renderToken;
  const route = parseRoute();
  try {
    if (route.name === "home") return await renderHome(token);
    if (route.name === "search") return await renderSearch(route.query, token);
    if (route.name === "info") return await renderInfo(route.id, route.seasonKey, token);
    if (route.name === "player") return await renderPlayer(route, token);
    if (route.name === "watchlist") return renderWatchlist();
    if (route.name === "history") return renderHistory();
    if (route.name === "settings") return await renderSettings(token);
  } catch (error) {
    app.innerHTML = `${nav()}<main class="container"><p>Errore: ${escapeHtml(
      error instanceof Error ? error.message : String(error)
    )}</p></main>`;
  }
}

window.addEventListener("hashchange", () => {
  void render();
});

window.addEventListener("load", () => {
  if (!location.hash) location.hash = "#/home";
  void render();
});

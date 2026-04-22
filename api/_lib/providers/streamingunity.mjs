import { createHttpClient } from "../http.mjs";
import {
  decodeHtmlEntities,
  extractDataPage,
  normalizeText,
  pickTranslation,
  resolveUrl,
} from "../common.mjs";
import { resolveProviderBaseUrl } from "../base-url.mjs";
import {
  extractVixCloudStreams,
} from "../vixcloud.mjs";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
const DEFAULT_BASE_URL = "https://streamingunity.biz";
const DEFAULT_CDN_URL = "https://cdn.streamingunity.biz";
const DEFAULT_LOCALE = "it";
const DNS_SERVERS = ["1.1.1.1", "1.0.0.1"];

const client = createHttpClient({
  timeoutMs: 30000,
  retries: 2,
  dnsServers: DNS_SERVERS,
  defaultHeaders: {
    "user-agent": USER_AGENT,
    "accept-language": "it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7",
  },
});

function normalizeBaseUrl(value) {
  return String(value || "").replace(/\/+$/, "");
}

async function resolveBaseUrl() {
  const resolved = await resolveProviderBaseUrl("streamingunity");
  return normalizeBaseUrl(resolved || DEFAULT_BASE_URL) || DEFAULT_BASE_URL;
}

function buildLocalePath(pathname) {
  const raw = normalizeText(pathname || "");
  if (!raw || raw === "/") return `/${DEFAULT_LOCALE}`;
  const withSlash = raw.startsWith("/") ? raw : `/${raw}`;
  if (withSlash === `/${DEFAULT_LOCALE}` || withSlash.startsWith(`/${DEFAULT_LOCALE}/`)) {
    return withSlash;
  }
  return `/${DEFAULT_LOCALE}${withSlash}`;
}

function buildLocaleUrl(pathname, baseUrl) {
  return resolveUrl(baseUrl, buildLocalePath(pathname));
}

function extractTitleId(value, fallbackContentId) {
  const source = normalizeText(value || "");
  if (source) {
    const match = source.match(/\/(?:titles|watch|iframe)\/(\d+)/i);
    if (match && match[1]) return match[1];
    const direct = Number.parseInt(source, 10);
    if (Number.isFinite(direct) && direct > 0) return String(direct);
  }

  const contentMatch = normalizeText(fallbackContentId || "").match(/streamingunity-(\d+)/i);
  if (contentMatch && contentMatch[1]) return contentMatch[1];
  return "";
}

function extractSlugFromLink(link) {
  const source = normalizeText(link || "");
  const match = source.match(/\/titles\/\d+-([^/?#]+)/i);
  return match && match[1] ? normalizeText(match[1]) : "";
}

function resolveTitleSlug(title) {
  const translated = pickTranslation(title && title.translations, "slug", DEFAULT_LOCALE);
  return translated || normalizeText(title && title.slug);
}

function resolveTitleName(title) {
  const translated = pickTranslation(title && title.translations, "name", DEFAULT_LOCALE);
  if (translated) return translated;
  return normalizeText((title && (title.name || title.original_name)) || "");
}

function resolveCdnUrl(pageProps, baseUrl) {
  const candidate =
    normalizeText(pageProps && (pageProps.cdn_url || pageProps.cdnUrl || pageProps.cdn)) || "";
  if (candidate) {
    if (/^https?:\/\//i.test(candidate)) return candidate.replace(/\/+$/, "");
    return `https://${candidate.replace(/^\/+/, "").replace(/\/+$/, "")}`;
  }

  try {
    const parsed = new URL(baseUrl);
    const host = String(parsed.hostname || "").replace(/^www\./i, "");
    if (host) return `https://cdn.${host}`;
  } catch {
    // ignore
  }
  return DEFAULT_CDN_URL;
}

function buildImageUrl(image, cdnUrl) {
  if (!image) return "";
  const raw = normalizeText(
    image.original_url_field || image.url || image.src || image.path || image.filename || ""
  );
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  return `${cdnUrl.replace(/\/+$/, "")}/images/${raw.replace(/^\/+/, "")}`;
}

function pickImageByType(images, cdnUrl, types) {
  if (!Array.isArray(images) || !images.length) return "";
  for (const type of types) {
    const normalized = String(type || "").toLowerCase();
    const matches = images.filter(
      (entry) => String((entry && entry.type) || "").toLowerCase() === normalized
    );
    if (!matches.length) continue;
    const localized = matches.find(
      (entry) => String((entry && entry.lang) || "").toLowerCase() === DEFAULT_LOCALE
    );
    const fallback = localized || matches.find((entry) => !entry.lang) || matches[0];
    const url = buildImageUrl(fallback, cdnUrl);
    if (url) return url;
  }
  return buildImageUrl(images[0], cdnUrl);
}

async function fetchHtml(url, referer) {
  const response = await client.request({
    url,
    headers: {
      accept: "text/html,application/xhtml+xml",
      referer: referer || url,
    },
  });
  if (response.statusCode < 200 || response.statusCode >= 400) {
    throw new Error(`HTTP ${response.statusCode} ${url}`);
  }
  return String(response.body || "");
}

function buildTitlePath(titleId, slug) {
  const safeSlug = normalizeText(slug || "");
  return `/titles/${titleId}${safeSlug ? `-${safeSlug}` : ""}`;
}

function buildSeasonUrl(baseUrl, titleId, slug, seasonNumber) {
  return buildLocaleUrl(`${buildTitlePath(titleId, slug)}/season-${seasonNumber}`, baseUrl);
}

function seasonNumberFromUrl(url) {
  const match = String(url || "").match(/\/season-(\d+)\b/i);
  if (!match || !match[1]) return undefined;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function mapEpisodeEntry(episode, index, titleId, seasonNumber) {
  const episodeId = normalizeText(episode && episode.id);
  if (!episodeId) return null;
  const rawNumber = normalizeText(episode && episode.number);
  const parsedEpisodeNumber = Number.parseInt(rawNumber, 10);
  const translatedName = pickTranslation(episode && episode.translations, "name", DEFAULT_LOCALE);
  const name = translatedName || normalizeText(episode && episode.name);
  return {
    episodeId,
    title: name || (rawNumber ? `Episode ${rawNumber}` : `Episode ${index + 1}`),
    episodeNumber: Number.isFinite(parsedEpisodeNumber) ? parsedEpisodeNumber : index + 1,
    seasonNumber,
    link: `${titleId}::${episodeId}`,
    streams: [],
  };
}

function mapEpisodes(episodes, titleId, seasonNumber) {
  const source = Array.isArray(episodes) ? episodes : [];
  const out = [];
  for (let i = 0; i < source.length; i += 1) {
    const mapped = mapEpisodeEntry(source[i], i, titleId, seasonNumber);
    if (!mapped) continue;
    out.push(mapped);
  }
  return out;
}

function extractIframeSrc(html, baseUrl) {
  const source = String(html || "");
  const iframeMatch = source.match(/<iframe[^>]+src=["']([^"']+)["']/i);
  if (iframeMatch && iframeMatch[1]) return resolveUrl(baseUrl, decodeHtmlEntities(iframeMatch[1]));

  const directMatch = source.match(/https?:\/\/[^"'\s]+vixcloud\.co\/embed\/\d+[^"'\s]*/i);
  if (directMatch && directMatch[0]) return decodeHtmlEntities(directMatch[0]);
  return "";
}

function extractEmbedUrl(watchHtml, baseUrl) {
  const page = extractDataPage(watchHtml);
  const embedFromPage = normalizeText(page && page.props && page.props.embedUrl);
  if (embedFromPage) return resolveUrl(baseUrl, decodeHtmlEntities(embedFromPage));

  const source = String(watchHtml || "");
  const hrefMatch = source.match(/<a[^>]+href=["']([^"']*\/it\/iframe\/\d+[^"']*)["']/i);
  if (hrefMatch && hrefMatch[1]) return resolveUrl(baseUrl, decodeHtmlEntities(hrefMatch[1]));

  const absoluteMatch = source.match(/https?:\/\/[^"'\s]+\/it\/iframe\/\d+[^"'\s]*/i);
  if (absoluteMatch && absoluteMatch[0]) return decodeHtmlEntities(absoluteMatch[0]);

  const relativeMatch = source.match(/\/it\/iframe\/\d+[^"'\s]*/i);
  if (relativeMatch && relativeMatch[0]) return resolveUrl(baseUrl, decodeHtmlEntities(relativeMatch[0]));

  return "";
}

async function fetchTitlePage(baseUrl, titleId, slug, inputLink) {
  const queue = [];
  const seen = new Set();
  const preferredUrl = normalizeText(inputLink || "");

  function enqueue(url) {
    const normalized = normalizeText(url || "");
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    queue.push(normalized);
  }

  if (preferredUrl) enqueue(resolveUrl(baseUrl, preferredUrl));
  enqueue(buildLocaleUrl(buildTitlePath(titleId, slug), baseUrl));
  enqueue(buildLocaleUrl(`/titles/${titleId}`, baseUrl));
  enqueue(buildLocaleUrl(`/watch/${titleId}`, baseUrl));

  let fallbackPage = null;
  let lastError = null;

  while (queue.length) {
    const url = queue.shift();
    if (!url) continue;

    try {
      const html = await fetchHtml(url, buildLocaleUrl("/archive", baseUrl));
      const page = extractDataPage(html);
      const title = page && page.props ? page.props.title : null;
      if (!title) continue;

      const isTv = String(title.type || "").toLowerCase() === "tv";
      const hasSeasons = Array.isArray(title.seasons) && title.seasons.length > 0;
      const loadedSeasonEpisodes = page && page.props && page.props.loadedSeason
        ? page.props.loadedSeason.episodes
        : null;
      const hasLoadedEpisodes = Array.isArray(loadedSeasonEpisodes) && loadedSeasonEpisodes.length > 0;
      const looksComplete = !isTv || hasSeasons || hasLoadedEpisodes;

      if (looksComplete) return { html, page, url };

      if (!fallbackPage) fallbackPage = { html, page, url };

      const derivedSlug = resolveTitleSlug(title);
      if (derivedSlug) {
        enqueue(buildLocaleUrl(buildTitlePath(titleId, derivedSlug), baseUrl));
      }
    } catch (error) {
      lastError = error;
    }
  }

  if (fallbackPage) return fallbackPage;
  throw lastError || new Error("StreamingUnity title page not found");
}

export async function getStreamingunityEpisodes({ seasonLink }) {
  const baseUrl = await resolveBaseUrl();
  const seasonUrl = resolveUrl(baseUrl, seasonLink);
  if (!seasonUrl) return [];

  const html = await fetchHtml(seasonUrl, buildLocaleUrl("/archive", baseUrl));
  const page = extractDataPage(html);
  const titleId =
    normalizeText(page && page.props && page.props.title && page.props.title.id) ||
    extractTitleId(seasonUrl);
  if (!titleId) return [];

  const loadedSeason = page && page.props ? page.props.loadedSeason : null;
  const seasonNumber =
    Number.parseInt(String(loadedSeason && loadedSeason.number), 10) || seasonNumberFromUrl(seasonUrl);
  const episodes = loadedSeason && Array.isArray(loadedSeason.episodes) ? loadedSeason.episodes : [];
  return mapEpisodes(episodes, titleId, seasonNumber);
}

function mapLoadedSeasonIntoSeasons(seasons, loadedSeason, titleId) {
  if (!loadedSeason || typeof loadedSeason !== "object") return;
  const loadedNumber = Number.parseInt(String(loadedSeason.number), 10);
  const loadedId = normalizeText(loadedSeason.id);
  const episodes = mapEpisodes(loadedSeason.episodes || [], titleId, loadedNumber);
  if (!episodes.length) return;

  const targetIndex = seasons.findIndex((season) => {
    if (loadedId && season.id && String(season.id) === loadedId) return true;
    return loadedNumber && season.seasonNumber === loadedNumber;
  });

  if (targetIndex >= 0) {
    seasons[targetIndex].episodes = episodes;
  }
}

export async function buildStreamingunityPayload({ link, content = {} }) {
  const baseUrl = await resolveBaseUrl();
  const titleId = extractTitleId(link, content.id);
  if (!titleId) {
    throw new Error("StreamingUnity id non valido");
  }

  const linkSlug = extractSlugFromLink(link);
  const titlePage = await fetchTitlePage(baseUrl, titleId, linkSlug, link);
  const props = titlePage.page && titlePage.page.props ? titlePage.page.props : {};
  const title = props.title;
  const loadedSeason = props.loadedSeason;
  const slug = resolveTitleSlug(title) || linkSlug;
  const cdnUrl = resolveCdnUrl(props, baseUrl);

  const seasonsRaw = Array.isArray(title && title.seasons) ? title.seasons : [];
  const seasons = seasonsRaw
    .map((season) => {
      const number = Number.parseInt(String(season && season.number), 10);
      if (!Number.isFinite(number) || number <= 0) return null;
      return {
        id: normalizeText(season && season.id) || undefined,
        seasonNumber: number,
        title: normalizeText(season && season.name) || `Season ${number}`,
        episodesLink: buildSeasonUrl(baseUrl, titleId, slug, number),
        episodesCount: Number.parseInt(String(season && season.episodes_count), 10) || undefined,
        episodes: [],
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.seasonNumber - b.seasonNumber);

  mapLoadedSeasonIntoSeasons(seasons, loadedSeason, titleId);

  if (!seasons.length && loadedSeason && Array.isArray(loadedSeason.episodes)) {
    const number = Number.parseInt(String(loadedSeason.number), 10) || 1;
    seasons.push({
      seasonNumber: number,
      title: `Season ${number}`,
      episodesLink: buildSeasonUrl(baseUrl, titleId, slug, number),
      episodes: mapEpisodes(loadedSeason.episodes || [], titleId, number),
    });
  }

  const isTv = String((title && title.type) || "").toLowerCase() === "tv";
  if (!isTv && !seasons.length) {
    seasons.push({
      seasonNumber: 1,
      title: "Movie",
      episodes: [
        {
          episodeId: `${titleId}-movie`,
          title: "Play",
          episodeNumber: 1,
          link: buildLocaleUrl(`/watch/${titleId}`, baseUrl),
          streams: [],
        },
      ],
    });
  }

  if (seasons.length && (!Array.isArray(seasons[0].episodes) || !seasons[0].episodes.length) && seasons[0].episodesLink) {
    try {
      seasons[0].episodes = await getStreamingunityEpisodes({
        seasonLink: seasons[0].episodesLink,
      });
    } catch {
      seasons[0].episodes = [];
    }
  }

  const defaultSeasonIndex = Math.max(
    0,
    seasons.findIndex((season) => Array.isArray(season.episodes) && season.episodes.length > 0)
  );

  const poster = pickImageByType(title && title.images, cdnUrl, [
    "poster",
    "cover",
    "cover_mobile",
    "background",
  ]);
  const backdrop = pickImageByType(title && title.images, cdnUrl, [
    "background",
    "cover",
    "cover_mobile",
    "poster",
  ]);

  return {
    content: {
      id: normalizeText(content.id) || `streamingunity-${titleId}`,
      provider: "streamingunity",
      title: resolveTitleName(title) || normalizeText(content.title) || `Title ${titleId}`,
      poster: normalizeText(content.poster) || poster,
      backdrop: normalizeText(content.backdrop) || backdrop || poster,
      infoUrl: normalizeText(content.infoUrl) || titlePage.url,
      type: isTv ? "series" : "movie",
    },
    seasons,
    defaults: {
      seasonIndex: defaultSeasonIndex,
      episodeIndex: 0,
      streamIndex: 0,
      autoplay: true,
    },
  };
}

function parseStreamLink(link) {
  const source = normalizeText(link || "");
  if (!source) return { titleId: "", episodeId: "" };

  if (source.includes("::")) {
    const parts = source.split("::");
    const titleId = extractTitleId(parts[0], "");
    const episodeId = normalizeText(parts[1]);
    return { titleId, episodeId };
  }

  return {
    titleId: extractTitleId(source, ""),
    episodeId: "",
  };
}

function normalizeServerName(value) {
  const text = normalizeText(value || "");
  if (!text) return "StreamingUnity";
  if (text.startsWith("AnimeUnity")) return text.replace(/^AnimeUnity/, "StreamingUnity");
  if (text.startsWith("StreamingUnity")) return text;
  return `StreamingUnity ${text}`;
}

export async function getStreamingunityStreams({ link }) {
  const parsed = parseStreamLink(link);
  if (!parsed.titleId) return [];

  const baseUrl = await resolveBaseUrl();
  const watchUrl = buildLocaleUrl(`/watch/${parsed.titleId}`, baseUrl);

  let iframeSrc = "";
  let iframeReferer = watchUrl;

  if (parsed.episodeId) {
    const episodeIframeUrl = `${buildLocaleUrl(`/iframe/${parsed.titleId}`, baseUrl)}?episode_id=${encodeURIComponent(
      parsed.episodeId
    )}&next_episode=1`;
    try {
      const iframeHtml = await fetchHtml(episodeIframeUrl, watchUrl);
      iframeSrc = extractIframeSrc(iframeHtml, baseUrl);
      iframeReferer = episodeIframeUrl;
    } catch {
      iframeSrc = "";
    }
  }

  if (!iframeSrc) {
    const watchHtml = await fetchHtml(watchUrl, baseUrl);
    const embedUrl = extractEmbedUrl(watchHtml, baseUrl);
    if (!embedUrl) return [];

    const iframeHtml = await fetchHtml(embedUrl, watchUrl);
    iframeSrc = extractIframeSrc(iframeHtml, baseUrl);
    if (!iframeSrc) return [];
    iframeReferer = embedUrl;
  }

  const vixHtml = await fetchHtml(iframeSrc, iframeReferer);
  const parsedStreams = extractVixCloudStreams(vixHtml, iframeSrc, USER_AGENT, {
    serverPrefix: "StreamingUnity",
  });
  const normalizedStreams = parsedStreams.map((stream) => ({
    ...stream,
    server: normalizeServerName(stream.server),
  }));

  return normalizedStreams;
}

import { createHttpClient } from "../http.mjs";
import {
  normalizeText,
  decodeHtmlEntities,
  pickTranslation,
  toNumber,
  uniqueBy,
} from "../common.mjs";
import { resolveProviderBaseUrl } from "../base-url.mjs";
import {
  extractDownloadUrl,
  extractFirstUrl,
  extractVixCloudStreams,
  normalizeUrl,
  buildStreamHeaders,
} from "../vixcloud.mjs";

const USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
const DEFAULT_BASE_URL = "https://www.animeunity.so";
const RANGE_SIZE = 120;
const SPECIALS_LOOKAHEAD = 30;

const client = createHttpClient({
  timeoutMs: 30000,
  retries: 2,
  defaultHeaders: {
    "user-agent": USER_AGENT,
    "accept-language": "it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7",
  },
});

function normalizeBaseUrl(value) {
  return String(value || "").replace(/\/+$/, "");
}

async function resolveBaseUrl() {
  const resolved = await resolveProviderBaseUrl("animeunity");
  return normalizeBaseUrl(resolved || DEFAULT_BASE_URL) || DEFAULT_BASE_URL;
}

function mediaTypeFromUrl(url) {
  const clean = normalizeText(url || "").split("?")[0].split("#")[0].toLowerCase();
  if (!clean) return "";
  if (clean.endsWith(".m3u8")) return "m3u8";
  if (clean.endsWith(".mpd")) return "mpd";
  if (clean.endsWith(".mp4")) return "mp4";
  return "";
}

function mediaTypeFromContentType(contentType) {
  const value = normalizeText(contentType || "").toLowerCase();
  if (!value) return "";
  if (
    value.includes("application/vnd.apple.mpegurl") ||
    value.includes("application/x-mpegurl") ||
    value.includes("audio/mpegurl")
  ) {
    return "m3u8";
  }
  if (value.includes("application/dash+xml")) return "mpd";
  if (value.includes("video/") || value.includes("application/octet-stream")) return "mp4";
  return "";
}

function inferMediaType(url, contentType) {
  return mediaTypeFromUrl(url) || mediaTypeFromContentType(contentType) || "";
}

function buildProbeHeaders(referer) {
  const headers = {
    accept: "*/*",
  };
  const safeReferer = normalizeText(referer || "");
  if (safeReferer) {
    headers.referer = safeReferer;
    try {
      headers.origin = new URL(safeReferer).origin;
    } catch {
      // ignore invalid URL
    }
  }
  return headers;
}

async function resolvePlayableDownloadStream(rawUrl, referer) {
  const candidate = normalizeUrl(rawUrl || "");
  if (!candidate || !/^https?:\/\//i.test(candidate)) return null;

  const directType = mediaTypeFromUrl(candidate);
  if (directType) {
    return {
      link: candidate,
      type: directType,
    };
  }

  const probeHeaders = buildProbeHeaders(referer || candidate);
  const probes = [
    { method: "HEAD", extraHeaders: {} },
    { method: "GET", extraHeaders: { range: "bytes=0-1" } },
  ];

  for (const probe of probes) {
    try {
      const response = await client.request({
        url: candidate,
        method: probe.method,
        headers: {
          ...probeHeaders,
          ...probe.extraHeaders,
        },
        timeout: 12000,
      });
      const status = Number(response.statusCode) || 0;
      if (status < 200 || status >= 400) continue;

      const finalUrl = normalizeUrl(response.url || candidate);
      const type = inferMediaType(finalUrl, response.headers && response.headers["content-type"]);
      if (!type) continue;

      return {
        link: finalUrl || candidate,
        type,
      };
    } catch {
      // try next probe
    }
  }

  return null;
}

function extractAnimeId(link, contentId) {
  const source = normalizeText(link || "");
  if (source) {
    const direct = Number.parseInt(source, 10);
    if (Number.isFinite(direct) && direct > 0) return String(direct);

    const match = source.match(/\/anime\/(\d+)/i);
    if (match && match[1]) return match[1];
  }

  const contentMatch = normalizeText(contentId || "").match(/animeunity-(\d+)/i);
  if (contentMatch && contentMatch[1]) return contentMatch[1];

  return "";
}

function extractSlugFromLink(link) {
  const source = normalizeText(link || "");
  const match = source.match(/\/anime\/\d+-([^/?#]+)/i);
  return match && match[1] ? normalizeText(match[1]) : "";
}

function parseAnimePayloadFromHtml(html) {
  const source = String(html || "");
  const patterns = [/anime="([^"]+)"/i, /anime='([^']+)'/i];
  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (!match || !match[1]) continue;
    const decoded = decodeHtmlEntities(match[1]);
    try {
      return JSON.parse(decoded);
    } catch {
      continue;
    }
  }
  return null;
}

async function fetchInfo(baseUrl, animeId) {
  const response = await client.requestJson({
    url: `${baseUrl}/info_api/${animeId}/`,
    headers: {
      accept: "application/json",
      referer: `${baseUrl}/`,
    },
  });
  if (response.statusCode < 200 || response.statusCode >= 400) return {};
  return response.data && typeof response.data === "object" ? response.data : {};
}

async function fetchHtmlAnime(baseUrl, animeId, slug) {
  const safeSlug = normalizeText(slug || "");
  const url = `${baseUrl}/anime/${animeId}${safeSlug ? `-${safeSlug}` : ""}`;
  const response = await client.request({
    url,
    headers: {
      accept: "text/html,application/xhtml+xml",
      referer: `${baseUrl}/`,
    },
  });
  if (response.statusCode < 200 || response.statusCode >= 400) return {};
  return parseAnimePayloadFromHtml(response.body) || {};
}

function buildEpisodeRanges(totalCount) {
  const safeTotal = Math.max(0, Number(totalCount) || 0);
  if (!safeTotal) {
    return [
      {
        seasonNumber: 1,
        title: "Episodes",
        episodesLink: "",
        start: 1,
        end: 0,
      },
    ];
  }

  const ranges = [];
  let start = 1;
  let seasonNumber = 1;
  while (start <= safeTotal) {
    const end = Math.min(start + RANGE_SIZE - 1, safeTotal);
    ranges.push({
      seasonNumber,
      title: `Episodes ${start}-${end}`,
      episodesLink: "",
      start,
      end,
      episodesCount: end - start + 1,
    });
    start = end + 1;
    seasonNumber += 1;
  }
  return ranges;
}

function normalizeEpisodeNumber(value) {
  if (value == null) return undefined;
  const text = String(value).trim();
  if (!text) return undefined;
  const parsed = Number.parseFloat(text);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function mapEpisodeEntry(episode, index) {
  const id = normalizeText(episode && episode.id);
  if (!id) return null;
  const numberText = normalizeText(episode && episode.number);
  const parsedNumber = normalizeEpisodeNumber(numberText);
  const title = numberText ? `Episode ${numberText}` : `Episode ${index + 1}`;
  return {
    episodeId: id,
    title,
    episodeNumber: parsedNumber != null ? parsedNumber : index + 1,
    link: id,
    streams: [],
  };
}

function parseSeasonLink(seasonLink, fallbackAnimeId) {
  const raw = normalizeText(seasonLink || "");
  if (!raw) return { animeId: fallbackAnimeId || "", start: 1, end: 0 };

  if (raw.includes("|")) {
    const parts = raw.split("|");
    const animeId = normalizeText(parts[0]);
    const start = Number.parseInt(parts[1], 10);
    const end = Number.parseInt(parts[2], 10);
    return {
      animeId,
      start: Number.isFinite(start) && start > 0 ? start : 1,
      end: Number.isFinite(end) && end > 0 ? end : 0,
    };
  }

  const numeric = Number.parseInt(raw, 10);
  if (Number.isFinite(numeric) && numeric > 0) {
    return { animeId: String(numeric), start: 1, end: 0 };
  }

  const linkMatch = raw.match(/\/anime\/(\d+)/i);
  if (linkMatch && linkMatch[1]) {
    return { animeId: linkMatch[1], start: 1, end: 0 };
  }

  return { animeId: fallbackAnimeId || "", start: 1, end: 0 };
}

export async function getAnimeunityEpisodes({ seasonLink, animeId }) {
  const baseUrl = await resolveBaseUrl();
  const parsed = parseSeasonLink(seasonLink, animeId);
  if (!parsed.animeId) return [];

  const info = await fetchInfo(baseUrl, parsed.animeId);
  const totalCount = Number.parseInt(String(info && info.episodes_count), 10) || 0;
  if (!totalCount) return [];

  const seen = new Set();
  const out = [];
  const safeRequestedLast = parsed.end > 0 ? parsed.end : totalCount;
  const isLastRange = safeRequestedLast >= totalCount;
  const finalLast = isLastRange ? safeRequestedLast + SPECIALS_LOOKAHEAD : safeRequestedLast;
  let start = parsed.end > 0 ? (parsed.start <= 1 ? 0 : parsed.start) : 0;

  while (start <= finalLast) {
    const end = Math.min(start + RANGE_SIZE - 1, finalLast);
    const rangeUrl = `${baseUrl}/info_api/${parsed.animeId}/1?start_range=${start}&end_range=${end}`;
    const response = await client.requestJson({
      url: rangeUrl,
      headers: {
        accept: "application/json",
        referer: `${baseUrl}/`,
      },
    });

    if (response.statusCode >= 200 && response.statusCode < 400) {
      const list = response.data && Array.isArray(response.data.episodes) ? response.data.episodes : [];
      for (let i = 0; i < list.length; i += 1) {
        const mapped = mapEpisodeEntry(list[i], out.length);
        if (!mapped || seen.has(mapped.link)) continue;
        seen.add(mapped.link);
        out.push(mapped);
      }
    }

    start = end + 1;
  }

  return out;
}

function pickTitle(info, htmlAnime, fallbackTitle) {
  return (
    normalizeText(info && (info.title_eng || info.title || info.title_it)) ||
    normalizeText(htmlAnime && (htmlAnime.title_eng || htmlAnime.title || htmlAnime.title_it)) ||
    normalizeText(fallbackTitle) ||
    "Anime"
  );
}

function pickImage(info, htmlAnime) {
  const image = normalizeText(
    (info && (info.imageurl_cover || info.imageurl || info.cover)) ||
      (htmlAnime && (htmlAnime.imageurl_cover || htmlAnime.imageurl || htmlAnime.cover)) ||
      ""
  );
  return image;
}

export async function buildAnimeunityPayload({ link, content = {} }) {
  const baseUrl = await resolveBaseUrl();
  const animeId = extractAnimeId(link, content.id);
  if (!animeId) {
    throw new Error("AnimeUnity id non valido");
  }

  const slug = extractSlugFromLink(link);
  const [info, htmlAnime] = await Promise.all([
    fetchInfo(baseUrl, animeId),
    fetchHtmlAnime(baseUrl, animeId, slug),
  ]);

  const title = pickTitle(info, htmlAnime, content.title);
  const image = pickImage(info, htmlAnime);
  const synopsis = normalizeText((info && info.plot) || (htmlAnime && htmlAnime.plot) || "");
  const episodesCount =
    Number.parseInt(String((info && info.episodes_count) || (htmlAnime && htmlAnime.episodes_count) || 0), 10) ||
    0;

  const ranges = buildEpisodeRanges(episodesCount);
  const seasons = ranges.map((range) => ({
    seasonNumber: range.seasonNumber,
    title: range.title,
    episodesLink:
      range.end > 0
        ? `${animeId}|${range.start}|${range.end}`
        : String(animeId),
    episodesCount: range.episodesCount || episodesCount || undefined,
    episodes: [],
  }));

  if (!seasons.length) {
    seasons.push({
      seasonNumber: 1,
      title: "Episodes",
      episodesLink: String(animeId),
      episodes: [],
    });
  }

  try {
    seasons[0].episodes = await getAnimeunityEpisodes({ seasonLink: seasons[0].episodesLink, animeId });
  } catch {
    seasons[0].episodes = [];
  }

  if (!seasons[0].episodes.length && episodesCount === 0) {
    seasons[0].episodes = [
      {
        episodeId: animeId,
        title: "Episode 1",
        episodeNumber: 1,
        link: animeId,
        streams: [],
      },
    ];
  }

  const pageLink = `${baseUrl}/anime/${animeId}${slug ? `-${slug}` : ""}`;

  return {
    content: {
      id: normalizeText(content.id) || `animeunity-${animeId}`,
      provider: "animeunity",
      title,
      poster: normalizeText(content.poster) || image,
      backdrop: normalizeText(content.backdrop) || image,
      infoUrl: normalizeText(content.infoUrl) || pageLink,
      synopsis,
      type: normalizeText((info && info.type) || (htmlAnime && htmlAnime.type)).toLowerCase().includes("movie")
        ? "movie"
        : "series",
    },
    seasons,
    defaults: {
      seasonIndex: 0,
      episodeIndex: 0,
      streamIndex: 0,
      autoplay: true,
    },
  };
}

export async function getAnimeunityStreams({ link }) {
  const episodeId = normalizeText(link || "");
  if (!episodeId) return [];

  const baseUrl = await resolveBaseUrl();
  const headers = {
    accept: "text/html,application/xhtml+xml",
    referer: `${baseUrl}/`,
  };

  const embedResponse = await client.request({
    url: `${baseUrl}/embed-url/${encodeURIComponent(episodeId)}`,
    headers,
    allowRedirects: false,
  });

  const location = Array.isArray(embedResponse.headers.location)
    ? embedResponse.headers.location[0]
    : embedResponse.headers.location;
  const rawEmbed = normalizeText(embedResponse.body || "");
  const embedCandidate =
    (location && String(location).startsWith("http") && String(location)) ||
    extractFirstUrl(rawEmbed) ||
    rawEmbed;
  const embedUrl = normalizeUrl(embedCandidate);
  if (!embedUrl || !/^https?:\/\//i.test(embedUrl)) return [];

  const pageResponse = await client.request({
    url: embedUrl,
    headers: {
      ...headers,
      referer: `${baseUrl}/embed-url/${encodeURIComponent(episodeId)}`,
    },
  });
  const pageHtml = String(pageResponse.body || "");

  if (embedUrl.includes("vixcloud.co")) {
    const streams = extractVixCloudStreams(pageHtml, embedUrl, USER_AGENT, {
      serverPrefix: "AnimeUnity",
    });
    const downloadUrl = extractDownloadUrl(pageHtml);
    const downloadStreamInfo = downloadUrl
      ? await resolvePlayableDownloadStream(downloadUrl, embedUrl)
      : null;
    if (downloadStreamInfo) {
      const downloadStream = {
        server: "AnimeUnity Download",
        link: downloadStreamInfo.link,
        type: downloadStreamInfo.type,
        headers: buildStreamHeaders(embedUrl, USER_AGENT),
      };
      if (streams.length && !streams.find((entry) => entry.link === downloadStreamInfo.link)) {
        return [...streams, downloadStream];
      }
      return streams.length ? streams : [downloadStream];
    }
    if (streams.length) return streams;
  }

  const directUrl = extractDownloadUrl(pageHtml);
  const directStreamInfo = directUrl
    ? await resolvePlayableDownloadStream(directUrl, embedUrl)
    : null;
  if (!directStreamInfo) return [];
  return [
    {
      server: "AnimeUnity",
      link: directStreamInfo.link,
      type: directStreamInfo.type,
      headers: buildStreamHeaders(embedUrl, USER_AGENT),
    },
  ];
}

#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import {
  parseCliArgs,
  toInt,
  normalizeText,
  toFloat,
  uniqueBy,
  writeJsonAtomic,
  writeShardedJson,
  asyncMapLimit,
  createHttpClient,
} from "./shared.mjs";

const args = parseCliArgs(process.argv.slice(2));
const nowYear = new Date().getFullYear();
const CATEGORY_SIGNAL_DEFS = [
  { value: "acclamati-dalla-critica", terms: ["acclaimed", "critically acclaimed", "award winning", "oscar", "golden globe", "festival"] },
  { value: "anime", terms: ["anime", "animazione", "animation", "cartoon", "ova", "ona"] },
  { value: "astrologia", terms: ["astrologia", "astrology", "zodiac", "oroscopo", "horoscope"] },
  { value: "azione", terms: ["azione", "action", "shounen", "battle", "martial arts", "superhero"] },
  { value: "bambini-e-famiglie", terms: ["family", "famiglia", "kids", "children", "per famiglie", "cartoon"] },
  { value: "campione-d-incassi", terms: ["box office", "blockbuster", "highest grossing", "campione d incassi"] },
  { value: "commedie", terms: ["comedy", "commedia", "humor", "sitcom", "comic"] },
  { value: "documentari", terms: ["documentary", "documentario", "docu"] },
  { value: "drammi", terms: ["drama", "dramma", "drammatico", "melodrama"] },
  { value: "europei", terms: ["europe", "european", "europa"] },
  { value: "fantascienza", terms: ["sci fi", "sci-fi", "science fiction", "fantascienza", "cyberpunk", "space opera"] },
  { value: "fantasy", terms: ["fantasy", "fantastico", "magia", "magic", "isekai", "supernatural", "soprannaturale"] },
  { value: "horror", terms: ["horror", "orrore", "slasher", "creepy"] },
  { value: "internazionali", terms: ["international", "internazionale", "global"] },
  { value: "italiani", terms: ["italy", "italia", "italian", "italiano"] },
  { value: "musica-e-musical", terms: ["music", "musica", "musical", "concert", "band"] },
  { value: "reality", terms: ["reality", "reality show"] },
  { value: "romantici", terms: ["romance", "romantico", "romantica", "love", "sentimentale"] },
  { value: "sport", terms: ["sport", "sports", "basket", "football", "calcio", "tennis"] },
  { value: "thriller", terms: ["thriller", "suspense", "psicologico", "psychological", "crime thriller"] },
  { value: "avventura", terms: ["adventure", "avventura", "journey", "quest"] },
  { value: "crime", terms: ["crime", "gangster", "mafia", "detective", "mystery", "noir", "police"] },
];

const config = {
  providerDirs: [
    path.resolve(process.cwd(), String(args["animeunity-dir"] || "data/providers/animeunity")),
    path.resolve(process.cwd(), String(args["streamingunity-dir"] || "data/providers/streamingunity")),
  ],
  outDir: path.resolve(process.cwd(), String(args["out-dir"] || "data/app")),
  detailShardSize: Math.max(50, toInt(args["detail-shard-size"], 300)),
  episodesShardSize: Math.max(50, toInt(args["episodes-shard-size"], 240)),
  maxItemsPerRow: Math.max(20, toInt(args["max-items-row"], 120)),
  animeEpisodesEnabled: String(args["anime-episodes"] || "1") !== "0",
  animeEpisodesConcurrency: Math.max(1, toInt(args["anime-episodes-concurrency"], 10)),
  animeEpisodesTimeoutMs: Math.max(5000, toInt(args["anime-episodes-timeout"], 25000)),
  animeEpisodesRetries: Math.max(0, toInt(args["anime-episodes-retries"], 2)),
};

const ANIMEUNITY_DEFAULT_BASE_URL = "https://www.animeunity.so";
const ANIMEUNITY_USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";

const animeEpisodesHttp = createHttpClient({
  timeoutMs: config.animeEpisodesTimeoutMs,
  retries: config.animeEpisodesRetries,
  defaultHeaders: {
    "user-agent": ANIMEUNITY_USER_AGENT,
    "accept-language": "it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7",
  },
});

function slugify(value) {
  return normalizeText(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isAnimeUnityItalianVariant(title) {
  return /\((?:ita|italian)\)/i.test(normalizeText(title || ""));
}

function normalizeAnimeUnityBaseTitle(title) {
  return normalizeText(title || "")
    .replace(/\s*[\[(](?:ita|italian)[\])]\s*/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function finiteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function hasAnyImage(item) {
  return Boolean(
    normalizeText(item?.poster || "") ||
      normalizeText(item?.cover || "") ||
      normalizeText(item?.image || "") ||
      normalizeText(item?.background || "")
  );
}

function scoreAnimeUnityCounterpart(target, candidate) {
  let score = 0;
  const targetIds = target?.ids && typeof target.ids === "object" ? target.ids : {};
  const candidateIds = candidate?.ids && typeof candidate.ids === "object" ? candidate.ids : {};

  if (
    finiteNumber(targetIds.malId) &&
    finiteNumber(candidateIds.malId) &&
    finiteNumber(targetIds.malId) === finiteNumber(candidateIds.malId)
  ) {
    score += 120;
  }
  if (
    finiteNumber(targetIds.anilistId) &&
    finiteNumber(candidateIds.anilistId) &&
    finiteNumber(targetIds.anilistId) === finiteNumber(candidateIds.anilistId)
  ) {
    score += 120;
  }

  const targetYear = toYear(target?.year);
  const candidateYear = toYear(candidate?.year);
  if (targetYear && candidateYear && targetYear === candidateYear) {
    score += 20;
  }

  const targetType = normalizeText(target?.type || "").toLowerCase();
  const candidateType = normalizeText(candidate?.type || "").toLowerCase();
  if (targetType && candidateType && targetType === candidateType) {
    score += 20;
  }

  if (normalizeText(candidate?.poster || "")) score += 10;
  if (normalizeText(candidate?.cover || "")) score += 8;
  if (normalizeText(candidate?.background || "")) score += 6;
  if (normalizeText(candidate?.image || "")) score += 4;

  return score;
}

function pickAnimeUnityCounterpart(target, lookup) {
  const title = normalizeText(target?.title || "");
  if (!isAnimeUnityItalianVariant(title)) return null;

  const targetIds = target?.ids && typeof target.ids === "object" ? target.ids : {};
  const candidates = [];

  const malId = finiteNumber(targetIds.malId);
  const anilistId = finiteNumber(targetIds.anilistId);
  if (malId && lookup.byMalId.has(malId)) candidates.push(...lookup.byMalId.get(malId));
  if (anilistId && lookup.byAnilistId.has(anilistId))
    candidates.push(...lookup.byAnilistId.get(anilistId));

  const baseTitle = normalizeAnimeUnityBaseTitle(title);
  if (lookup.byBaseTitle.has(baseTitle)) {
    const byTitle = lookup.byBaseTitle.get(baseTitle);
    if (byTitle.length === 1) {
      const only = byTitle[0];
      const targetYear = toYear(target?.year);
      const candidateYear = toYear(only?.year);
      const targetType = normalizeText(target?.type || "").toLowerCase();
      const candidateType = normalizeText(only?.type || "").toLowerCase();
      const yearOk = !targetYear || !candidateYear || targetYear === candidateYear;
      const typeOk = !targetType || !candidateType || targetType === candidateType;
      if (yearOk && typeOk) candidates.push(only);
    }
  }

  const dedup = new Map();
  for (const item of candidates) {
    if (!item) continue;
    const key = normalizeText(item?.id || item?.slug || item?.title || "");
    if (!key) continue;
    dedup.set(key, item);
  }

  let best = null;
  let bestScore = -1;
  for (const candidate of dedup.values()) {
    if (!hasAnyImage(candidate)) continue;
    const score = scoreAnimeUnityCounterpart(target, candidate);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  if (!best) return null;

  const hasStrongIdMatch =
    (malId &&
      finiteNumber(best?.ids?.malId) &&
      malId === finiteNumber(best?.ids?.malId)) ||
    (anilistId &&
      finiteNumber(best?.ids?.anilistId) &&
      anilistId === finiteNumber(best?.ids?.anilistId));

  if (!hasStrongIdMatch) {
    const base = normalizeAnimeUnityBaseTitle(title);
    const bucket = lookup.byBaseTitle.get(base) || [];
    if (bucket.length !== 1) return null;
  }

  return best;
}

function applyAnimeUnityItalianImageOverrides(items) {
  if (!Array.isArray(items) || items.length === 0) return [];
  const cloned = items.map((item) => ({ ...item }));

  const byMalId = new Map();
  const byAnilistId = new Map();
  const byBaseTitle = new Map();

  for (const item of cloned) {
    const title = normalizeText(item?.title || "");
    if (!title || isAnimeUnityItalianVariant(title)) continue;

    const ids = item?.ids && typeof item.ids === "object" ? item.ids : {};
    const malId = finiteNumber(ids.malId);
    const anilistId = finiteNumber(ids.anilistId);
    const baseTitle = normalizeAnimeUnityBaseTitle(title);

    if (malId) {
      if (!byMalId.has(malId)) byMalId.set(malId, []);
      byMalId.get(malId).push(item);
    }
    if (anilistId) {
      if (!byAnilistId.has(anilistId)) byAnilistId.set(anilistId, []);
      byAnilistId.get(anilistId).push(item);
    }
    if (baseTitle) {
      if (!byBaseTitle.has(baseTitle)) byBaseTitle.set(baseTitle, []);
      byBaseTitle.get(baseTitle).push(item);
    }
  }

  const lookup = { byMalId, byAnilistId, byBaseTitle };

  return cloned.map((item) => {
    const title = normalizeText(item?.title || "");
    if (!isAnimeUnityItalianVariant(title)) return item;

    const counterpart = pickAnimeUnityCounterpart(item, lookup);
    if (!counterpart) return item;

    return {
      ...item,
      image: normalizeText(counterpart.image || item.image || "") || item.image,
      poster: normalizeText(counterpart.poster || counterpart.image || item.poster || "") || item.poster,
      cover: normalizeText(counterpart.cover || item.cover || "") || item.cover,
      background:
        normalizeText(counterpart.background || counterpart.image || item.background || "") ||
        item.background,
      logo: normalizeText(counterpart.logo || item.logo || "") || item.logo,
    };
  });
}

function detectType(item) {
  const raw = normalizeText(item?.type || "").toLowerCase();
  if (raw.includes("movie") || raw.includes("film")) return "movie";
  if (raw.includes("tv") || raw.includes("series") || raw.includes("anime")) return "series";
  return "series";
}

function normalizeArray(values) {
  if (!Array.isArray(values)) return [];
  return values.map((value) => normalizeText(value)).filter(Boolean);
}

function toYear(value) {
  const match = String(value ?? "").match(/\d{4}/);
  return match ? Number(match[0]) : null;
}

function normalizeToken(value) {
  return normalizeText(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['"`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function maturityAge(value) {
  const match = String(value ?? "").match(/\d{1,2}/);
  return match ? Number(match[0]) : 0;
}

function hasAnyToken(tokens, terms) {
  const tokenText = ` ${tokens.join(" ")} `;
  return terms.some((term) => {
    const normalized = normalizeToken(term);
    if (!normalized) return false;
    if (tokens.includes(normalized)) return true;
    return tokenText.includes(` ${normalized} `);
  });
}

function computeCategoryTags({
  provider,
  genres,
  tags,
  keywords,
  score,
  match,
  views,
  dailyViews,
  maturity,
}) {
  const tokens = [];
  for (const value of [...(genres || []), ...(tags || []), ...(keywords || [])]) {
    const normalized = normalizeToken(value);
    if (normalized) tokens.push(normalized);
  }

  const out = [];
  const push = (value) => {
    if (!value || out.includes(value)) return;
    out.push(value);
  };

  for (const def of CATEGORY_SIGNAL_DEFS) {
    if (hasAnyToken(tokens, def.terms || [])) push(def.value);
  }

  if (provider === "animeunity" || hasAnyToken(tokens, ["anime", "animation", "animazione", "cartoon"])) push("anime");
  if ((maturity > 0 && maturity <= 13) || hasAnyToken(tokens, ["kids", "children", "family", "famiglia"])) push("bambini-e-famiglie");
  if (score >= 8) push("acclamati-dalla-critica");
  if (views >= 50000 || dailyViews >= 90 || (match >= 97 && score >= 7.5)) push("campione-d-incassi");

  return out;
}

function toMatch(score) {
  const numeric = toFloat(score, 0);
  if (numeric <= 0) return 85;
  if (numeric <= 10) return Math.max(60, Math.min(99, Math.round(numeric * 10)));
  return Math.max(60, Math.min(99, Math.round(numeric)));
}

function toMaturity(item) {
  const age = Number(item?.age);
  if (Number.isFinite(age) && age > 0) {
    return `${Math.floor(age)}+`;
  }
  return normalizeText(item?.maturity || "") || "16+";
}

function toDuration(item, type) {
  const runtime = Number(item?.runtime);
  if (Number.isFinite(runtime) && runtime > 0) {
    const hours = Math.floor(runtime / 60);
    const minutes = runtime % 60;
    if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
    return `${minutes}m`;
  }

  const seasonsCount = Number(item?.seasonsCount);
  if (Number.isFinite(seasonsCount) && seasonsCount > 0) {
    return `${Math.floor(seasonsCount)} stagioni`;
  }

  const episodesCount = Number(item?.episodesCount);
  if (Number.isFinite(episodesCount) && episodesCount > 0) {
    return `${Math.floor(episodesCount)} episodi`;
  }

  return type === "movie" ? "Film" : "Serie";
}

function includesAny(target, candidates) {
  return candidates.some((value) => target.includes(value));
}

function computeRows(type, genres, isNew, provider) {
  const normalizedGenres = genres.map((genre) => genre.toLowerCase());
  const rows = new Set(["continue", "trending", "catalog-all", `provider-${provider}`]);

  if (type === "movie") rows.add("movies");
  if (type === "series") rows.add("series");

  if (includesAny(normalizedGenres, ["azione", "action", "avventura", "shounen", "battle"])) rows.add("action");
  if (includesAny(normalizedGenres, ["crime", "thriller", "mistero", "mystery", "noir"])) rows.add("crime");
  if (includesAny(normalizedGenres, ["commedia", "comedy", "slice of life", "school"])) rows.add("comedy");
  if (includesAny(normalizedGenres, ["fantasy", "sci-fi", "science fiction", "soprannaturale"])) rows.add("sci-fi");
  if (isNew) rows.add("new-release");

  return [...rows];
}

function splitProviderLocalId(contentId) {
  const text = normalizeText(contentId || "");
  const dash = text.indexOf("-");
  if (dash <= 0) {
    return { provider: "", localId: text };
  }
  return {
    provider: text.slice(0, dash),
    localId: text.slice(dash + 1),
  };
}

function parseAnimeEpisodesLink(rawLink, fallbackAnimeId) {
  const raw = normalizeText(rawLink || "");
  if (!raw) {
    const fallback = normalizeText(fallbackAnimeId || "");
    return fallback ? { animeId: fallback, start: 1, end: 0 } : null;
  }

  if (raw.includes("|")) {
    const [idPart, startPart, endPart] = raw.split("|");
    const animeId = normalizeText(idPart || "");
    if (!animeId) return null;
    const start = Number.parseInt(String(startPart || ""), 10);
    const end = Number.parseInt(String(endPart || ""), 10);
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
  return null;
}

function normalizeEpisodeNumber(value, fallbackNumber) {
  const text = normalizeText(value || "");
  if (!text) return fallbackNumber;
  const parsed = Number.parseFloat(text.replace(",", "."));
  if (!Number.isFinite(parsed)) return fallbackNumber;
  return parsed;
}

function mapAnimeEpisode(episode, index, seasonNumber) {
  const episodeId = normalizeText(episode?.id || "");
  if (!episodeId) return null;
  const episodeNumber = normalizeEpisodeNumber(episode?.number, index + 1);
  const directLink = normalizeText(episode?.link || "");
  return {
    title: `Episode ${String(episode?.number || index + 1)}`,
    episodeNumber,
    seasonNumber,
    link: /^https?:\/\//i.test(directLink) ? directLink : episodeId,
  };
}

function buildAnimeEpisodeTasks(details) {
  const tasks = [];
  const seen = new Set();
  for (const detail of details) {
    if (detail?.provider !== "animeunity") continue;
    const playbackLinks = Array.isArray(detail?.playback?.linkList) ? detail.playback.linkList : [];
    const localId = splitProviderLocalId(detail.id).localId;
    for (const link of playbackLinks) {
      const seasonKey = normalizeText(link?.seasonKey || link?.episodesLink || link?.title || "");
      if (!seasonKey) continue;
      const parsed = parseAnimeEpisodesLink(link?.episodesLink, localId);
      if (!parsed?.animeId) continue;
      const taskKey = `${detail.id}::${seasonKey}`;
      if (seen.has(taskKey)) continue;
      seen.add(taskKey);
      tasks.push({
        key: taskKey,
        animeId: parsed.animeId,
        start: parsed.start,
        end: parsed.end,
        seasonNumber: Number(link?.seasonNumber || 0) || undefined,
      });
    }
  }
  return tasks;
}

async function fetchAnimeEpisodesForTask(task, baseUrl) {
  const safeBaseUrl = String(baseUrl || "").replace(/\/+$/, "") || ANIMEUNITY_DEFAULT_BASE_URL;
  const startRange = task.start <= 1 ? 0 : task.start;
  const endRange = task.end > 0 ? task.end : Math.max(startRange + 119, 120);
  const response = await animeEpisodesHttp.requestJson({
    url: `${safeBaseUrl}/info_api/${task.animeId}/1?start_range=${startRange}&end_range=${endRange}`,
    headers: {
      accept: "application/json",
      referer: `${safeBaseUrl}/`,
    },
  });
  if (response.statusCode < 200 || response.statusCode >= 400) return [];
  const list = Array.isArray(response.data?.episodes) ? response.data.episodes : [];
  const episodes = list
    .map((entry, index) => mapAnimeEpisode(entry, index, task.seasonNumber))
    .filter(Boolean);
  if (task.end > 0) {
    return episodes
      .filter((episode) => {
        const number = Number(episode?.episodeNumber);
        if (!Number.isFinite(number)) return true;
        return number >= task.start && number <= task.end + 0.001;
      })
      .sort((a, b) => Number(a.episodeNumber || 0) - Number(b.episodeNumber || 0));
  }
  return episodes.sort((a, b) => Number(a.episodeNumber || 0) - Number(b.episodeNumber || 0));
}

async function buildAnimeEpisodesMap(details, animeBaseUrl) {
  const tasks = buildAnimeEpisodeTasks(details);
  const out = new Map();
  if (!tasks.length) {
    return {
      map: out,
      totalTasks: 0,
      completed: 0,
      withEpisodes: 0,
      failures: 0,
    };
  }

  let completed = 0;
  let withEpisodes = 0;
  let failures = 0;
  await asyncMapLimit(tasks, config.animeEpisodesConcurrency, async (task) => {
    try {
      const episodes = await fetchAnimeEpisodesForTask(task, animeBaseUrl);
      out.set(task.key, episodes);
      if (episodes.length > 0) withEpisodes += 1;
    } catch {
      out.set(task.key, []);
      failures += 1;
    }
    completed += 1;
    if (completed % 250 === 0 || completed === tasks.length) {
      console.log(
        `[app-catalog] anime episodes ${completed}/${tasks.length} (withEpisodes=${withEpisodes}, failures=${failures})`
      );
    }
  });

  return {
    map: out,
    totalTasks: tasks.length,
    completed,
    withEpisodes,
    failures,
  };
}

function buildAnimeUnityPlayback(item, detailId) {
  const { localId } = splitProviderLocalId(detailId);
  const episodesCount = Number(item?.episodesCount) || 0;
  const linkList = [];
  const rangeSize = 120;
  if (episodesCount > 0 && localId) {
    let start = 1;
    let seasonNumber = 1;
    while (start <= episodesCount) {
      const end = Math.min(start + rangeSize - 1, episodesCount);
      linkList.push({
        title: `Episodes ${start}-${end}`,
        seasonNumber,
        seasonKey: `range-${start}-${end}`,
        availabilityStatus: "available",
        episodesLink: `${localId}|${start}|${end}`,
      });
      seasonNumber += 1;
      start = end + 1;
    }
  } else if (localId) {
    linkList.push({
      title: "Episodes",
      seasonNumber: 1,
      seasonKey: "default",
      availabilityStatus: "available",
      episodesLink: localId,
    });
  }
  return {
    linkList,
    defaultSeasonKey: linkList[0]?.seasonKey || undefined,
  };
}

function buildStreamingUnityPlayback(item, pageLink, watchLink) {
  const linkList = [];
  const seasons = Array.isArray(item?.seasons) ? item.seasons : [];
  const sorted = [...seasons].sort((a, b) => Number(a?.number || 0) - Number(b?.number || 0));
  for (const season of sorted) {
    const seasonNumber = Number(season?.number || 0);
    if (!seasonNumber || !pageLink) continue;
    const seasonName = normalizeText(season?.name || "") || `Season ${seasonNumber}`;
    linkList.push({
      title: seasonName,
      seasonNumber,
      seasonKey: `season-${seasonNumber}`,
      availabilityStatus: "available",
      episodesLink: `${pageLink}/season-${seasonNumber}`,
    });
  }
  if (linkList.length === 0) {
    linkList.push({
      title: "Play",
      seasonKey: "movie",
      availabilityStatus: "available",
      directLinks: [
        {
          title: "Play",
          link: watchLink || pageLink || "",
          type: "movie",
        },
      ],
    });
  }
  return {
    linkList,
    defaultSeasonKey: linkList[0]?.seasonKey || undefined,
  };
}

function buildSummaryAndDetail(item, provider) {
  const title = normalizeText(item?.title || "");
  if (!title) return null;

  const type = detectType(item);
  const year = toYear(item?.year || item?.releaseDate || item?.lastAirDate) || nowYear;
  const genres = [...new Set([...normalizeArray(item?.genres), ...normalizeArray(item?.tags)])];
  const tags = normalizeArray(item?.tags);
  const keywords = normalizeArray(item?.keywords);
  const cast = normalizeArray(item?.cast);
  const directors = normalizeArray(item?.directors);
  const people = [...cast, ...directors];

  const score = toFloat(item?.score, 0);
  const match = toMatch(score);
  const isNew = year >= nowYear - 1;
  const views = Number(item?.stats?.views) || 0;
  const dailyViews = Number(item?.stats?.dailyViews) || 0;
  const maturity = toMaturity(item);
  const categoryTags = computeCategoryTags({
    provider,
    genres,
    tags,
    keywords,
    score,
    match,
    views,
    dailyViews,
    maturity: maturityAge(maturity),
  });
  const rows = computeRows(type, genres, isNew, provider);
  const localId = normalizeText(item?.id || item?.slug || slugify(title) || `${provider}-${year}`);
  const id = `${provider}-${localId}`;

  const poster = normalizeText(item?.poster || item?.image || item?.cover || item?.background || "");
  const backdrop = normalizeText(item?.background || item?.cover || item?.image || item?.poster || "");
  const synopsis = normalizeText(item?.synopsis || "");
  const sourceLink =
    provider === "streamingunity"
      ? normalizeText(item?.link || item?.watchLink || "")
      : normalizeText(item?.watchLink || item?.link || "");

  const summary = {
    id,
    provider,
    title,
    kicker: `${provider === "animeunity" ? "AnimeUnity" : "StreamingUnity"} ${type === "movie" ? "Film" : "Serie"}`,
    type,
    year,
    maturity,
    duration: toDuration(item, type),
    genres: genres.length > 0 ? genres : ["Anime"],
    cast: people.length > 0 ? people.slice(0, 6).join(", ") : "N/D",
    description: synopsis || "Sinossi non disponibile.",
    match,
    isNew,
    rank: 0,
    progress: 0,
    rows,
    poster: poster || "",
    backdrop: backdrop || "",
    score,
    views,
    dailyViews,
    categoryTags,
    sourceLink,
    detailChunk: "",
  };

  const pageLink = normalizeText(item?.link || "");
  const watchLink = normalizeText(item?.watchLink || "");
  const playback =
    provider === "animeunity"
      ? buildAnimeUnityPlayback(item, id)
      : buildStreamingUnityPlayback(item, pageLink, watchLink);

  const detail = {
    id,
    provider,
    title,
    synopsis: synopsis || "Sinossi non disponibile.",
    type,
    status: normalizeText(item?.status || "") || undefined,
    season: normalizeText(item?.season || "") || undefined,
    year,
    score: Number.isFinite(score) ? score : undefined,
    maturity: summary.maturity,
    duration: summary.duration,
    episodesCount: Number(item?.episodesCount) || undefined,
    seasonsCount: Number(item?.seasonsCount) || undefined,
    runtime: Number(item?.runtime) || undefined,
    releaseDate: normalizeText(item?.releaseDate || "") || undefined,
    lastAirDate: normalizeText(item?.lastAirDate || "") || undefined,
    quality: normalizeText(item?.quality || "") || undefined,
    studio: normalizeText(item?.studio || "") || undefined,
    dubbed: item?.dubbed,
    dubIta: item?.dubIta,
    subIta: item?.subIta,
    genres: normalizeArray(item?.genres),
    tags: normalizeArray(item?.tags),
    keywords: normalizeArray(item?.keywords),
    cast,
    directors,
    ids: item?.ids && typeof item.ids === "object" ? item.ids : {},
    stats: item?.stats && typeof item.stats === "object" ? item.stats : {},
    images: {
      image: normalizeText(item?.image || "") || undefined,
      poster: normalizeText(item?.poster || "") || undefined,
      cover: normalizeText(item?.cover || "") || undefined,
      background: normalizeText(item?.background || "") || undefined,
      logo: normalizeText(item?.logo || "") || undefined,
    },
    links: {
      page: pageLink || undefined,
      watch: watchLink || undefined,
      source: sourceLink || undefined,
    },
    related: Array.isArray(item?.related) ? item.related : [],
    seasons: Array.isArray(item?.seasons) ? item.seasons : [],
    loadedSeason:
      item?.loadedSeason && typeof item.loadedSeason === "object" ? item.loadedSeason : undefined,
    playback,
    raw: item?.raw,
  };

  return { summary, detail };
}

function buildEpisodesSeasonItems(detail, animeEpisodesMap = null) {
  const out = [];
  const playbackLinks = Array.isArray(detail?.playback?.linkList) ? detail.playback.linkList : [];
  const localId = splitProviderLocalId(detail.id).localId;
  const loadedSeason = detail?.loadedSeason && typeof detail.loadedSeason === "object" ? detail.loadedSeason : null;
  const loadedNumber = Number(loadedSeason?.number || 0) || undefined;
  const loadedEpisodes = Array.isArray(loadedSeason?.episodes) ? loadedSeason.episodes : [];

  for (const link of playbackLinks) {
    const seasonNumber = Number(link?.seasonNumber || 0) || undefined;
    const seasonKey = normalizeText(link?.seasonKey || link?.episodesLink || link?.title || "");
    if (!seasonKey) continue;

    let episodes = [];
    if (Array.isArray(link?.directLinks) && link.directLinks.length > 0) {
      episodes = link.directLinks.map((episode, index) => ({
        title: normalizeText(episode?.title || `Episode ${index + 1}`),
        episodeNumber: Number(episode?.episodeNumber || index + 1) || index + 1,
        seasonNumber,
        link: normalizeText(episode?.link || ""),
      }));
    } else if (detail.provider === "animeunity" && animeEpisodesMap) {
      const key = `${detail.id}::${seasonKey}`;
      const staticEpisodes = animeEpisodesMap.get(key);
      if (Array.isArray(staticEpisodes) && staticEpisodes.length > 0) {
        episodes = staticEpisodes;
      }
    } else if (
      detail.provider === "streamingunity" &&
      loadedNumber &&
      seasonNumber &&
      loadedNumber === seasonNumber &&
      loadedEpisodes.length > 0
    ) {
      episodes = loadedEpisodes
        .map((episode, index) => {
          const episodeId = normalizeText(episode?.id || "");
          if (!episodeId || !localId) return null;
          const episodeTitle = normalizeText(episode?.name || "") || `Episode ${episode?.number || index + 1}`;
          return {
            title: episodeTitle,
            episodeNumber: Number(episode?.number || index + 1) || index + 1,
            seasonNumber,
            link: `${localId}::${episodeId}`,
          };
        })
        .filter(Boolean);
    }

    out.push({
      contentId: detail.id,
      provider: detail.provider,
      seasonKey,
      seasonNumber,
      seasonTitle: normalizeText(link?.title || "") || "Season",
      episodesLink: normalizeText(link?.episodesLink || "") || undefined,
      episodes,
    });
  }

  return out;
}

function tokenizeText(value) {
  return normalizeToken(value)
    .split(/\s+/)
    .filter(Boolean);
}

function buildSearchIndexEntry(summary, detail) {
  const aliases = uniqueBy(
    [
      summary.title,
      ...(detail?.genres || []),
      ...(detail?.tags || []),
      ...(detail?.keywords || []),
      ...(detail?.cast || []),
      ...(detail?.directors || []),
      ...(Array.isArray(detail?.related) ? detail.related.map((item) => normalizeText(item?.title || "")) : []),
    ].filter(Boolean),
    (value) => normalizeText(value).toLowerCase()
  ).slice(0, 80);

  const tokenSource = `${summary.title} ${aliases.join(" ")} ${summary.year} ${summary.provider} ${summary.type}`;
  const tokens = uniqueBy(tokenizeText(tokenSource), (value) => value).slice(0, 180);

  return {
    id: summary.id,
    provider: summary.provider,
    title: summary.title,
    type: summary.type,
    year: summary.year,
    aliases,
    tokens,
  };
}

async function readProviderCatalog(providerDir) {
  const indexPath = path.join(providerDir, "index.json");
  const raw = await fs.readFile(indexPath, "utf8");
  const index = JSON.parse(raw);
  const chunks = Array.isArray(index?.chunks) ? index.chunks : [];
  const items = [];

  for (const chunk of chunks) {
    const chunkPath = path.join(providerDir, String(chunk.file || ""));
    const chunkRaw = await fs.readFile(chunkPath, "utf8");
    const chunkData = JSON.parse(chunkRaw);
    if (Array.isArray(chunkData?.items)) {
      items.push(...chunkData.items);
    }
  }

  return {
    index,
    items,
    providerDir,
  };
}

function rowConfigs() {
  return [
    { id: "continue", title: "Continua a guardare" },
    { id: "trending", title: "Di tendenza adesso" },
    { id: "top10", title: "Top 10 del catalogo", top10: true },
    { id: "catalog-all", title: "Catalogo completo" },
    { id: "provider-animeunity", title: "AnimeUnity" },
    { id: "provider-streamingunity", title: "StreamingUnity" },
    { id: "movies", title: "Film" },
    { id: "series", title: "Serie TV" },
    { id: "action", title: "Azione ad alta tensione" },
    { id: "crime", title: "Crime e thriller" },
    { id: "comedy", title: "Commedie da non perdere" },
    { id: "sci-fi", title: "Sci-fi e fantasy" },
    { id: "new-release", title: "Nuove uscite" },
  ];
}

async function run() {
  console.log("[app-catalog] start");
  console.log(
    `[app-catalog] config outDir=${config.outDir} detailShardSize=${config.detailShardSize} episodesShardSize=${config.episodesShardSize} maxItemsPerRow=${config.maxItemsPerRow}`
  );

  const providerPayloads = [];
  for (const providerDir of config.providerDirs) {
    try {
      const payload = await readProviderCatalog(providerDir);
      providerPayloads.push(payload);
      console.log(
        `[app-catalog] loaded provider=${payload.index.provider} items=${payload.items.length} dir=${providerDir}`
      );
    } catch (error) {
      console.warn(`[app-catalog] skip provider dir=${providerDir} reason=${error?.message || error}`);
    }
  }

  if (providerPayloads.length === 0) {
    throw new Error("No provider catalogs available");
  }

  const summaries = [];
  const details = [];
  for (const payload of providerPayloads) {
    const provider = normalizeText(payload?.index?.provider || "");
    if (!provider) continue;
    const sourceItems =
      provider === "animeunity"
        ? applyAnimeUnityItalianImageOverrides(payload.items)
        : payload.items;
    for (const item of sourceItems) {
      const mapped = buildSummaryAndDetail(item, provider);
      if (!mapped) continue;
      summaries.push(mapped.summary);
      details.push(mapped.detail);
    }
  }

  summaries.sort((a, b) => b.match - a.match || a.title.localeCompare(b.title, "it"));
  details.sort((a, b) => a.title.localeCompare(b.title, "it"));

  summaries.slice(0, 10).forEach((item, index) => {
    item.rank = index + 1;
    if (!item.rows.includes("top10")) item.rows.push("top10");
  });

  const detailsById = new Map(details.map((item) => [item.id, item]));
  const outDetailsDir = path.join(config.outDir, "catalog-details");
  await fs.mkdir(config.outDir, { recursive: true });
  await fs.rm(outDetailsDir, { recursive: true, force: true });
  await fs.mkdir(outDetailsDir, { recursive: true });

  const detailChunks = [];
  const summaryById = new Map(summaries.map((item) => [item.id, item]));
  const detailsOrdered = summaries.map((summary) => detailsById.get(summary.id)).filter(Boolean);
  for (
    let start = 0, chunkIndex = 0;
    start < detailsOrdered.length;
    start += config.detailShardSize, chunkIndex += 1
  ) {
    const chunkItems = detailsOrdered.slice(start, start + config.detailShardSize);
    const fileName = `chunk-${String(chunkIndex + 1).padStart(4, "0")}.json`;
    const relFile = `catalog-details/${fileName}`;
    await writeJsonAtomic(
      path.join(config.outDir, relFile),
      {
        schemaVersion: 2,
        generatedAt: new Date().toISOString(),
        chunk: chunkIndex + 1,
        count: chunkItems.length,
        items: chunkItems,
      },
      true
    );
    for (const detail of chunkItems) {
      const target = summaryById.get(detail.id);
      if (target) target.detailChunk = relFile;
    }
    detailChunks.push({ file: relFile, count: chunkItems.length, chunk: chunkIndex + 1 });
  }

  const animeProviderPayload = providerPayloads.find(
    (payload) => normalizeText(payload?.index?.provider || "") === "animeunity"
  );
  const animeBaseUrl =
    normalizeText(animeProviderPayload?.index?.source?.baseUrl || "") || ANIMEUNITY_DEFAULT_BASE_URL;
  const animeEpisodesMeta = config.animeEpisodesEnabled
    ? await buildAnimeEpisodesMap(detailsOrdered, animeBaseUrl)
    : {
        map: new Map(),
        totalTasks: 0,
        completed: 0,
        withEpisodes: 0,
        failures: 0,
      };
  if (config.animeEpisodesEnabled) {
    console.log(
      `[app-catalog] anime episodes map built (tasks=${animeEpisodesMeta.totalTasks}, withEpisodes=${animeEpisodesMeta.withEpisodes}, failures=${animeEpisodesMeta.failures}, baseUrl=${animeBaseUrl})`
    );
  }

  const episodesSeasonItems = detailsOrdered
    .flatMap((detail) => buildEpisodesSeasonItems(detail, animeEpisodesMeta.map))
    .filter(Boolean);
  const episodesShardResult = await writeShardedJson({
    outDir: config.outDir,
    indexFileName: "episodes-index.json",
    chunksDirName: "episodes-chunks",
    shardSize: config.episodesShardSize,
    items: episodesSeasonItems,
    indexPayload: {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      kind: "episodes-season-index",
    },
    pretty: true,
  });

  const searchIndex = summaries
    .map((summary) => buildSearchIndexEntry(summary, detailsById.get(summary.id)))
    .filter(Boolean);
  await writeJsonAtomic(path.join(config.outDir, "search-index.json"), searchIndex, true);

  const generatedAt = new Date().toISOString();
  const indexPayload = {
    schemaVersion: 2,
    generatedAt,
    totalItems: summaries.length,
    featuredId: summaries[0]?.id || "",
    maxItemsPerRow: config.maxItemsPerRow,
    rowConfigs: rowConfigs(),
    providers: providerPayloads.map((payload) => ({
      provider: payload.index.provider,
      generatedAt: payload.index.generatedAt,
      count: payload.items.length,
      source: payload.index.source,
      stats: payload.index.stats,
      includeRaw: payload.index.includeRaw === true,
    })),
    detailChunks,
    searchIndex: "search-index.json",
    episodesIndex: "episodes-index.json",
    items: summaries,
  };

  await writeJsonAtomic(path.join(config.outDir, "catalog-index.json"), indexPayload, true);

  const version = generatedAt.replace(/[^0-9]/g, "").slice(0, 14);
  const manifestPayload = {
    schemaVersion: 1,
    version,
    generatedAt,
    datasets: {
      catalogIndex: "data/app/catalog-index.json",
      searchIndex: "data/app/search-index.json",
      episodesIndex: "data/app/episodes-index.json",
    },
    counts: {
      totalItems: summaries.length,
      detailChunks: detailChunks.length,
      searchEntries: searchIndex.length,
      episodeSeasons: episodesSeasonItems.length,
    },
  };
  await writeJsonAtomic(path.join(config.outDir, "manifest.json"), manifestPayload, true);

  console.log(
    `[app-catalog] done -> ${path.join(config.outDir, "catalog-index.json")} (items=${summaries.length}, detailChunks=${detailChunks.length}, episodes=${episodesShardResult.count}, search=${searchIndex.length})`
  );
}

run().catch((error) => {
  console.error("[app-catalog] fatal", error);
  process.exitCode = 1;
});

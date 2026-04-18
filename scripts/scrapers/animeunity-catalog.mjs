#!/usr/bin/env node
import path from "node:path";
import {
  parseCliArgs,
  toInt,
  toBool,
  toFloat,
  normalizeText,
  decodeHtmlEntities,
  uniqueBy,
  writeShardedJson,
  asyncMapLimit,
  sleep,
  createHttpClient,
} from "./shared.mjs";

const USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
const PAGE_SIZE = 30;

const args = parseCliArgs(process.argv.slice(2));

const config = {
  baseUrl: String(args.baseUrl || "https://www.animeunity.so").replace(/\/+$/, ""),
  outDir: path.resolve(
    process.cwd(),
    String(args["out-dir"] || "data/providers/animeunity")
  ),
  shardSize: Math.max(50, toInt(args["shard-size"], 250)),
  includeRaw: toBool(args["include-raw"], false),
  maxPages: toInt(args["max-pages"], Number.POSITIVE_INFINITY),
  maxItems: toInt(args["max-items"], Number.POSITIVE_INFINITY),
  detailConcurrency: Math.max(1, toInt(args["detail-concurrency"], 8)),
  timeoutMs: Math.max(5000, toInt(args.timeout, 30000)),
  retries: Math.max(0, toInt(args.retries, 3)),
  explicitIds: uniqueBy(
    String(args.ids || "")
      .split(",")
      .map((value) => toInt(value, 0))
      .filter((id) => id > 0),
    (id) => String(id)
  ),
};

const http = createHttpClient({
  timeoutMs: config.timeoutMs,
  retries: config.retries,
  defaultHeaders: {
    "user-agent": USER_AGENT,
    accept: "application/json",
  },
});

function extractCookieValue(setCookieArray, name) {
  for (const item of setCookieArray) {
    const match = String(item).match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
    if (match?.[1]) return match[1];
  }
  return "";
}

function extractSetCookies(headers) {
  const value = headers?.["set-cookie"];
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function extractCsrfFromHtml(html) {
  const match = String(html || "").match(/name="csrf-token" content="([^"]+)"/i);
  return match?.[1] ? decodeHtmlEntities(match[1]) : "";
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeImageUrl(value) {
  const text = normalizeText(value);
  if (!text) return "";
  if (/^https?:\/\//i.test(text)) return text;
  if (text.startsWith("//")) return `https:${text}`;
  return text;
}

function buildAnimeLink(baseUrl, id, slug) {
  if (!id) return "";
  const safeSlug = normalizeText(slug || "").replace(/^\/+/, "");
  return `${baseUrl}/anime/${id}${safeSlug ? `-${safeSlug}` : ""}`;
}

function parseAnimePayloadFromHtml(html) {
  const source = String(html || "");
  const patterns = [/anime="([^"]+)"/i, /anime='([^']+)'/i];
  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (!match?.[1]) continue;
    const decoded = decodeHtmlEntities(match[1]);
    try {
      return JSON.parse(decoded);
    } catch {
      continue;
    }
  }
  return null;
}

function normalizeGenreList(raw) {
  if (!Array.isArray(raw)) return [];
  return uniqueBy(
    raw
      .map((item) => {
        if (!item) return "";
        if (typeof item === "string") return normalizeText(item);
        return normalizeText(item.name || "");
      })
      .filter(Boolean),
    (value) => value.toLowerCase()
  );
}

function normalizeRelated(infoRelated, baseUrl) {
  if (!Array.isArray(infoRelated)) return [];
  return infoRelated
    .map((item) => {
      const id = item?.id ?? null;
      const slug = normalizeText(item?.slug || "");
      const title = normalizeText(
        item?.title_eng || item?.title || item?.title_it || item?.name || ""
      );
      const image = normalizeImageUrl(item?.imageurl || item?.image || "");
      return {
        id,
        slug: slug || undefined,
        title,
        image: image || undefined,
        type: normalizeText(item?.type || item?.relation || "") || undefined,
        year: normalizeText(item?.date || item?.year || "") || undefined,
        link: buildAnimeLink(baseUrl, id, slug),
      };
    })
    .filter((item) => item.id && item.title);
}

function firstText(...values) {
  for (const value of values) {
    const text = normalizeText(value);
    if (text) return text;
  }
  return "";
}

function pickIds(info, htmlAnime, archiveItem) {
  return {
    malId:
      toNumber(info?.mal_id) ??
      toNumber(htmlAnime?.mal_id) ??
      toNumber(archiveItem?.mal_id),
    anilistId:
      toNumber(info?.anilist_id) ??
      toNumber(htmlAnime?.anilist_id) ??
      toNumber(archiveItem?.anilist_id),
    crunchyId:
      info?.crunchy_id ??
      htmlAnime?.crunchy_id ??
      archiveItem?.crunchy_id ??
      undefined,
    disneyId:
      info?.disney_id ??
      htmlAnime?.disney_id ??
      archiveItem?.disney_id ??
      undefined,
    netflixId:
      info?.netflix_id ??
      htmlAnime?.netflix_id ??
      archiveItem?.netflix_id ??
      undefined,
    primeId:
      info?.prime_id ??
      htmlAnime?.prime_id ??
      archiveItem?.prime_id ??
      undefined,
  };
}

function countKnownIds(ids) {
  return Object.values(ids || {}).filter((value) => {
    if (value === undefined || value === null) return false;
    if (typeof value === "number") return Number.isFinite(value) && value > 0;
    if (typeof value === "string") {
      const text = normalizeText(value);
      return text !== "" && text !== "0";
    }
    return false;
  }).length;
}

function hasMeaningfulAnimeData(payload) {
  if (!payload || typeof payload !== "object") return false;
  if (firstText(payload.title_eng, payload.title, payload.title_it, payload.name)) return true;
  if (firstText(payload.plot, payload.synopsis)) return true;
  if (Array.isArray(payload.genres) && payload.genres.length > 0) return true;
  if (toNumber(payload.mal_id) || toNumber(payload.anilist_id)) return true;
  return false;
}

function isSoftIncomplete(entry) {
  return (
    !normalizeText(entry?.title) ||
    !normalizeText(entry?.synopsis) ||
    !Array.isArray(entry?.genres) ||
    entry.genres.length === 0 ||
    countKnownIds(entry?.ids) === 0
  );
}

function buildNormalizedEntry(archiveItem, info, htmlAnime, baseUrl, includeRaw) {
  const title = firstText(
    info?.title_eng,
    info?.title,
    info?.title_it,
    htmlAnime?.title_eng,
    htmlAnime?.title,
    htmlAnime?.title_it,
    archiveItem?.title_eng,
    archiveItem?.title,
    archiveItem?.title_it
  );
  const slug = firstText(archiveItem?.slug, info?.slug, htmlAnime?.slug);
  const id = archiveItem?.id ?? info?.id ?? htmlAnime?.id ?? null;
  const plot = firstText(info?.plot, htmlAnime?.plot, archiveItem?.plot);
  const type = firstText(info?.type, htmlAnime?.type, archiveItem?.type);
  const status = firstText(info?.status, htmlAnime?.status, archiveItem?.status);
  const season = firstText(info?.season, htmlAnime?.season, archiveItem?.season);
  const yearMatch = String(info?.date || htmlAnime?.date || archiveItem?.date || "").match(/\d{4}/);
  const year = yearMatch?.[0] || undefined;
  const score =
    toFloat(info?.score, undefined) ??
    toFloat(htmlAnime?.score, undefined) ??
    toFloat(archiveItem?.score, undefined) ??
    undefined;
  const episodesCount =
    toInt(info?.episodes_count, 0) ||
    toInt(htmlAnime?.episodes_count, 0) ||
    toInt(archiveItem?.episodes_count, 0) ||
    undefined;

  const image = normalizeImageUrl(
    info?.imageurl || htmlAnime?.imageurl || archiveItem?.imageurl || archiveItem?.imageUrl || ""
  );
  const cover = normalizeImageUrl(info?.cover || htmlAnime?.cover || archiveItem?.cover || "");
  const background = normalizeImageUrl(
    info?.imageurl_cover || htmlAnime?.imageurl_cover || archiveItem?.imageurl_cover || cover || image || ""
  );
  const genres = normalizeGenreList(
    (Array.isArray(info?.genres) && info.genres.length > 0
      ? info.genres
      : Array.isArray(htmlAnime?.genres) && htmlAnime.genres.length > 0
      ? htmlAnime.genres
      : archiveItem?.genres) || []
  );
  const tags = uniqueBy(
    [...genres, type, status, season, year].filter(Boolean),
    (value) => value.toLowerCase()
  );
  const ids = pickIds(info, htmlAnime, archiveItem);

  const relatedRaw =
    (Array.isArray(info?.related) && info.related.length > 0
      ? info.related
      : Array.isArray(htmlAnime?.related) && htmlAnime.related.length > 0
      ? htmlAnime.related
      : []) || [];

  return {
    id,
    slug: slug || undefined,
    link: buildAnimeLink(baseUrl, id, slug),
    title,
    synopsis: plot,
    type: type || undefined,
    status: status || undefined,
    season: season || undefined,
    year,
    score,
    episodesCount,
    dubbed:
      info?.dub === 1 ||
      info?.dub === true ||
      info?.dub === "1" ||
      htmlAnime?.dub === 1 ||
      htmlAnime?.dub === true ||
      htmlAnime?.dub === "1" ||
      archiveItem?.dub === 1 ||
      archiveItem?.dub === true ||
      archiveItem?.dub === "1" ||
      undefined,
    studio: firstText(info?.studio, htmlAnime?.studio, archiveItem?.studio) || undefined,
    image: background || image || cover || undefined,
    poster: image || undefined,
    cover: cover || undefined,
    background: background || undefined,
    genres,
    tags,
    ids,
    related: normalizeRelated(relatedRaw, baseUrl),
    ...(includeRaw
      ? {
          raw: {
            archive: archiveItem,
            infoApi: info || null,
            htmlAnime: htmlAnime || null,
          },
        }
      : {}),
  };
}

async function fetchAnimeDetailsWithRetry(baseUrl, id, slug, maxAttempts = 3) {
  let lastInfo = null;
  let lastHtml = null;
  let infoAttempts = 0;
  let htmlAttempts = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const [info, htmlAnime] = await Promise.all([
      fetchAnimeInfo(baseUrl, id),
      fetchAnimeHtmlData(baseUrl, id, slug),
    ]);

    if (info) {
      lastInfo = info;
      infoAttempts += 1;
    }
    if (htmlAnime) {
      lastHtml = htmlAnime;
      htmlAttempts += 1;
    }

    if (hasMeaningfulAnimeData(lastInfo) || hasMeaningfulAnimeData(lastHtml)) {
      break;
    }
    if (attempt < maxAttempts) {
      await sleep(250 * attempt);
    }
  }

  return {
    info: lastInfo || {},
    htmlAnime: lastHtml || {},
    infoMissing: !hasMeaningfulAnimeData(lastInfo),
    htmlMissing: !hasMeaningfulAnimeData(lastHtml),
    infoAttempts,
    htmlAttempts,
  };
}

async function createSession(baseUrl) {
  const response = await http.request({
    url: `${baseUrl}/`,
    headers: {
      accept: "text/html,application/xhtml+xml",
    },
  });
  if (response.statusCode < 200 || response.statusCode >= 400) {
    throw new Error(`AnimeUnity session init failed (${response.statusCode})`);
  }
  const setCookies = extractSetCookies(response.headers);
  const xsrfEncoded = extractCookieValue(setCookies, "XSRF-TOKEN");
  const sessionCookie = extractCookieValue(setCookies, "animeunity_session");
  const csrfMeta = extractCsrfFromHtml(response.body);
  const token = decodeURIComponent(xsrfEncoded || csrfMeta || "");
  if (!token || !sessionCookie) {
    throw new Error("AnimeUnity session cookies missing");
  }
  return {
    token,
    sessionCookie,
  };
}

function buildArchiveHeaders(baseUrl, session) {
  return {
    accept: "application/json",
    "content-type": "application/json",
    origin: baseUrl,
    referer: `${baseUrl}/`,
    "x-xsrf-token": session.token,
    cookie: `XSRF-TOKEN=${encodeURIComponent(
      session.token
    )}; animeunity_session=${session.sessionCookie}`,
  };
}

async function fetchArchivePage(baseUrl, session, offset) {
  const payload = {
    title: false,
    type: false,
    year: false,
    order: false,
    status: false,
    genres: false,
    offset,
    dubbed: false,
    season: false,
  };
  const response = await http.requestJson({
    url: `${baseUrl}/archivio/get-animes`,
    method: "POST",
    headers: buildArchiveHeaders(baseUrl, session),
    body: payload,
  });
  if (response.statusCode < 200 || response.statusCode >= 400) {
    return null;
  }
  const data = response.data || {};
  if (!Array.isArray(data.records)) return null;
  return {
    records: data.records,
    total: toInt(data.tot, undefined),
  };
}

async function fetchAnimeInfo(baseUrl, id) {
  const response = await http.requestJson({
    url: `${baseUrl}/info_api/${id}/`,
    headers: {
      accept: "application/json",
      referer: `${baseUrl}/`,
    },
  });
  return response.statusCode >= 200 && response.statusCode < 400
    ? response.data || null
    : null;
}

async function fetchAnimeHtmlData(baseUrl, id, slug) {
  const safeSlug = normalizeText(slug || "");
  const url = `${baseUrl}/anime/${id}${safeSlug ? `-${safeSlug}` : ""}`;
  const response = await http.request({
    url,
    headers: {
      accept: "text/html,application/xhtml+xml",
      referer: `${baseUrl}/`,
    },
  });
  if (response.statusCode < 200 || response.statusCode >= 400) {
    return null;
  }
  return parseAnimePayloadFromHtml(response.body);
}

async function run() {
  const start = Date.now();
  console.log("[animeunity] start");
  console.log(
    `[animeunity] config baseUrl=${config.baseUrl} outDir=${config.outDir} shardSize=${config.shardSize} includeRaw=${config.includeRaw} maxPages=${config.maxPages} maxItems=${config.maxItems} detailConcurrency=${config.detailConcurrency} ids=${config.explicitIds.length}`
  );

  let archiveItems = [];
  if (config.explicitIds.length > 0) {
    archiveItems = config.explicitIds.map((id) => ({ id }));
    console.log(`[animeunity] explicit ids mode enabled (${archiveItems.length} ids)`);
  } else {
    let session = await createSession(config.baseUrl);
    const archiveMap = new Map();
    let totalFromApi = undefined;

    for (let page = 1; page <= config.maxPages; page += 1) {
      const offset = (page - 1) * PAGE_SIZE;
      let archivePage = await fetchArchivePage(config.baseUrl, session, offset);
      if (!archivePage) {
        session = await createSession(config.baseUrl);
        archivePage = await fetchArchivePage(config.baseUrl, session, offset);
      }
      if (!archivePage) {
        console.warn(`[animeunity] archive page ${page} failed`);
        break;
      }

      const records = archivePage.records || [];
      totalFromApi = archivePage.total ?? totalFromApi;
      if (records.length === 0) {
        console.log(`[animeunity] archive page ${page}: no records, stop`);
        break;
      }

      for (const record of records) {
        if (!record?.id) continue;
        if (!archiveMap.has(record.id)) {
          archiveMap.set(record.id, record);
        }
        if (archiveMap.size >= config.maxItems) break;
      }

      console.log(
        `[animeunity] archive page ${page}: +${records.length} (unique=${archiveMap.size}${
          totalFromApi ? ` / total=${totalFromApi}` : ""
        })`
      );

      if (archiveMap.size >= config.maxItems) {
        console.log("[animeunity] reached max-items limit");
        break;
      }
      if (totalFromApi && archiveMap.size >= totalFromApi) {
        console.log("[animeunity] reached full archive count");
        break;
      }
      if (records.length < PAGE_SIZE) {
        break;
      }
    }

    archiveItems = Array.from(archiveMap.values()).slice(0, config.maxItems);
  }

  console.log(`[animeunity] enriching ${archiveItems.length} items`);

  let hardFailures = 0;
  let detailInfoMissing = 0;
  let detailHtmlMissing = 0;
  let detailBothMissing = 0;

  const enrichedWithMeta = await asyncMapLimit(
    archiveItems,
    config.detailConcurrency,
    async (record, index) => {
      const id = record.id;
      try {
        const detail = await fetchAnimeDetailsWithRetry(config.baseUrl, id, record.slug, 3);
        if (detail.infoMissing) detailInfoMissing += 1;
        if (detail.htmlMissing) detailHtmlMissing += 1;
        if (detail.infoMissing && detail.htmlMissing) detailBothMissing += 1;

        const entry = buildNormalizedEntry(
          record,
          detail.info,
          detail.htmlAnime,
          config.baseUrl,
          config.includeRaw
        );
        const softIncomplete = isSoftIncomplete(entry);

        if ((index + 1) % 100 === 0 || index + 1 === archiveItems.length) {
          console.log(
            `[animeunity] metadata ${index + 1}/${archiveItems.length} (hardFailures=${hardFailures})`
          );
        }
        return {
          entry,
          meta: {
            softIncomplete,
          },
        };
      } catch (err) {
        hardFailures += 1;
        const fallbackEntry = {
          id,
          slug: record.slug || undefined,
          link: buildAnimeLink(config.baseUrl, id, record.slug),
          title: normalizeText(
            record?.title_eng || record?.title || record?.title_it || ""
          ),
          synopsis: normalizeText(record?.plot || ""),
          genres: normalizeGenreList(record?.genres || []),
          tags: normalizeGenreList(record?.genres || []),
          ids: pickIds({}, {}, record),
          related: [],
          ...(config.includeRaw
            ? {
                raw: {
                  archive: record,
                },
              }
            : {}),
          error: String(err?.message || err),
        };
        return {
          entry: fallbackEntry,
          meta: {
            softIncomplete: true,
          },
        };
      }
    }
  );

  const enriched = enrichedWithMeta.map((item) => item.entry);
  const softFailures = enrichedWithMeta.reduce(
    (count, item) => count + (item?.meta?.softIncomplete ? 1 : 0),
    0
  );

  const missingFields = {
    title: 0,
    synopsis: 0,
    genres: 0,
    tags: 0,
    ids: 0,
    related: 0,
  };
  for (const item of enriched) {
    if (!normalizeText(item?.title)) missingFields.title += 1;
    if (!normalizeText(item?.synopsis)) missingFields.synopsis += 1;
    if (!Array.isArray(item?.genres) || item.genres.length === 0) missingFields.genres += 1;
    if (!Array.isArray(item?.tags) || item.tags.length === 0) missingFields.tags += 1;
    if (countKnownIds(item?.ids) === 0) missingFields.ids += 1;
    if (!Array.isArray(item?.related) || item.related.length === 0) missingFields.related += 1;
  }

  enriched.sort((a, b) => String(a.title || "").localeCompare(String(b.title || ""), "it"));

  const payload = {
    schemaVersion: 2,
    provider: "animeunity",
    generatedAt: new Date().toISOString(),
    source: {
      baseUrl: config.baseUrl,
      archivePath: "/archivio/get-animes",
      detailPath: "/info_api/:id",
      detailHtmlPath: "/anime/:id-:slug",
    },
    stats: {
      archiveUniqueItems: archiveItems.length,
      enrichedItems: enriched.length,
      failures: hardFailures + softFailures,
      hardFailures,
      softFailures,
      detailInfoMissing,
      detailHtmlMissing,
      detailBothMissing,
      missingFields,
      elapsedSeconds: Number(((Date.now() - start) / 1000).toFixed(2)),
    },
    items: enriched,
  };

  const shardResult = await writeShardedJson({
    outDir: config.outDir,
    shardSize: config.shardSize,
    items: payload.items,
    indexPayload: {
      schemaVersion: payload.schemaVersion,
      provider: payload.provider,
      generatedAt: payload.generatedAt,
      source: payload.source,
      stats: payload.stats,
      includeRaw: config.includeRaw,
    },
    pretty: true,
  });

  console.log(
    `[animeunity] done -> ${shardResult.indexPath} (chunks=${shardResult.chunks.length}, items=${shardResult.count})`
  );
}

run().catch((err) => {
  console.error("[animeunity] fatal", err);
  process.exitCode = 1;
});

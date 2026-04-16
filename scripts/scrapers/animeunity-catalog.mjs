#!/usr/bin/env node
import path from "node:path";
import {
  parseCliArgs,
  toInt,
  toFloat,
  normalizeText,
  decodeHtmlEntities,
  pickTranslation,
  uniqueBy,
  writeJsonAtomic,
  asyncMapLimit,
  createHttpClient,
} from "./shared.mjs";

const USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
const PAGE_SIZE = 30;

const args = parseCliArgs(process.argv.slice(2));

const config = {
  baseUrl: String(args.baseUrl || "https://www.animeunity.so").replace(/\/+$/, ""),
  outPath: path.resolve(
    process.cwd(),
    String(args.out || "data/providers/animeunity/catalog.json")
  ),
  maxPages: toInt(args["max-pages"], Number.POSITIVE_INFINITY),
  maxItems: toInt(args["max-items"], Number.POSITIVE_INFINITY),
  archiveConcurrency: Math.max(1, toInt(args["archive-concurrency"], 1)),
  detailConcurrency: Math.max(1, toInt(args["detail-concurrency"], 8)),
  timeoutMs: Math.max(5000, toInt(args.timeout, 30000)),
  retries: Math.max(0, toInt(args.retries, 3)),
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

function buildNormalizedEntry(archiveItem, info, htmlAnime, baseUrl) {
  const merged = {
    ...(htmlAnime || {}),
    ...(info || {}),
  };

  const title = normalizeText(
    merged.title_eng || merged.title || merged.title_it || archiveItem?.title || ""
  );
  const slug = normalizeText(archiveItem?.slug || merged.slug || "");
  const id = archiveItem?.id ?? merged.id ?? null;
  const plot = normalizeText(merged.plot || "");
  const type = normalizeText(merged.type || "");
  const status = normalizeText(merged.status || "");
  const season = normalizeText(merged.season || "");
  const yearMatch = String(merged.date || merged.year || "").match(/\d{4}/);
  const year = yearMatch?.[0] || undefined;
  const score =
    toFloat(merged.score, undefined) ??
    toFloat(archiveItem?.score, undefined) ??
    undefined;
  const episodesCount =
    toInt(merged.episodes_count, 0) ||
    toInt(archiveItem?.episodes_count, 0) ||
    undefined;

  const image = normalizeImageUrl(
    merged.imageurl || archiveItem?.imageurl || archiveItem?.imageUrl || ""
  );
  const cover = normalizeImageUrl(merged.cover || "");
  const background = normalizeImageUrl(merged.imageurl_cover || cover || image || "");
  const genres = normalizeGenreList(merged.genres || []);
  const tags = uniqueBy(
    [type, status, season, year].filter(Boolean),
    (value) => value.toLowerCase()
  );

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
      merged.dub === 1 || merged.dub === true || merged.dub === "1" || undefined,
    studio: normalizeText(merged.studio || "") || undefined,
    image: background || image || cover || undefined,
    poster: image || undefined,
    cover: cover || undefined,
    background: background || undefined,
    genres,
    tags,
    ids: {
      malId: toNumber(merged.mal_id),
      anilistId: toNumber(merged.anilist_id),
      crunchyId: merged.crunchy_id || undefined,
      disneyId: merged.disney_id || undefined,
      netflixId: merged.netflix_id || undefined,
      primeId: merged.prime_id || undefined,
    },
    related: normalizeRelated(info?.related, baseUrl),
    raw: {
      archive: archiveItem,
      infoApi: info || null,
      htmlAnime: htmlAnime || null,
    },
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
    `[animeunity] config baseUrl=${config.baseUrl} maxPages=${config.maxPages} maxItems=${config.maxItems} detailConcurrency=${config.detailConcurrency}`
  );

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

  const archiveItems = Array.from(archiveMap.values()).slice(0, config.maxItems);
  console.log(`[animeunity] enriching ${archiveItems.length} items`);

  let failures = 0;
  const enriched = await asyncMapLimit(
    archiveItems,
    config.detailConcurrency,
    async (record, index) => {
      const id = record.id;
      try {
        const [info, htmlAnime] = await Promise.all([
          fetchAnimeInfo(config.baseUrl, id),
          fetchAnimeHtmlData(config.baseUrl, id, record.slug),
        ]);
        const entry = buildNormalizedEntry(record, info || {}, htmlAnime, config.baseUrl);
        if ((index + 1) % 100 === 0 || index + 1 === archiveItems.length) {
          console.log(
            `[animeunity] metadata ${index + 1}/${archiveItems.length} (failures=${failures})`
          );
        }
        return entry;
      } catch (err) {
        failures += 1;
        return {
          id,
          slug: record.slug || undefined,
          link: buildAnimeLink(config.baseUrl, id, record.slug),
          title: normalizeText(
            record?.title_eng || record?.title || record?.title_it || ""
          ),
          synopsis: "",
          raw: {
            archive: record,
          },
          error: String(err?.message || err),
        };
      }
    }
  );

  const payload = {
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
      failures,
      elapsedSeconds: Number(((Date.now() - start) / 1000).toFixed(2)),
    },
    items: enriched,
  };

  await writeJsonAtomic(config.outPath, payload, false);
  console.log(`[animeunity] done -> ${config.outPath}`);
}

run().catch((err) => {
  console.error("[animeunity] fatal", err);
  process.exitCode = 1;
});

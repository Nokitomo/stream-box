#!/usr/bin/env node
import path from "node:path";
import {
  parseCliArgs,
  toInt,
  toFloat,
  toBool,
  normalizeText,
  extractDataPage,
  decodeHtmlEntities,
  pickTranslation,
  uniqueBy,
  writeShardedJson,
  asyncMapLimit,
  createHttpClient,
} from "./shared.mjs";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
const DEFAULT_CDN = "https://cdn.streamingunity.biz";
const DEFAULT_LOCALE = "it";
const PAGE_SIZE = 60;
const ARCHIVE_MIN_YEAR = 1910;
const ARCHIVE_GENRE_IDS = [
  4, 13, 11, 19, 12, 2, 24, 1, 16, 8, 22, 7, 25, 26, 14, 6, 37, 18, 15, 3, 10, 23, 5, 21, 9,
  17, 20,
];

const args = parseCliArgs(process.argv.slice(2));
const dnsServersRaw = normalizeText(String(args.dns || "1.1.1.1,1.0.0.1"));

const config = {
  baseUrl: String(args.baseUrl || "https://streamingunity.biz").replace(/\/+$/, ""),
  outDir: path.resolve(process.cwd(), String(args["out-dir"] || "data/providers/streamingunity")),
  shardSize: Math.max(50, toInt(args["shard-size"], 250)),
  includeRaw: toBool(args["include-raw"], false),
  maxPages: toInt(args["max-pages"], Number.POSITIVE_INFINITY),
  maxItems: toInt(args["max-items"], Number.POSITIVE_INFINITY),
  detailConcurrency: Math.max(1, toInt(args["detail-concurrency"], 6)),
  timeoutMs: Math.max(5000, toInt(args.timeout, 30000)),
  retries: Math.max(0, toInt(args.retries, 3)),
  locale: normalizeText(String(args.locale || DEFAULT_LOCALE)) || DEFAULT_LOCALE,
  minYear: Math.max(1900, toInt(args["min-year"], ARCHIVE_MIN_YEAR)),
  dnsServers: dnsServersRaw
    .split(",")
    .map((item) => normalizeText(item))
    .filter(Boolean),
};

const http = createHttpClient({
  timeoutMs: config.timeoutMs,
  retries: config.retries,
  dnsServers: config.dnsServers,
  defaultHeaders: {
    "user-agent": USER_AGENT,
    "accept-language": "it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7",
  },
});

function extractTitleSlug(title, locale = DEFAULT_LOCALE) {
  const translated = pickTranslation(title?.translations, "slug", locale);
  return translated || normalizeText(title?.slug || "");
}

function resolveTitleName(title, locale = DEFAULT_LOCALE) {
  const translated = pickTranslation(title?.translations, "name", locale);
  if (translated) return translated;
  return normalizeText(title?.name || title?.original_name || "");
}

function resolvePlot(title, locale = DEFAULT_LOCALE) {
  const translated = pickTranslation(title?.translations, "plot", locale);
  if (translated) return translated;
  return normalizeText(title?.plot || "");
}

function resolveCdnUrl(pageProps) {
  const candidate = normalizeText(pageProps?.cdn_url || pageProps?.cdnUrl || pageProps?.cdn || "");
  if (!candidate) return DEFAULT_CDN;
  if (/^https?:\/\//i.test(candidate)) return candidate.replace(/\/+$/, "");
  return `https://${candidate.replace(/^\/+/, "").replace(/\/+$/, "")}`;
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

function pickImage(images, cdnUrl, types, locale = DEFAULT_LOCALE) {
  if (!Array.isArray(images) || images.length === 0) return "";
  for (const type of types) {
    const normalized = String(type).toLowerCase();
    const matches = images.filter((item) => String(item?.type || "").toLowerCase() === normalized);
    if (matches.length === 0) continue;
    const localized = matches.find((item) => String(item?.lang || "").toLowerCase() === locale);
    const fallback = localized || matches.find((item) => !item?.lang) || matches[0];
    const url = buildImageUrl(fallback, cdnUrl);
    if (url) return url;
  }
  return buildImageUrl(images[0], cdnUrl);
}

function normalizePeople(items) {
  if (!Array.isArray(items)) return [];
  return uniqueBy(
    items
      .map((item) => normalizeText(item?.name || item?.title || item || ""))
      .filter(Boolean),
    (value) => value.toLowerCase()
  );
}

function normalizeGenres(genres) {
  if (!Array.isArray(genres)) return [];
  return uniqueBy(
    genres
      .map((genre) => pickTranslation(genre?.translations, "name", DEFAULT_LOCALE) || normalizeText(genre?.name || ""))
      .filter(Boolean),
    (value) => value.toLowerCase()
  );
}

function normalizeKeywords(keywords) {
  if (!Array.isArray(keywords)) return [];
  return uniqueBy(
    keywords
      .map((keyword) => normalizeText(keyword?.name || ""))
      .filter(Boolean),
    (value) => value.toLowerCase()
  );
}

function findRelated(sliders, baseUrl, cdnUrl) {
  if (!Array.isArray(sliders)) return [];
  const related = sliders.find((slider) => String(slider?.name || "").toLowerCase() === "related");
  const titles = Array.isArray(related?.titles) ? related.titles : [];
  return titles
    .map((item) => {
      const id = item?.id;
      if (!id) return null;
      const slug = extractTitleSlug(item, DEFAULT_LOCALE);
      return {
        id,
        slug: slug || undefined,
        title: resolveTitleName(item, DEFAULT_LOCALE),
        type: String(item?.type || "").toLowerCase() === "tv" ? "series" : "movie",
        year: String(item?.release_date || item?.last_air_date || "").match(/\d{4}/)?.[0],
        image: pickImage(item?.images || [], cdnUrl, ["poster", "cover", "background"]) || undefined,
        link: `${baseUrl}/it/titles/${id}${slug ? `-${slug}` : ""}`,
      };
    })
    .filter(Boolean);
}

function buildStreamingEntry({
  archiveItem,
  titleData,
  loadedSeason,
  sliders,
  pageProps,
  baseUrl,
  locale,
  previewFallback,
  includeRaw,
}) {
  const title = titleData || {};
  const cdnUrl = resolveCdnUrl(pageProps || {});
  const slug =
    extractTitleSlug(title, locale) ||
    normalizeText(archiveItem?.slug || "") ||
    normalizeText(previewFallback?.slug || "");

  const titleName = resolveTitleName(title, locale) || normalizeText(archiveItem?.name || archiveItem?.title || "");
  const synopsis =
    resolvePlot(title, locale) ||
    pickTranslation(archiveItem?.translations, "plot", locale) ||
    normalizeText(previewFallback?.plot || "");

  const genres = normalizeGenres(title?.genres || previewFallback?.genres || []);
  const keywords = normalizeKeywords(title?.keywords || []);
  const tags = uniqueBy([...genres, ...keywords], (value) => value.toLowerCase());
  const cast = normalizePeople(title?.main_actors || []);
  const directors = normalizePeople(title?.main_directors || []);

  const releaseDate = normalizeText(
    title?.release_date_it || title?.release_date || previewFallback?.release_date_it || ""
  );
  const lastAirDate = normalizeText(
    title?.last_air_date_it || title?.last_air_date || previewFallback?.last_air_date_it || ""
  );
  const year = String(releaseDate || lastAirDate || "").match(/\d{4}/)?.[0];
  const type = String(title?.type || archiveItem?.type || previewFallback?.type || "")
    .toLowerCase()
    .includes("tv")
    ? "series"
    : "movie";

  const imageSet = title?.images || previewFallback?.images || archiveItem?.images || [];
  const poster = pickImage(imageSet, cdnUrl, ["poster", "cover", "background"], locale);
  const background = pickImage(imageSet, cdnUrl, ["background", "cover", "cover_mobile"], locale);
  const cover = pickImage(imageSet, cdnUrl, ["cover", "cover_mobile", "poster"], locale);
  const logo = pickImage(imageSet, cdnUrl, ["logo"], locale);

  const id = archiveItem?.id ?? title?.id ?? previewFallback?.id ?? null;

  return {
    id,
    slug: slug || undefined,
    link: `${baseUrl}/it/titles/${id}${slug ? `-${slug}` : ""}`,
    watchLink: `${baseUrl}/it/watch/${id}`,
    title: decodeHtmlEntities(titleName),
    synopsis: decodeHtmlEntities(synopsis),
    type,
    status: normalizeText(title?.status || "") || undefined,
    score:
      toFloat(title?.score, undefined) ??
      toFloat(archiveItem?.score, undefined) ??
      toFloat(previewFallback?.score, undefined) ??
      undefined,
    year: year || undefined,
    runtime: toInt(title?.runtime, undefined) ?? toInt(previewFallback?.runtime, undefined),
    releaseDate: releaseDate || undefined,
    lastAirDate: lastAirDate || undefined,
    age: toInt(title?.age, undefined) ?? toInt(archiveItem?.age, undefined),
    quality: normalizeText(title?.quality || "") || normalizeText(previewFallback?.quality || "") || undefined,
    seasonsCount:
      toInt(title?.seasons_count, undefined) ??
      toInt(archiveItem?.seasons_count, undefined) ??
      toInt(previewFallback?.seasons_count, undefined),
    subIta: archiveItem?.sub_ita === 1 || title?.sub_ita === 1 || title?.sub_ita === true || undefined,
    dubIta: title?.dub_ita === 1 || title?.dub_ita === true || undefined,
    image: poster || background || cover || undefined,
    poster: poster || undefined,
    cover: cover || undefined,
    background: background || undefined,
    logo: logo || undefined,
    genres,
    keywords,
    tags,
    cast,
    directors,
    ids: {
      imdbId: normalizeText(title?.imdb_id || "") || undefined,
      tmdbId: toInt(title?.tmdb_id, undefined),
      netflixId: title?.netflix_id || undefined,
      primeId: title?.prime_id || undefined,
      disneyId: title?.disney_id || undefined,
      appleId: title?.apple_id || undefined,
      hboId: title?.hbo_id || undefined,
    },
    stats: {
      views: toInt(title?.views_it ?? title?.views, undefined),
      dailyViews: toInt(title?.daily_views_it ?? title?.daily_views, undefined),
    },
    seasons: Array.isArray(title?.seasons)
      ? title.seasons.map((season) => ({
          id: season?.id,
          number: toInt(season?.number, undefined),
          name: normalizeText(season?.name || "") || undefined,
          episodesCount: toInt(season?.episodes_count, undefined),
          releaseDate: normalizeText(season?.release_date_it || season?.release_date || "") || undefined,
        }))
      : [],
    loadedSeason: loadedSeason
      ? {
          id: loadedSeason?.id,
          number: toInt(loadedSeason?.number, undefined),
          episodes: Array.isArray(loadedSeason?.episodes)
            ? loadedSeason.episodes.map((episode) => ({
                id: episode?.id,
                number: toInt(episode?.number, undefined),
                name:
                  pickTranslation(episode?.translations, "name", locale) ||
                  normalizeText(episode?.name || "") ||
                  undefined,
                releaseDate:
                  normalizeText(episode?.release_date_it || episode?.release_date || "") || undefined,
              }))
            : [],
        }
      : undefined,
    related: findRelated(sliders, baseUrl, cdnUrl),
    ...(includeRaw
      ? {
          raw: {
            archive: archiveItem,
            title: titleData || null,
            preview: previewFallback || null,
          },
        }
      : {}),
  };
}

function buildArchiveUrl(baseUrl, locale, filters = {}, page = 1) {
  const params = new URLSearchParams();
  params.set("lang", locale);
  params.set("page", String(page));

  if (filters.type) params.set("type", filters.type);
  if (filters.year) params.set("year", String(filters.year));
  if (filters.genreId) params.append("genre[]", String(filters.genreId));

  return `${baseUrl}/${locale}/archive?${params.toString()}`;
}

async function fetchArchivePage(baseUrl, locale, filters = {}, page = 1) {
  const response = await http.requestJson({
    url: buildArchiveUrl(baseUrl, locale, filters, page),
    headers: {
      accept: "application/json, text/plain, */*",
      "x-requested-with": "XMLHttpRequest",
      referer: `${baseUrl}/${locale}/archive`,
    },
  });

  if (response.statusCode === 422 || response.statusCode === 503) {
    const body = String(response.body || "");
    if (/page .* superiore a 20|page limit reached/i.test(body)) {
      return { limited: true, records: [], total: 0, lastPage: 20 };
    }
    return null;
  }

  if (response.statusCode < 200 || response.statusCode >= 400) {
    return null;
  }

  const data = response.data;
  if (!data || !Array.isArray(data.data)) {
    return null;
  }

  return {
    limited: false,
    records: data.data,
    total: toInt(data.total, data.data.length),
    lastPage: toInt(data.last_page, 1),
    currentPage: toInt(data.current_page, page),
  };
}

async function fetchTitlePage(baseUrl, locale, id, slug) {
  const targetSlug = normalizeText(slug || "");
  const url = `${baseUrl}/${locale}/titles/${id}${targetSlug ? `-${targetSlug}` : ""}`;
  const response = await http.request({
    url,
    headers: {
      accept: "text/html,application/xhtml+xml",
      referer: `${baseUrl}/${locale}/archive`,
    },
  });
  if (response.statusCode < 200 || response.statusCode >= 400) {
    return null;
  }
  const pageData = extractDataPage(response.body);
  if (!pageData?.props) return null;
  return pageData;
}

async function fetchPreview(baseUrl, id) {
  const response = await http.requestJson({
    url: `${baseUrl}/api/titles/preview/${id}`,
    method: "POST",
    headers: {
      accept: "application/json, text/plain, */*",
      "x-requested-with": "XMLHttpRequest",
      referer: `${baseUrl}/`,
    },
  });
  if (response.statusCode < 200 || response.statusCode >= 400) {
    return null;
  }
  return response.data || null;
}

async function buildArchiveSegments(baseUrl, locale) {
  const nowYear = new Date().getFullYear();
  const segments = [];
  let probes = 0;

  for (const type of ["movie", "tv"]) {
    for (let year = nowYear; year >= config.minYear; year -= 1) {
      const firstPage = await fetchArchivePage(baseUrl, locale, { type, year }, 1);
      probes += 1;
      if (!firstPage || firstPage.total <= 0) {
        continue;
      }

      if (firstPage.limited || firstPage.lastPage > 20) {
        for (const genreId of ARCHIVE_GENRE_IDS) {
          const firstByGenre = await fetchArchivePage(baseUrl, locale, { type, year, genreId }, 1);
          probes += 1;
          if (!firstByGenre || firstByGenre.total <= 0) {
            continue;
          }
          segments.push({
            filters: { type, year, genreId },
            firstPage: firstByGenre,
            mode: "split-genre",
          });
        }
        continue;
      }

      segments.push({
        filters: { type, year },
        firstPage,
        mode: "year",
      });
    }
  }

  for (const type of ["movie", "tv"]) {
    const fallbackFirst = await fetchArchivePage(baseUrl, locale, { type }, 1);
    probes += 1;
    if (!fallbackFirst || fallbackFirst.total <= 0) {
      continue;
    }
    segments.push({
      filters: { type },
      firstPage: fallbackFirst,
      mode: "fallback-top-pages",
      maxPages: Math.min(20, fallbackFirst.lastPage || 1),
    });
  }

  return {
    probes,
    segments,
  };
}

function buildSegmentLabel(segment) {
  const bits = [];
  if (segment.filters.type) bits.push(segment.filters.type);
  if (segment.filters.year) bits.push(String(segment.filters.year));
  if (segment.filters.genreId) bits.push(`g${segment.filters.genreId}`);
  return bits.join("|") || "all";
}

async function collectArchiveItems(baseUrl, locale, segments) {
  const archiveMap = new Map();
  let archivePagesFetched = 0;
  let segmentCount = 0;

  for (const segment of segments) {
    segmentCount += 1;
    const maxPages = Math.min(segment.maxPages || segment.firstPage.lastPage || 1, 20);
    const segmentLabel = buildSegmentLabel(segment);
    let pageRecords = segment.firstPage.records || [];

    for (const record of pageRecords) {
      if (!record?.id) continue;
      if (!archiveMap.has(record.id)) archiveMap.set(record.id, record);
      if (archiveMap.size >= config.maxItems) break;
    }
    archivePagesFetched += 1;

    for (let page = 2; page <= maxPages; page += 1) {
      if (archiveMap.size >= config.maxItems) break;
      if (archivePagesFetched >= config.maxPages) break;
      const nextPage = await fetchArchivePage(baseUrl, locale, segment.filters, page);
      if (!nextPage || nextPage.limited) {
        break;
      }
      pageRecords = nextPage.records || [];
      if (pageRecords.length === 0) {
        break;
      }

      for (const record of pageRecords) {
        if (!record?.id) continue;
        if (!archiveMap.has(record.id)) archiveMap.set(record.id, record);
        if (archiveMap.size >= config.maxItems) break;
      }

      archivePagesFetched += 1;
    }

    console.log(
      `[streamingunity] segment ${segmentCount}/${segments.length} ${segment.mode}:${segmentLabel} -> unique=${archiveMap.size}`
    );

    if (archiveMap.size >= config.maxItems) {
      break;
    }
    if (archivePagesFetched >= config.maxPages) {
      console.log("[streamingunity] reached max-pages limit");
      break;
    }
  }

  return {
    archiveItems: Array.from(archiveMap.values()).slice(0, config.maxItems),
    archivePagesFetched,
  };
}

async function run() {
  const start = Date.now();
  console.log("[streamingunity] start");
  console.log(
    `[streamingunity] config baseUrl=${config.baseUrl} outDir=${config.outDir} shardSize=${config.shardSize} includeRaw=${config.includeRaw} locale=${config.locale} maxPages=${config.maxPages} maxItems=${config.maxItems} detailConcurrency=${config.detailConcurrency} dns=${config.dnsServers.join(",")}`
  );

  const unfilteredFirst = await fetchArchivePage(config.baseUrl, config.locale, {}, 1);
  if (!unfilteredFirst) {
    throw new Error("Unable to load StreamingUnity archive page");
  }
  const totalCount = toInt(unfilteredFirst.total, 0);
  const totalPages = toInt(unfilteredFirst.lastPage, 1);

  const { probes, segments } = await buildArchiveSegments(config.baseUrl, config.locale);
  console.log(
    `[streamingunity] built ${segments.length} archive segments (probes=${probes}, totalCount=${totalCount}, totalPages=${totalPages})`
  );

  const { archiveItems, archivePagesFetched } = await collectArchiveItems(
    config.baseUrl,
    config.locale,
    segments
  );
  console.log(`[streamingunity] archive unique collected: ${archiveItems.length}`);
  console.log(`[streamingunity] enriching ${archiveItems.length} items`);

  let failures = 0;
  const items = await asyncMapLimit(archiveItems, config.detailConcurrency, async (record, index) => {
    const id = record.id;
    const slug = normalizeText(record.slug || "") || pickTranslation(record.translations, "slug", config.locale);

    try {
      const titlePage = await fetchTitlePage(config.baseUrl, config.locale, id, slug);
      const titleData = titlePage?.props?.title || null;
      const loadedSeason = titlePage?.props?.loadedSeason || null;
      const sliders = titlePage?.props?.sliders || [];
      let previewFallback = null;

      if (!titleData || !titleData.id) {
        previewFallback = await fetchPreview(config.baseUrl, id);
      }

      const entry = buildStreamingEntry({
        archiveItem: record,
        titleData,
        loadedSeason,
        sliders,
        pageProps: titlePage?.props || {},
        baseUrl: config.baseUrl,
        locale: config.locale,
        previewFallback,
        includeRaw: config.includeRaw,
      });

      if ((index + 1) % 100 === 0 || index + 1 === archiveItems.length) {
        console.log(`[streamingunity] metadata ${index + 1}/${archiveItems.length} (failures=${failures})`);
      }

      return entry;
    } catch (err) {
      failures += 1;
      return {
        id,
        slug: slug || undefined,
        link: `${config.baseUrl}/${config.locale}/titles/${id}${slug ? `-${slug}` : ""}`,
        title: decodeHtmlEntities(normalizeText(record?.name || record?.title || "") || `Title ${id}`),
        synopsis: decodeHtmlEntities(pickTranslation(record?.translations, "plot", config.locale) || "") || "",
        ...(config.includeRaw
          ? {
              raw: {
                archive: record,
              },
            }
          : {}),
        error: String(err?.message || err),
      };
    }
  });

  items.sort((a, b) => String(a.title || "").localeCompare(String(b.title || ""), "it"));

  const payload = {
    schemaVersion: 2,
    provider: "streamingunity",
    generatedAt: new Date().toISOString(),
    source: {
      baseUrl: config.baseUrl,
      locale: config.locale,
      archivePath: `/${config.locale}/archive`,
      detailPath: `/${config.locale}/titles/:id-:slug`,
      previewPath: "/api/titles/preview/:id",
      dnsServers: config.dnsServers,
      segmentedArchive: true,
    },
    stats: {
      archiveUniqueItems: archiveItems.length,
      enrichedItems: items.length,
      totalCount,
      totalPages,
      archiveSegments: segments.length,
      archiveSegmentProbes: probes,
      archivePagesFetched,
      failures,
      elapsedSeconds: Number(((Date.now() - start) / 1000).toFixed(2)),
    },
    items,
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
    `[streamingunity] done -> ${shardResult.indexPath} (chunks=${shardResult.chunks.length}, items=${shardResult.count})`
  );
}

run().catch((err) => {
  console.error("[streamingunity] fatal", err);
  process.exitCode = 1;
});

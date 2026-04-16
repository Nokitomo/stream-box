#!/usr/bin/env node
import path from "node:path";
import {
  parseCliArgs,
  toInt,
  toFloat,
  normalizeText,
  extractDataPage,
  decodeHtmlEntities,
  pickTranslation,
  uniqueBy,
  writeJsonAtomic,
  asyncMapLimit,
  createHttpClient,
  toAbsoluteUrl,
} from "./shared.mjs";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
const DEFAULT_CDN = "https://cdn.streamingunity.biz";
const DEFAULT_LOCALE = "it";
const PAGE_SIZE = 60;

const args = parseCliArgs(process.argv.slice(2));
const dnsServersRaw = normalizeText(String(args.dns || "1.1.1.1,1.0.0.1"));

const config = {
  baseUrl: String(args.baseUrl || "https://streamingunity.biz").replace(/\/+$/, ""),
  outPath: path.resolve(
    process.cwd(),
    String(args.out || "data/providers/streamingunity/catalog.json")
  ),
  maxPages: toInt(args["max-pages"], Number.POSITIVE_INFINITY),
  maxItems: toInt(args["max-items"], Number.POSITIVE_INFINITY),
  detailConcurrency: Math.max(1, toInt(args["detail-concurrency"], 10)),
  timeoutMs: Math.max(5000, toInt(args.timeout, 30000)),
  retries: Math.max(0, toInt(args.retries, 3)),
  locale: normalizeText(String(args.locale || DEFAULT_LOCALE)) || DEFAULT_LOCALE,
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
  const candidate = normalizeText(
    pageProps?.cdn_url || pageProps?.cdnUrl || pageProps?.cdn || ""
  );
  if (!candidate) return DEFAULT_CDN;
  if (/^https?:\/\//i.test(candidate)) return candidate.replace(/\/+$/, "");
  return `https://${candidate.replace(/^\/+/, "").replace(/\/+$/, "")}`;
}

function buildImageUrl(image, cdnUrl) {
  if (!image) return "";
  const raw = normalizeText(
    image.original_url_field ||
      image.url ||
      image.src ||
      image.path ||
      image.filename ||
      ""
  );
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  return `${cdnUrl.replace(/\/+$/, "")}/images/${raw.replace(/^\/+/, "")}`;
}

function pickImage(images, cdnUrl, types, locale = DEFAULT_LOCALE) {
  if (!Array.isArray(images) || images.length === 0) return "";
  for (const type of types) {
    const normalized = String(type).toLowerCase();
    const matches = images.filter(
      (item) => String(item?.type || "").toLowerCase() === normalized
    );
    if (matches.length === 0) continue;
    const localized = matches.find(
      (item) => String(item?.lang || "").toLowerCase() === locale
    );
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
      .map((genre) => {
        const translated = pickTranslation(genre?.translations, "name", DEFAULT_LOCALE);
        return translated || normalizeText(genre?.name || "");
      })
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
  const related = sliders.find(
    (slider) => String(slider?.name || "").toLowerCase() === "related"
  );
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
        image:
          pickImage(item?.images || [], cdnUrl, ["poster", "cover", "background"]) ||
          undefined,
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
}) {
  const title = titleData || {};
  const cdnUrl = resolveCdnUrl(pageProps || {});
  const slug =
    extractTitleSlug(title, locale) ||
    normalizeText(archiveItem?.slug || "") ||
    normalizeText(previewFallback?.slug || "");

  const titleName =
    resolveTitleName(title, locale) ||
    normalizeText(archiveItem?.name || archiveItem?.title || "");
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
  const background = pickImage(
    imageSet,
    cdnUrl,
    ["background", "cover", "cover_mobile"],
    locale
  );
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
    runtime:
      toInt(title?.runtime, undefined) ?? toInt(previewFallback?.runtime, undefined),
    releaseDate: releaseDate || undefined,
    lastAirDate: lastAirDate || undefined,
    age: toInt(title?.age, undefined) ?? toInt(archiveItem?.age, undefined),
    quality:
      normalizeText(title?.quality || "") ||
      normalizeText(previewFallback?.quality || "") ||
      undefined,
    seasonsCount:
      toInt(title?.seasons_count, undefined) ??
      toInt(archiveItem?.seasons_count, undefined) ??
      toInt(previewFallback?.seasons_count, undefined),
    subIta:
      archiveItem?.sub_ita === 1 ||
      title?.sub_ita === 1 ||
      title?.sub_ita === true ||
      undefined,
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
          releaseDate:
            normalizeText(season?.release_date_it || season?.release_date || "") ||
            undefined,
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
                  normalizeText(
                    episode?.release_date_it || episode?.release_date || ""
                  ) || undefined,
              }))
            : [],
        }
      : undefined,
    related: findRelated(sliders, baseUrl, cdnUrl),
    raw: {
      archive: archiveItem,
      title: titleData || null,
      preview: previewFallback || null,
    },
  };
}

async function fetchArchiveHtmlPage(baseUrl, locale, pageNumber = 1) {
  const pageQuery = pageNumber > 1 ? `?page=${pageNumber}` : "";
  const response = await http.request({
    url: `${baseUrl}/${locale}/archive${pageQuery}`,
    headers: {
      accept: "text/html,application/xhtml+xml",
      referer: `${baseUrl}/${locale}`,
    },
  });
  if (response.statusCode < 200 || response.statusCode >= 400) {
    return null;
  }
  const pageData = extractDataPage(response.body);
  if (!pageData?.props) return null;
  return pageData;
}

async function fetchArchiveJsonPage(baseUrl, locale, pageNumber) {
  const response = await http.requestJson({
    url: `${baseUrl}/${locale}/archive?lang=${locale}&page=${pageNumber}`,
    headers: {
      accept: "application/json, text/plain, */*",
      "x-requested-with": "XMLHttpRequest",
      referer: `${baseUrl}/${locale}/archive`,
    },
  });

  if (response.statusCode < 200 || response.statusCode >= 400) {
    return null;
  }
  const data = response.data;
  if (!data || !Array.isArray(data.data)) {
    return null;
  }
  return data;
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

async function run() {
  const start = Date.now();
  console.log("[streamingunity] start");
  console.log(
    `[streamingunity] config baseUrl=${config.baseUrl} locale=${config.locale} maxPages=${config.maxPages} maxItems=${config.maxItems} detailConcurrency=${config.detailConcurrency} dns=${config.dnsServers.join(",")}`
  );

  const firstPage = await fetchArchiveHtmlPage(config.baseUrl, config.locale, 1);
  if (!firstPage?.props) {
    throw new Error("Unable to load StreamingUnity archive page");
  }

  const firstTitles = Array.isArray(firstPage.props.titles) ? firstPage.props.titles : [];
  const totalCount = toInt(firstPage.props.totalCount, firstTitles.length);
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const pagesToFetch = Math.min(config.maxPages, totalPages);

  const archiveMap = new Map();
  for (const item of firstTitles) {
    if (item?.id) archiveMap.set(item.id, item);
  }

  console.log(
    `[streamingunity] archive page 1: +${firstTitles.length} (unique=${archiveMap.size} / total=${totalCount} / pages=${totalPages})`
  );

  for (let page = 2; page <= pagesToFetch; page += 1) {
    if (archiveMap.size >= config.maxItems) break;
    let payload = await fetchArchiveJsonPage(config.baseUrl, config.locale, page);
    let records = payload?.data;

    if (!Array.isArray(records)) {
      const htmlFallback = await fetchArchiveHtmlPage(config.baseUrl, config.locale, page);
      records = Array.isArray(htmlFallback?.props?.titles) ? htmlFallback.props.titles : [];
    }

    if (!Array.isArray(records) || records.length === 0) {
      console.warn(`[streamingunity] archive page ${page}: empty/fail`);
      break;
    }

    for (const record of records) {
      if (!record?.id) continue;
      if (!archiveMap.has(record.id)) archiveMap.set(record.id, record);
      if (archiveMap.size >= config.maxItems) break;
    }

    console.log(
      `[streamingunity] archive page ${page}: +${records.length} (unique=${archiveMap.size})`
    );
  }

  const archiveItems = Array.from(archiveMap.values()).slice(0, config.maxItems);
  console.log(`[streamingunity] enriching ${archiveItems.length} items`);

  let failures = 0;
  const items = await asyncMapLimit(
    archiveItems,
    config.detailConcurrency,
    async (record, index) => {
      const id = record.id;
      const slug =
        normalizeText(record.slug || "") ||
        pickTranslation(record.translations, "slug", config.locale);

      try {
        let titlePage = await fetchTitlePage(config.baseUrl, config.locale, id, slug);
        let titleData = titlePage?.props?.title || null;
        let loadedSeason = titlePage?.props?.loadedSeason || null;
        let sliders = titlePage?.props?.sliders || [];
        let previewFallback = null;

        if (!titleData || !titleData.id) {
          previewFallback = await fetchPreview(config.baseUrl, id);
        }

        const entry = buildStreamingEntry({
          archiveItem: record,
          titleData,
          loadedSeason,
          sliders,
          pageProps: titlePage?.props || firstPage.props,
          baseUrl: config.baseUrl,
          locale: config.locale,
          previewFallback,
        });

        if ((index + 1) % 100 === 0 || index + 1 === archiveItems.length) {
          console.log(
            `[streamingunity] metadata ${index + 1}/${archiveItems.length} (failures=${failures})`
          );
        }

        return entry;
      } catch (err) {
        failures += 1;
        return {
          id,
          slug: slug || undefined,
          link: `${config.baseUrl}/${config.locale}/titles/${id}${slug ? `-${slug}` : ""}`,
          title: decodeHtmlEntities(
            normalizeText(record?.name || record?.title || "") || `Title ${id}`
          ),
          synopsis:
            decodeHtmlEntities(
              pickTranslation(record?.translations, "plot", config.locale) || ""
            ) || "",
          raw: {
            archive: record,
          },
          error: String(err?.message || err),
        };
      }
    }
  );

  const payload = {
    provider: "streamingunity",
    generatedAt: new Date().toISOString(),
    source: {
      baseUrl: config.baseUrl,
      locale: config.locale,
      archivePath: `/${config.locale}/archive`,
      archiveApiQuery: `/${config.locale}/archive?lang=${config.locale}&page=:page`,
      detailPath: `/${config.locale}/titles/:id-:slug`,
      previewPath: "/api/titles/preview/:id",
      dnsServers: config.dnsServers,
    },
    stats: {
      archiveUniqueItems: archiveItems.length,
      enrichedItems: items.length,
      totalCount,
      totalPages,
      pagesFetched: Math.min(pagesToFetch, totalPages),
      failures,
      elapsedSeconds: Number(((Date.now() - start) / 1000).toFixed(2)),
    },
    items,
  };

  await writeJsonAtomic(config.outPath, payload, false);
  console.log(`[streamingunity] done -> ${config.outPath}`);
}

run().catch((err) => {
  console.error("[streamingunity] fatal", err);
  process.exitCode = 1;
});

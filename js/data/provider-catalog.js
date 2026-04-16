window.NetflixClone = window.NetflixClone || {};
window.NetflixClone.data = window.NetflixClone.data || {};

(function initProviderCatalogLoader(app) {
  const data = app.data || {};
  const sourceFiles = [
    { provider: "animeunity", path: "data/providers/animeunity/catalog.json" },
    { provider: "streamingunity", path: "data/providers/streamingunity/catalog.json" },
  ];

  function normalizeText(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function slugify(value) {
    return normalizeText(value)
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function toNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function toYear(rawYear) {
    const match = String(rawYear ?? "").match(/\d{4}/);
    return match ? Number(match[0]) : null;
  }

  function toMaturity(item) {
    if (item?.age) {
      const ageNumber = toNumber(item.age, 0);
      if (ageNumber > 0) {
        return `${ageNumber}+`;
      }
    }

    const raw = normalizeText(item?.maturity || "");
    return raw || "16+";
  }

  function toDuration(item, type) {
    const runtime = toNumber(item?.runtime, 0);
    if (runtime > 0) {
      const hours = Math.floor(runtime / 60);
      const minutes = runtime % 60;
      if (hours > 0) {
        return `${hours}h ${String(minutes).padStart(2, "0")}m`;
      }
      return `${minutes}m`;
    }

    const seasonsCount = toNumber(item?.seasonsCount, 0);
    if (seasonsCount > 0) {
      return `${seasonsCount} stagioni`;
    }

    const episodesCount = toNumber(item?.episodesCount, 0);
    if (episodesCount > 0) {
      return `${episodesCount} episodi`;
    }

    return type === "movie" ? "Film" : "Serie";
  }

  function normalizeGenres(item) {
    const fallback = [];
    const genres = Array.isArray(item?.genres) ? item.genres : fallback;
    const tags = Array.isArray(item?.tags) ? item.tags : fallback;
    const merged = [...genres, ...tags]
      .map((value) => normalizeText(value))
      .filter(Boolean);
    return [...new Set(merged)];
  }

  function normalizePeople(value) {
    if (Array.isArray(value)) {
      return value.map((entry) => normalizeText(entry)).filter(Boolean);
    }

    const text = normalizeText(value);
    if (!text) {
      return [];
    }

    return text.split(",").map((entry) => normalizeText(entry)).filter(Boolean);
  }

  function toMatch(score) {
    const numeric = toNumber(score, 0);
    if (numeric <= 0) {
      return 85;
    }
    if (numeric <= 10) {
      return Math.max(60, Math.min(99, Math.round(numeric * 10)));
    }
    return Math.max(60, Math.min(99, Math.round(numeric)));
  }

  function detectType(item) {
    const explicit = normalizeText(item?.type || "").toLowerCase();
    if (explicit.includes("movie") || explicit.includes("film")) {
      return "movie";
    }
    if (explicit.includes("tv") || explicit.includes("series") || explicit.includes("anime")) {
      return "series";
    }
    return "series";
  }

  function includesAny(target, candidates) {
    return candidates.some((value) => target.includes(value));
  }

  function computeRows(type, genres, isNew) {
    const normalizedGenres = genres.map((genre) => genre.toLowerCase());
    const rows = new Set(["continue", "trending", "netflix-only"]);

    if (type === "movie") {
      rows.add("trending");
    }

    if (includesAny(normalizedGenres, ["azione", "action", "avventura", "shounen", "battle"])) {
      rows.add("action");
    }
    if (includesAny(normalizedGenres, ["crime", "thriller", "mistero", "mystery", "noir"])) {
      rows.add("crime");
    }
    if (includesAny(normalizedGenres, ["commedia", "comedy", "slice of life", "school"])) {
      rows.add("comedy");
    }
    if (includesAny(normalizedGenres, ["fantasy", "sci-fi", "science fiction", "soprannaturale"])) {
      rows.add("sci-fi");
    }
    if (isNew) {
      rows.add("new-release");
    }

    return [...rows];
  }

  function pickImage(item, keys) {
    for (const key of keys) {
      const value = normalizeText(item?.[key] || "");
      if (value) {
        return value;
      }
    }
    return "";
  }

  function mapProviderItem(item, provider, nowYear) {
    const title = normalizeText(item?.title || "");
    if (!title) {
      return null;
    }

    const type = detectType(item);
    const year = toYear(item?.year || item?.releaseDate || item?.lastAirDate) || nowYear;
    const genres = normalizeGenres(item);
    const cast = normalizePeople(item?.cast);
    const directors = normalizePeople(item?.directors);
    const people = [...cast, ...directors];
    const score = toNumber(item?.score, 0);
    const match = toMatch(score);
    const isNew = year >= nowYear - 1;
    const rows = computeRows(type, genres, isNew);
    const slugBase = slugify(item?.slug || title) || String(item?.id || title);
    const localId = normalizeText(item?.id || slugBase);

    const poster = pickImage(item, ["poster", "image", "cover", "background"]);
    const backdrop = pickImage(item, ["background", "cover", "image", "poster"]);
    const synopsis = normalizeText(item?.synopsis || "");

    return {
      id: `${provider}-${localId}`,
      title,
      kicker: `${provider === "animeunity" ? "AnimeUnity" : "StreamingUnity"} ${type === "movie" ? "Film" : "Serie"}`,
      type,
      year,
      maturity: toMaturity(item),
      duration: toDuration(item, type),
      genres: genres.length > 0 ? genres : ["Anime"],
      cast: people.length > 0 ? people.slice(0, 6).join(", ") : "N/D",
      description: synopsis || "Sinossi non disponibile.",
      match,
      isNew,
      rank: 0,
      progress: 0,
      rows,
      poster: poster || "assets/poster-fallback.svg",
      backdrop: backdrop || "assets/backdrop-fallback.svg",
      provider,
      sourceLink: normalizeText(item?.link || item?.watchLink || ""),
      score,
    };
  }

  function dedupeItems(items) {
    const map = new Map();
    for (const item of items) {
      const key = `${item.type}|${item.title.toLowerCase()}|${item.year}`;
      const existing = map.get(key);
      if (!existing || item.match > existing.match) {
        map.set(key, item);
      }
    }
    return [...map.values()];
  }

  function assignTop10(items) {
    const sorted = [...items].sort((a, b) => b.match - a.match);
    sorted.slice(0, 10).forEach((item, index) => {
      item.rank = index + 1;
      if (!item.rows.includes("top10")) {
        item.rows.push("top10");
      }
    });
  }

  function buildRowConfig(providers) {
    const providerLabel =
      providers.length > 1
        ? "Catalogo provider"
        : providers[0] === "animeunity"
          ? "Catalogo AnimeUnity"
          : "Catalogo StreamingUnity";

    return [
      { id: "continue", title: "Continua a guardare" },
      { id: "trending", title: "Di tendenza adesso" },
      { id: "top10", title: "Top 10 del catalogo", top10: true },
      { id: "netflix-only", title: providerLabel },
      { id: "action", title: "Azione ad alta tensione" },
      { id: "crime", title: "Crime e thriller" },
      { id: "comedy", title: "Commedie da non perdere" },
      { id: "sci-fi", title: "Sci-fi e fantasy" },
      { id: "new-release", title: "Nuove uscite" },
    ];
  }

  async function fetchCatalog(url) {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json();
    if (!payload || !Array.isArray(payload.items)) {
      throw new Error("Invalid payload");
    }

    return payload;
  }

  data.maxItemsPerRow = data.maxItemsPerRow || 120;

  app.data.loadProviderCatalog = async function loadProviderCatalog() {
    if (app.data._providerCatalogPromise) {
      return app.data._providerCatalogPromise;
    }

    app.data._providerCatalogPromise = (async () => {
      const nowYear = new Date().getFullYear();
      const payloads = [];

      await Promise.all(
        sourceFiles.map(async (source) => {
          try {
            const payload = await fetchCatalog(source.path);
            if (payload.items.length > 0) {
              payloads.push({ source, payload });
            }
          } catch (error) {
            console.warn(`[provider-catalog] skip ${source.provider}:`, error?.message || error);
          }
        })
      );

      if (payloads.length === 0) {
        return { loaded: false, reason: "no-provider-json" };
      }

      const mapped = [];
      for (const { source, payload } of payloads) {
        for (const rawItem of payload.items) {
          const mappedItem = mapProviderItem(rawItem, source.provider, nowYear);
          if (mappedItem) {
            mapped.push(mappedItem);
          }
        }
      }

      const deduped = dedupeItems(mapped);
      if (deduped.length === 0) {
        return { loaded: false, reason: "empty-provider-json" };
      }

      assignTop10(deduped);
      deduped.sort((a, b) => b.match - a.match || a.title.localeCompare(b.title, "it"));

      app.data.mediaCatalog = deduped;
      app.data.featuredId = deduped[0].id;
      app.data.rowConfigs = buildRowConfig(payloads.map((entry) => entry.source.provider));
      app.data.providerCatalogInfo = {
        providers: payloads.map((entry) => entry.source.provider),
        generatedAt: payloads.map((entry) => entry.payload.generatedAt).filter(Boolean),
        totalItems: deduped.length,
      };

      return {
        loaded: true,
        providers: app.data.providerCatalogInfo.providers,
        totalItems: deduped.length,
      };
    })();

    return app.data._providerCatalogPromise;
  };
})(window.NetflixClone);

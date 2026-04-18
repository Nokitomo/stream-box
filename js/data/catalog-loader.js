window.NetflixClone = window.NetflixClone || {};
window.NetflixClone.data = window.NetflixClone.data || {};

(function initCatalogLoader(app) {
  const data = app.data || {};
  const indexPath = "data/app/catalog-index.json";
  const detailsCache = new Map();

  function normalizeText(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function resolveDetailChunkPath(chunkPath) {
    const normalized = normalizeText(chunkPath);
    if (!normalized) {
      return "";
    }

    if (
      normalized.startsWith("http://") ||
      normalized.startsWith("https://") ||
      normalized.startsWith("/") ||
      normalized.startsWith("data/app/")
    ) {
      return normalized;
    }

    return `data/app/${normalized.replace(/^\.?\//, "")}`;
  }

  async function fetchJson(url) {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.json();
  }

  data.loadCatalogIndex = async function loadCatalogIndex() {
    if (data._catalogIndexPromise) {
      return data._catalogIndexPromise;
    }

    data._catalogIndexPromise = (async () => {
      try {
        const payload = await fetchJson(indexPath);
        if (!payload || !Array.isArray(payload.items)) {
          throw new Error("invalid app catalog index");
        }

        data.mediaCatalog = payload.items;
        data.featuredId = normalizeText(payload.featuredId || payload.items[0]?.id || "");
        data.rowConfigs = Array.isArray(payload.rowConfigs) ? payload.rowConfigs : data.rowConfigs;
        data.maxItemsPerRow = Number(payload.maxItemsPerRow) > 0 ? Number(payload.maxItemsPerRow) : data.maxItemsPerRow;
        data.catalogProviders = Array.isArray(payload.providers) ? payload.providers : [];
        data.catalogGeneratedAt = payload.generatedAt || "";

        return {
          loaded: true,
          totalItems: payload.items.length,
          providers: data.catalogProviders.map((entry) => entry.provider).filter(Boolean),
        };
      } catch (error) {
        console.warn("[catalog-loader] fallback to in-memory catalog:", error?.message || error);
        return {
          loaded: false,
          totalItems: Array.isArray(data.mediaCatalog) ? data.mediaCatalog.length : 0,
          providers: [],
        };
      }
    })();

    return data._catalogIndexPromise;
  };

  data.getCatalogItemDetails = async function getCatalogItemDetails(itemId) {
    if (!itemId) {
      return null;
    }

    const summary = (data.mediaCatalog || []).find((item) => item.id === itemId);
    if (!summary) {
      return null;
    }

    const chunkPath = resolveDetailChunkPath(summary.detailChunk || "");
    if (!chunkPath) {
      return summary;
    }

    let chunkPromise = detailsCache.get(chunkPath);
    if (!chunkPromise) {
      chunkPromise = fetchJson(chunkPath);
      detailsCache.set(chunkPath, chunkPromise);
    }

    try {
      const chunk = await chunkPromise;
      const detail = Array.isArray(chunk?.items) ? chunk.items.find((item) => item.id === itemId) : null;
      return detail ? { ...summary, ...detail } : summary;
    } catch (error) {
      console.warn("[catalog-loader] details chunk failed:", chunkPath, error?.message || error);
      detailsCache.delete(chunkPath);
      return summary;
    }
  };
})(window.NetflixClone);

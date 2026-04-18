window.NetflixClone = window.NetflixClone || {};

(async function bootTitlePage(app) {
  if (typeof app.data?.loadCatalogIndex === "function") {
    await app.data.loadCatalogIndex();
  }

  const data = app.data || {};
  const storage = app.storage || {};
  const getCatalogItemDetails = data.getCatalogItemDetails || (async () => null);
  const mediaCatalog = data.mediaCatalog || [];
  const featuredId = data.featuredId || "";
  const mediaById = new Map(mediaCatalog.map((item) => [item.id, item]));
  const params = new URLSearchParams(window.location.search);
  const requestedId = params.get("id");
  const baseItem = mediaById.get(requestedId) || mediaById.get(featuredId) || mediaCatalog[0];
  const myList = new Set(storage.loadArray(storage.keys.myList));
  const progressMap = storage.loadObject(storage.keys.progress);
  const fallbackPoster = "assets/poster-fallback.svg";
  const fallbackBackdrop = "assets/backdrop-fallback.svg";
  const titleLookupByProvider = new Map();

  if (!baseItem) {
    document.body.innerHTML = "<p style='padding:2rem;color:white;'>Nessun titolo disponibile.</p>";
    return;
  }

  const item = (await getCatalogItemDetails(baseItem.id)) || baseItem;

  function getProgress(id, base) {
    if (typeof progressMap[id] === "number") {
      return storage.clampProgress(progressMap[id]);
    }

    return storage.clampProgress(base);
  }

  function saveMyList() {
    storage.saveArray(storage.keys.myList, [...myList]);
  }

  function updateListButton(button) {
    button.textContent = myList.has(item.id) ? "Rimuovi da La mia lista" : "Aggiungi a La mia lista";
  }

  function renderHero() {
    document.getElementById("titleBackdrop").style.backgroundImage = `url("${item.backdrop}"), url("${fallbackBackdrop}")`;
    document.getElementById("titleKicker").textContent = item.kicker;
    document.getElementById("titleName").textContent = item.title;

    const progress = getProgress(item.id, item.progress);
    const progressLabel = progress > 0 ? ` • Avanzamento ${progress}%` : "";
    document.getElementById("titleMeta").textContent =
      `${item.match}% compatibile • ${item.year} • ${item.maturity} • ${item.duration}${progressLabel}`;
    document.getElementById("titleDescription").textContent = item.description;
    document.getElementById("titleCast").textContent = `Con: ${item.cast || "N/D"}`;
    document.getElementById("titleProvider").textContent = item.provider || "provider";
    document.getElementById("titlePlay").href = `player.html?id=${encodeURIComponent(item.id)}`;

    const listButton = document.getElementById("titleToggleList");
    updateListButton(listButton);
    listButton.addEventListener("click", () => {
      if (myList.has(item.id)) {
        myList.delete(item.id);
      } else {
        myList.add(item.id);
      }

      saveMyList();
      updateListButton(listButton);
    });
  }

  function toLabelList(entries) {
    if (!Array.isArray(entries) || entries.length === 0) {
      return "<p class='title-empty'>Nessun dato disponibile.</p>";
    }

    return entries.map((entry) => `<span class="title-chip">${entry}</span>`).join("");
  }

  function normalizeLookupText(value) {
    return String(value ?? "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function buildProviderLookup() {
    for (const candidate of mediaCatalog) {
      const provider = String(candidate.provider || "").trim();
      if (!provider) {
        continue;
      }

      const titleKey = normalizeLookupText(candidate.title);
      if (!titleKey) {
        continue;
      }

      if (!titleLookupByProvider.has(provider)) {
        titleLookupByProvider.set(provider, new Map());
      }

      const providerMap = titleLookupByProvider.get(provider);
      if (!providerMap.has(titleKey)) {
        providerMap.set(titleKey, []);
      }
      providerMap.get(titleKey).push(candidate.id);
    }
  }

  function findRelatedAppId(entry) {
    const provider = String(item.provider || "").trim();
    const providerPrefix = provider ? `${provider}-` : "";

    if (providerPrefix && entry?.id !== undefined && entry?.id !== null) {
      const byProviderId = `${providerPrefix}${String(entry.id).trim()}`;
      if (mediaById.has(byProviderId)) {
        return byProviderId;
      }
    }

    if (providerPrefix && entry?.slug) {
      const byProviderSlug = `${providerPrefix}${String(entry.slug).trim()}`;
      if (mediaById.has(byProviderSlug)) {
        return byProviderSlug;
      }
    }

    const providerLookup = titleLookupByProvider.get(provider);
    if (!providerLookup) {
      return null;
    }

    const titleKey = normalizeLookupText(entry?.title);
    if (!titleKey) {
      return null;
    }

    const byTitle = providerLookup.get(titleKey) || [];
    if (byTitle.length === 0) {
      return null;
    }

    if (byTitle.length === 1) {
      return byTitle[0];
    }

    const year = String(entry?.year || "").trim();
    if (!year) {
      return byTitle[0];
    }

    const byYear = byTitle.find((candidateId) => String(mediaById.get(candidateId)?.year || "") === year);
    return byYear || byTitle[0];
  }

  function renderMetadata() {
    const facts = [
      ["Stato", item.status],
      ["Stagione", item.season],
      ["Episodi", item.episodesCount],
      ["Stagioni", item.seasonsCount],
      ["Runtime", item.runtime],
      ["Qualita", item.quality],
      ["Uscita", item.releaseDate],
      ["Ultimo episodio", item.lastAirDate],
      ["Studio", item.studio],
      ["Dub", item.dubIta ?? item.dubbed],
      ["Sub ITA", item.subIta],
      ["Score", item.score],
    ].filter((entry) => entry[1] !== undefined && entry[1] !== null && String(entry[1]).trim() !== "");

    document.getElementById("titleFacts").innerHTML =
      facts.length > 0
        ? facts.map(([label, value]) => `<li><strong>${label}:</strong> ${String(value)}</li>`).join("")
        : "<li>Nessun dettaglio aggiuntivo.</li>";

    const tagList = [...(item.genres || []), ...(item.tags || []), ...(item.keywords || [])]
      .map((entry) => String(entry).trim())
      .filter(Boolean);
    document.getElementById("titleTags").innerHTML = toLabelList([...new Set(tagList)]);

    const related = Array.isArray(item.related) ? item.related : [];
    document.getElementById("titleRelated").innerHTML =
      related.length > 0
        ? related
            .map((entry) => {
              const relatedId = findRelatedAppId(entry);
              const relatedSummary = relatedId ? mediaById.get(relatedId) : null;
              const relatedImage =
                relatedSummary?.poster ||
                relatedSummary?.backdrop ||
                entry.image ||
                fallbackPoster;
              const relatedTitle = relatedSummary?.title || entry.title || "Titolo correlato";
              const relatedMetaBits = [];
              if (entry.type) relatedMetaBits.push(entry.type);
              if (entry.year) relatedMetaBits.push(entry.year);
              return `
          <button class="similar-card title-related-card${relatedId ? "" : " is-unavailable"}" type="button" ${
                relatedId ? `data-id="${relatedId}"` : "disabled"
              }>
            <img src="${relatedImage}" data-fallback="${fallbackPoster}" alt="${relatedTitle}" loading="lazy" />
            <div class="similar-content">
              <p class="similar-title">${relatedTitle}</p>
              <p class="similar-meta">${relatedMetaBits.join(" • ")}</p>
            </div>
          </button>
        `;
            })
            .join("")
        : "<p class='title-empty'>Nessun contenuto correlato disponibile.</p>";

    document
      .getElementById("titleRelated")
      .querySelectorAll("img[data-fallback]")
      .forEach((img) => {
        img.addEventListener(
          "error",
          () => {
            if (img.dataset.failed === "true") {
              return;
            }
            img.dataset.failed = "true";
            img.src = img.dataset.fallback;
          },
          { once: true }
        );
      });

    const sourceLink = item.links?.source || item.sourceLink || item.links?.page || "";
    const sourceAnchor = document.getElementById("titleSourceLink");
    if (sourceLink) {
      sourceAnchor.href = sourceLink;
      sourceAnchor.hidden = false;
    } else {
      sourceAnchor.hidden = true;
    }
  }

  function renderSimilar() {
    const similar = mediaCatalog
      .filter((candidate) => candidate.id !== item.id)
      .filter((candidate) => candidate.genres.some((genre) => item.genres.includes(genre)))
      .slice(0, 8);
    const root = document.getElementById("titleSimilar");

    root.innerHTML = similar
      .map(
        (candidate) => `
        <button class="similar-card" type="button" data-id="${candidate.id}">
          <img src="${candidate.poster}" data-fallback="${fallbackPoster}" alt="${candidate.title}" loading="lazy" />
          <div class="similar-content">
            <p class="similar-title">${candidate.title}</p>
            <p class="similar-meta">${candidate.year} • ${candidate.genres.slice(0, 2).join(" • ")}</p>
          </div>
        </button>
      `
      )
      .join("");

    root.querySelectorAll("img[data-fallback]").forEach((img) => {
      img.addEventListener(
        "error",
        () => {
          if (img.dataset.failed === "true") {
            return;
          }

          img.dataset.failed = "true";
          img.src = img.dataset.fallback;
        },
        { once: true }
      );
    });

    root.addEventListener("click", (event) => {
      const card = event.target.closest("[data-id]");
      if (!card) {
        return;
      }

      window.location.href = `title.html?id=${encodeURIComponent(card.dataset.id)}`;
    });
  }

  function bindRelatedNavigation() {
    const root = document.getElementById("titleRelated");
    root.addEventListener("click", (event) => {
      const card = event.target.closest("[data-id]");
      if (!card) {
        return;
      }
      window.location.href = `title.html?id=${encodeURIComponent(card.dataset.id)}`;
    });
  }

  function bindRelatedControls() {
    const track = document.getElementById("titleRelated");
    const prevButton = document.getElementById("titleRelatedPrev");
    const nextButton = document.getElementById("titleRelatedNext");
    if (!track || !prevButton || !nextButton) {
      return;
    }

    function stepSize() {
      return Math.max(280, Math.round(track.clientWidth * 0.9));
    }

    function updateButtons() {
      const maxScroll = Math.max(0, track.scrollWidth - track.clientWidth);
      const canScroll = maxScroll > 6;

      prevButton.hidden = !canScroll;
      nextButton.hidden = !canScroll;

      if (!canScroll) {
        prevButton.disabled = true;
        nextButton.disabled = true;
        return;
      }

      prevButton.disabled = track.scrollLeft <= 4;
      nextButton.disabled = track.scrollLeft >= maxScroll - 4;
    }

    prevButton.addEventListener("click", () => {
      track.scrollBy({ left: -stepSize(), behavior: "smooth" });
    });

    nextButton.addEventListener("click", () => {
      track.scrollBy({ left: stepSize(), behavior: "smooth" });
    });

    track.addEventListener("scroll", updateButtons, { passive: true });
    window.addEventListener("resize", updateButtons);
    requestAnimationFrame(updateButtons);
  }

  buildProviderLookup();
  renderHero();
  renderMetadata();
  bindRelatedNavigation();
  bindRelatedControls();
  renderSimilar();
})(window.NetflixClone);

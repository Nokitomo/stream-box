window.NetflixClone = window.NetflixClone || {};

(function initRendererFactory(app) {
  const fallbackBackdrop = "assets/backdrop-fallback.svg";
  let mediaCatalog = [];
  let rowConfigs = [];
  let featuredId = "";
  let mediaById = new Map();
  let maxItemsPerRow = 120;

  function matchesTab(item, activeTab, myListSet) {
    if (activeTab === "home") {
      return true;
    }

    if (activeTab === "series") {
      return item.type === "series";
    }

    if (activeTab === "movie") {
      return item.type === "movie";
    }

    if (activeTab === "new") {
      return item.isNew;
    }

    if (activeTab === "my-list") {
      return myListSet.has(item.id);
    }

    return true;
  }

  function matchesQuery(item, query) {
    if (!query) {
      return true;
    }

    const text = `${item.title} ${item.genres.join(" ")} ${item.cast}`.toLowerCase();
    return text.includes(query.toLowerCase());
  }

  function pickHero(state, visibleItems) {
    const preferred = visibleItems.find((item) => item.id === state.heroId);
    if (preferred) {
      return preferred;
    }

    if (visibleItems.length > 0) {
      return visibleItems[0];
    }

    return mediaById.get(featuredId) || mediaCatalog[0];
  }

  function buildRows(state, visibleItems, store) {
    if (state.activeTab === "my-list") {
      const listItems = visibleItems
        .filter((item) => state.myList.has(item.id))
        .slice(0, maxItemsPerRow);
      if (listItems.length === 0) {
        return [];
      }

      return [{ id: "my-list", title: "La mia lista", top10: false, items: listItems }];
    }

    return rowConfigs
      .map((row) => {
        let items = visibleItems.filter((item) => item.rows.includes(row.id));

        if (row.id === "continue") {
          items = items.filter((item) => store.getProgress(item.id, item.progress) > 0);
        }

        if (row.top10) {
          items = items
            .filter((item) => item.rank > 0)
            .sort((a, b) => a.rank - b.rank)
            .slice(0, 10);
        } else {
          items = items.slice(0, maxItemsPerRow);
        }

        return { id: row.id, title: row.title, top10: row.top10, items };
      })
      .filter((row) => row.items.length > 0);
  }

  function markNav(activeTab) {
    document.querySelectorAll("[data-tab]").forEach((el) => {
      if (el.classList.contains("nav-link")) {
        el.classList.toggle("is-active", el.dataset.tab === activeTab);
      }
    });
  }

  function updateSearchInput(query) {
    const input = document.getElementById("searchInput");
    if (!input) {
      return;
    }

    if (input.value !== query) {
      input.value = query;
    }
  }

  function applyBackdropWithFallback(el, primary) {
    if (!el) {
      return;
    }

    el.style.backgroundImage = `url("${primary}"), url("${fallbackBackdrop}")`;
  }

  function updateHero(hero) {
    const heroSection = document.getElementById("heroSection");
    const heroBackdrop = document.getElementById("heroBackdrop");
    const heroKicker = document.getElementById("heroKicker");
    const heroTitle = document.getElementById("heroTitle");
    const heroMeta = document.getElementById("heroMeta");
    const heroDescription = document.getElementById("heroDescription");
    const heroPlayBtn = document.getElementById("heroPlayBtn");
    const heroInfoBtn = document.getElementById("heroInfoBtn");

    if (!hero) {
      if (heroSection) {
        heroSection.style.display = "";
      }
      applyBackdropWithFallback(heroBackdrop, fallbackBackdrop);
      heroKicker.textContent = "Catalogo provider";
      heroTitle.textContent = "Nessun titolo disponibile";
      heroMeta.textContent = "Esegui gli scraper per generare i JSON.";
      heroDescription.textContent = "Il catalogo verra caricato automaticamente appena i dati saranno disponibili.";
      heroPlayBtn.dataset.id = "";
      heroInfoBtn.dataset.id = "";
      return;
    }

    applyBackdropWithFallback(heroBackdrop, hero.backdrop);
    heroKicker.textContent = hero.kicker;
    heroTitle.textContent = hero.title;
    heroMeta.textContent = `${hero.match}% compatibile • ${hero.year} • ${hero.maturity} • ${hero.duration}`;
    heroDescription.textContent = hero.description;
    heroPlayBtn.dataset.id = hero.id;
    heroInfoBtn.dataset.id = hero.id;
  }

  function bindImageFallbacks(root) {
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
  }

  function updateRows(rows, state, store) {
    const root = document.getElementById("railsRoot");
    if (rows.length === 0) {
      root.innerHTML = app.templates.renderEmptyState();
      return;
    }

    root.innerHTML = rows
      .map((row) => app.templates.renderRow(row, row.items, state.myList, (id, base) => store.getProgress(id, base)))
      .join("");
    bindImageFallbacks(root);
  }

  function updateModal(state) {
    const modal = document.getElementById("detailsModal");
    const item = mediaById.get(state.selectedId);

    if (!item) {
      modal.hidden = true;
      return;
    }

    applyBackdropWithFallback(document.getElementById("modalArtwork"), item.backdrop);
    document.getElementById("modalTitle").textContent = item.title;
    document.getElementById("modalMeta").textContent = `${item.year} • ${item.maturity} • ${item.duration} • ${item.genres.join(" • ")}`;
    document.getElementById("modalDescription").textContent = item.description;
    document.getElementById("modalCast").textContent = `Con: ${item.cast}`;

    const toggleButton = document.getElementById("modalToggleList");
    toggleButton.dataset.id = item.id;
    toggleButton.textContent = state.myList.has(item.id) ? "Rimuovi da La mia lista" : "Aggiungi a La mia lista";

    const openPageButton = document.getElementById("modalOpenPage");
    openPageButton.dataset.id = item.id;
    const openSourceButton = document.getElementById("modalOpenSource");
    if (item.sourceLink) {
      openSourceButton.href = item.sourceLink;
      openSourceButton.hidden = false;
    } else {
      openSourceButton.hidden = true;
    }
    modal.hidden = false;
  }

  app.initRenderer = function initRenderer(store) {
    const data = app.data || {};
    mediaCatalog = Array.isArray(data.mediaCatalog) ? data.mediaCatalog : [];
    rowConfigs = Array.isArray(data.rowConfigs) ? data.rowConfigs : [];
    featuredId = data.featuredId || "";
    mediaById = new Map(mediaCatalog.map((item) => [item.id, item]));
    maxItemsPerRow = Number(data.maxItemsPerRow) > 0 ? Number(data.maxItemsPerRow) : 120;

    const toast = document.getElementById("appToast");
    let toastTimeout = null;

    function showToast(message) {
      toast.textContent = message;
      toast.hidden = false;
      clearTimeout(toastTimeout);
      toastTimeout = setTimeout(() => {
        toast.hidden = true;
      }, 1600);
    }

    function render() {
      const state = store.getState();
      const visibleItems = mediaCatalog.filter(
        (item) => matchesTab(item, state.activeTab, state.myList) && matchesQuery(item, state.query)
      );
      const hero = pickHero(state, visibleItems);
      const rows = buildRows(state, visibleItems, store);

      markNav(state.activeTab);
      updateSearchInput(state.query);
      updateHero(hero);
      updateRows(rows, state, store);
      updateModal(state);
    }

    return {
      getItemById(id) {
        return mediaById.get(id);
      },
      render,
      showToast
    };
  };
})(window.NetflixClone);

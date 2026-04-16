import { featuredId, mediaCatalog, rowConfigs } from "../data/catalog.js";
import { renderEmptyState, renderRow } from "./templates.js";

const mediaById = new Map(mediaCatalog.map((item) => [item.id, item]));

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

  return mediaById.get(featuredId) ?? mediaCatalog[0];
}

function buildRows(state, visibleItems) {
  if (state.activeTab === "my-list") {
    const listItems = visibleItems.filter((item) => state.myList.has(item.id));
    if (listItems.length === 0) {
      return [];
    }

    return [
      {
        id: "my-list",
        title: "La mia lista",
        top10: false,
        items: listItems
      }
    ];
  }

  return rowConfigs
    .map((row) => {
      let items = visibleItems.filter((item) => item.rows.includes(row.id));

      if (row.id === "continue") {
        items = items.filter((item) => item.progress > 0);
      }

      if (row.top10) {
        items = items
          .filter((item) => item.rank > 0)
          .sort((a, b) => a.rank - b.rank)
          .slice(0, 10);
      }

      return { ...row, items };
    })
    .filter((row) => row.items.length > 0);
}

function updateNavState(activeTab) {
  document.querySelectorAll(".nav-link").forEach((button) => {
    const isActive = button.dataset.tab === activeTab;
    button.classList.toggle("is-active", isActive);
  });
}

function updateHero(hero) {
  const heroBackdrop = document.getElementById("heroBackdrop");
  const heroKicker = document.getElementById("heroKicker");
  const heroTitle = document.getElementById("heroTitle");
  const heroMeta = document.getElementById("heroMeta");
  const heroDescription = document.getElementById("heroDescription");
  const heroPlayBtn = document.getElementById("heroPlayBtn");
  const heroInfoBtn = document.getElementById("heroInfoBtn");

  heroBackdrop.style.backgroundImage = `url("${hero.backdrop}")`;
  heroKicker.textContent = hero.kicker;
  heroTitle.textContent = hero.title;
  heroMeta.textContent = `${hero.match}% compatibile • ${hero.year} • ${hero.maturity} • ${hero.duration}`;
  heroDescription.textContent = hero.description;
  heroPlayBtn.dataset.id = hero.id;
  heroInfoBtn.dataset.id = hero.id;
}

function updateRows(rows, myListSet) {
  const root = document.getElementById("railsRoot");
  if (rows.length === 0) {
    root.innerHTML = renderEmptyState();
    return;
  }

  root.innerHTML = rows.map((row) => renderRow(row, row.items, myListSet)).join("");
}

function updateModal(state) {
  const modal = document.getElementById("detailsModal");
  const item = mediaById.get(state.selectedId);

  if (!item) {
    modal.hidden = true;
    return;
  }

  document.getElementById("modalArtwork").style.backgroundImage = `url("${item.backdrop}")`;
  document.getElementById("modalTitle").textContent = item.title;
  document.getElementById("modalMeta").textContent = `${item.year} • ${item.maturity} • ${item.duration} • ${item.genres.join(" • ")}`;
  document.getElementById("modalDescription").textContent = item.description;
  document.getElementById("modalCast").textContent = `Con: ${item.cast}`;

  const toggleButton = document.getElementById("modalToggleList");
  toggleButton.dataset.id = item.id;
  toggleButton.textContent = state.myList.has(item.id) ? "Rimuovi da La mia lista" : "Aggiungi a La mia lista";
  modal.hidden = false;
}

export function initRenderer(store) {
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
    const rows = buildRows(state, visibleItems);

    updateNavState(state.activeTab);
    updateHero(hero);
    updateRows(rows, state.myList);
    updateModal(state);
  }

  return {
    getItemById(id) {
      return mediaById.get(id);
    },
    render,
    showToast
  };
}

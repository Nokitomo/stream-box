window.NetflixClone = window.NetflixClone || {};

(async function bootTitlePage(app) {
  if (typeof app.data?.loadProviderCatalog === "function") {
    await app.data.loadProviderCatalog();
  }

  const data = app.data || {};
  const storage = app.storage || {};
  const mediaCatalog = data.mediaCatalog || [];
  const featuredId = data.featuredId || "";
  const mediaById = new Map(mediaCatalog.map((item) => [item.id, item]));
  const params = new URLSearchParams(window.location.search);
  const requestedId = params.get("id");
  const item = mediaById.get(requestedId) || mediaById.get(featuredId) || mediaCatalog[0];
  const myList = new Set(storage.loadArray(storage.keys.myList));
  const progressMap = storage.loadObject(storage.keys.progress);
  const fallbackPoster = "assets/poster-fallback.svg";
  const fallbackBackdrop = "assets/backdrop-fallback.svg";

  if (!item) {
    document.body.innerHTML = "<p style='padding:2rem;color:white;'>Nessun titolo disponibile.</p>";
    return;
  }

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
    document.getElementById("titleCast").textContent = `Con: ${item.cast}`;
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

  renderHero();
  renderSimilar();
})(window.NetflixClone);

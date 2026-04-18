window.NetflixClone = window.NetflixClone || {};

(async function bootPlayerPage(app) {
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
  const progressMap = storage.loadObject(storage.keys.progress);
  const fallbackBackdrop = "assets/backdrop-fallback.svg";
  let playing = true;
  let timer = null;

  if (!baseItem) {
    document.body.innerHTML = "<p style='padding:2rem;color:white;'>Nessun titolo disponibile.</p>";
    return;
  }

  const item = (await getCatalogItemDetails(baseItem.id)) || baseItem;

  function getProgress() {
    if (typeof progressMap[item.id] === "number") {
      return storage.clampProgress(progressMap[item.id]);
    }

    return storage.clampProgress(item.progress);
  }

  let progress = getProgress();
  const progressFill = document.getElementById("playerProgressFill");
  const progressLabel = document.getElementById("playerProgressLabel");
  const toggleButton = document.getElementById("playerToggle");
  const backToTitle = document.getElementById("playerBackToTitle");

  function persistProgress() {
    progressMap[item.id] = storage.clampProgress(progress);
    storage.saveObject(storage.keys.progress, progressMap);
  }

  function drawProgress() {
    progressFill.style.width = `${progress}%`;
    progressLabel.textContent = `${progress}% completato`;
  }

  function tickPlayback() {
    if (!playing) {
      return;
    }

    if (progress >= 100) {
      playing = false;
      toggleButton.textContent = "Riproduci";
      return;
    }

    progress = storage.clampProgress(progress + 1);
    drawProgress();
    persistProgress();
  }

  function setPlaying(next) {
    playing = next;
    toggleButton.textContent = playing ? "Pausa" : "Riproduci";
  }

  document.getElementById("playerBackdrop").style.backgroundImage = `url("${item.backdrop}"), url("${fallbackBackdrop}")`;
  document.getElementById("playerTitle").textContent = item.title;
  document.getElementById("playerMeta").textContent = `${item.year} • ${item.maturity} • ${item.duration}`;
  document.getElementById("playerProvider").textContent = item.provider
    ? `Provider: ${item.provider}`
    : "Provider: N/D";
  const sourceLink = item.links?.watch || item.links?.source || item.sourceLink || "";
  const sourceAnchor = document.getElementById("playerOpenSource");
  if (sourceLink) {
    sourceAnchor.href = sourceLink;
    sourceAnchor.hidden = false;
  } else {
    sourceAnchor.hidden = true;
  }
  backToTitle.href = `title.html?id=${encodeURIComponent(item.id)}`;
  drawProgress();

  toggleButton.addEventListener("click", () => {
    setPlaying(!playing);
  });

  document.addEventListener("keydown", (event) => {
    if (event.code === "Space") {
      event.preventDefault();
      setPlaying(!playing);
    }
  });

  timer = setInterval(tickPlayback, 1000);

  window.addEventListener("beforeunload", () => {
    if (timer) {
      clearInterval(timer);
    }

    persistProgress();
  });
})(window.NetflixClone);

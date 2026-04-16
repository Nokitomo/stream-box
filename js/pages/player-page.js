window.NetflixClone = window.NetflixClone || {};

(async function bootPlayerPage(app) {
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
  const progressMap = storage.loadObject(storage.keys.progress);
  const fallbackBackdrop = "assets/backdrop-fallback.svg";
  let playing = true;
  let timer = null;

  if (!item) {
    document.body.innerHTML = "<p style='padding:2rem;color:white;'>Nessun titolo disponibile.</p>";
    return;
  }

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

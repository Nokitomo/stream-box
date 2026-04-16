window.NetflixClone = window.NetflixClone || {};

(function initTemplates(app) {
  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function renderProgress(progress) {
    if (!progress) {
      return "";
    }

    return `<div class="card-progress"><span style="width:${Math.max(4, Math.min(progress, 100))}%"></span></div>`;
  }

  function renderTopRank(index, isTop10) {
    if (!isTop10) {
      return "";
    }

    return `<span class="top-rank" aria-hidden="true">${index}</span>`;
  }

  function renderListSymbol(isInList) {
    return isInList ? "✓" : "+";
  }

  function renderCard(item, options) {
    const isTop10 = options.isTop10;
    const index = options.index;
    const isInList = options.isInList;
    const progress = options.progress;
    const genres = item.genres.slice(0, 3).join(" • ");

    return `
      <article class="media-card ${isTop10 ? "is-top10" : ""}" data-id="${item.id}" tabindex="0">
        ${renderTopRank(index, isTop10)}
        <img src="${item.poster}" data-fallback="assets/poster-fallback.svg" alt="${escapeHtml(item.title)}" loading="lazy" />
        <div class="card-overlay">
          <div class="card-topline">
            <span class="card-match">${item.match}% compatibile</span>
            <span>${item.year}</span>
            <span class="card-badge">${item.maturity}</span>
          </div>
          <h3 class="card-title">${escapeHtml(item.title)}</h3>
          <p class="card-genres">${escapeHtml(genres)}</p>
          <div class="card-actions">
            <button class="card-action" type="button" data-action="play" aria-label="Riproduci ${escapeHtml(item.title)}">▶</button>
            <button class="card-action" type="button" data-action="toggle-list" aria-label="Aggiungi ${escapeHtml(item.title)} a La mia lista">${renderListSymbol(isInList)}</button>
            <button class="card-action" type="button" data-action="details" aria-label="Maggiori dettagli su ${escapeHtml(item.title)}">i</button>
            <button class="card-action" type="button" data-action="open-page" aria-label="Apri scheda completa di ${escapeHtml(item.title)}">↗</button>
          </div>
        </div>
        ${renderProgress(progress)}
      </article>
    `;
  }

  function renderRow(row, items, myListSet, getProgress) {
    const cards = items
      .map((item, index) =>
        renderCard(item, {
          isTop10: row.top10,
          index: index + 1,
          isInList: myListSet.has(item.id),
          progress: getProgress(item.id, item.progress)
        })
      )
      .join("");

    return `
      <section class="rail-block" data-row="${row.id}">
        <div class="rail-header">
          <h2 class="rail-title">${escapeHtml(row.title)}</h2>
          <div class="rail-controls">
            <button class="rail-btn" type="button" data-scroll="prev" aria-label="Scorri a sinistra">‹</button>
            <button class="rail-btn" type="button" data-scroll="next" aria-label="Scorri a destra">›</button>
          </div>
        </div>
        <div class="rail-track">${cards}</div>
      </section>
    `;
  }

  function renderEmptyState() {
    return `
      <article class="rail-empty">
        Nessun titolo trovato. Prova con un altro nome o cambia categoria.
      </article>
    `;
  }

  app.templates = {
    renderRow,
    renderEmptyState
  };
})(window.NetflixClone);

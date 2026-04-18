(function (global) {
  var StreamBox = global.StreamBox = global.StreamBox || {};
  var utils = StreamBox.utils;
  var data = StreamBox.data;
  var store = StreamBox.store;
  var templates = StreamBox.templates;

  var refs = {};

  function init(payload) {
    store.init(payload || {});
    refs.root = utils.byId('playerPageRoot');
    refs.provider = utils.byId('playerProvider');
    refs.progress = utils.byId('playerProgressFill');
    refs.meta = utils.byId('playerMeta');

    var query = utils.parseQuery(global.location.search || '');
    var id = query.id;
    if (!id) {
      refs.root.innerHTML = '<p>ID titolo mancante.</p>';
      return;
    }

    var summary = data.getSummaryById(id);
    if (!summary) {
      var resolvedId = data.resolveCatalogId(id, query.provider || '');
      if (resolvedId) {
        summary = data.getSummaryById(resolvedId);
        id = resolvedId;
      }
    }
    if (!summary) {
      refs.root.innerHTML = '<p>Titolo non presente nel catalogo.</p>';
      return;
    }

    store.addHistory(id);
    renderLoading(summary);
    data.getDetailById(id).then(function (detail) {
      render(summary, detail || {});
    }, function () {
      render(summary, {});
    });
  }

  function renderLoading(summary) {
    refs.root.innerHTML = '<p>Preparazione pagina player per <strong>' + utils.escapeHtml(summary.title) + '</strong>...</p>';
  }

  function row(label, value) {
    return '<li><strong>' + utils.escapeHtml(label) + ':</strong> ' + utils.escapeHtml(value || '-') + '</li>';
  }

  function progressPercent(id) {
    var history = store.getHistory();
    for (var i = 0; i < history.length; i += 1) {
      if (String(history[i]) === String(id)) return 35;
    }
    return 0;
  }

  function render(summary, detail) {
    var watchLink = (detail.links && detail.links.watch) || (detail.links && detail.links.source) || summary.sourceLink || '';
    var providerPage = (detail.links && detail.links.page) || '';
    var pageLink = utils.resolvePath('html/title.html') + '?id=' + encodeURIComponent(summary.id) + '&provider=' + encodeURIComponent(summary.provider || '');
    var back = templates.backdrop((detail.images && detail.images.background) || summary.backdrop);

    refs.root.innerHTML = '' +
      '<img class="detail-backdrop" src="' + utils.escapeHtml(back) + '" alt="' + utils.escapeHtml(summary.title) + '">' +
      '<div class="player-wrap">' +
        '<div class="player-frame">' +
          '<h1 class="player-title">' + utils.escapeHtml(summary.title) + '</h1>' +
          '<p class="player-provider" id="playerProvider">Riproduzione interna non abilitata in questa versione.</p>' +
          '<div class="actions-row">' +
            '<a class="btn btn-primary" href="' + utils.escapeHtml(pageLink) + '">Apri pagina titolo</a>' +
            (watchLink ? '<a class="btn" target="_blank" rel="noopener" href="' + utils.escapeHtml(watchLink) + '">Apri sul provider</a>' : '') +
            (providerPage ? '<a class="btn" target="_blank" rel="noopener" href="' + utils.escapeHtml(providerPage) + '">Pagina provider</a>' : '') +
            '<button id="playerFavBtn" class="btn btn-sm">' + (store.isFavorite(summary.id) ? 'Rimuovi preferito' : 'Aggiungi preferito') + '</button>' +
            '<button id="playerWatchBtn" class="btn btn-sm">' + (store.isWatchlist(summary.id) ? 'Rimuovi watchlist' : 'Aggiungi watchlist') + '</button>' +
          '</div>' +
          '<div class="player-progress"><div id="playerProgressFill" class="player-progress-fill"></div></div>' +
        '</div>' +
      '</div>';

    refs.provider = utils.byId('playerProvider');
    refs.progress = utils.byId('playerProgressFill');
    refs.meta = utils.byId('playerMeta');

    if (refs.provider) refs.provider.innerHTML = 'Provider: ' + utils.escapeHtml(summary.provider || '-');
    if (refs.progress) refs.progress.style.width = progressPercent(summary.id) + '%';
    renderMeta(summary, detail, watchLink, providerPage);
    bindActions(summary.id);
  }

  function renderMeta(summary, detail, watchLink, providerPage) {
    refs.meta.innerHTML = '' +
      '<h2 class="section-title">Metadata</h2>' +
      '<ul class="kv-list">' +
        row('Tipo', detail.type || summary.type) +
        row('Anno', detail.year || summary.year) +
        row('Durata', detail.duration || summary.duration) +
        row('Voto', detail.score || summary.score) +
        row('Qualita', detail.quality) +
        row('Watch Link', watchLink || '-') +
        row('Source Page', providerPage || '-') +
      '</ul>';
  }

  function bindActions(id) {
    var favBtn = utils.byId('playerFavBtn');
    var watchBtn = utils.byId('playerWatchBtn');
    if (favBtn) favBtn.onclick = function () {
      store.toggleFavorite(id);
      favBtn.innerHTML = store.isFavorite(id) ? 'Rimuovi preferito' : 'Aggiungi preferito';
    };
    if (watchBtn) watchBtn.onclick = function () {
      store.toggleWatchlist(id);
      watchBtn.innerHTML = store.isWatchlist(id) ? 'Rimuovi watchlist' : 'Aggiungi watchlist';
    };
  }

  StreamBox.playerPage = { init: init };
})(window);

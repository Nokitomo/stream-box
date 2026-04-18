(function (global) {
  var StreamBox = global.StreamBox = global.StreamBox || {};
  var utils = StreamBox.utils;
  var data = StreamBox.data;
  var store = StreamBox.store;
  var templates = StreamBox.templates;
  var tvNav = StreamBox.tvNav;

  var refs = {};

  function init(payload) {
    store.init(payload || {});
    refs.root = utils.byId('titlePageRoot');
    refs.status = utils.byId('titleStatus');
    refs.similar = utils.byId('titleSimilar');
    refs.facts = utils.byId('titleFacts');
    bindRelatedControls();
    bindTvNavigation();

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
      refs.root.innerHTML = '<p>Titolo non trovato nel catalogo.</p>';
      return;
    }

    store.addHistory(id);
    renderSkeleton(summary);

    data.getDetailById(id).then(function (detail) {
      render(summary, detail || {});
    }, function () {
      render(summary, {});
    });
  }

  function renderSkeleton(summary) {
    refs.status.innerHTML = 'Caricamento dettagli per <strong>' + utils.escapeHtml(summary.title) + '</strong>...';
    refs.root.innerHTML = '<p>Recupero informazioni estese...</p>';
  }

  function row(text) {
    return '<li>' + utils.escapeHtml(text || '-') + '</li>';
  }

  function render(summary, detail) {
    var poster = templates.poster(
      detail.images && detail.images.poster,
      detail.images && detail.images.cover,
      summary.poster,
      detail.images && detail.images.image,
      detail.images && detail.images.background,
      summary.backdrop
    );
    var backdrop = templates.backdrop(
      detail.images && detail.images.background,
      detail.images && detail.images.cover,
      summary.backdrop,
      summary.poster
    );
    var cast = (detail.cast || []).slice(0, 10).join(', ');
    var directors = (detail.directors || []).slice(0, 8).join(', ');
    var studio = utils.safeText(detail.studio || '');
    var castValue = cast || 'N/D';
    var directorsValue = directors || studio || 'N/D';
    var directorsLabel = studio ? 'Regia / Studio' : 'Regia';
    var source = (detail.links && detail.links.source) || summary.sourceLink || '';

    refs.status.innerHTML = '' +
      '<a data-tv-focus="1" class="btn btn-sm" href="../index.html">Torna home</a> ' +
      '<span class="badge">' + utils.escapeHtml(summary.provider) + '</span>';

    refs.root.innerHTML = '' +
      '<img class="detail-backdrop" src="' + utils.escapeHtml(backdrop) + '" alt="' + utils.escapeHtml(summary.title) + '">' +
      '<div class="title-layout">' +
        '<div>' +
          '<img class="poster-large" src="' + utils.escapeHtml(poster) + '" alt="' + utils.escapeHtml(summary.title) + '">' +
          '<div class="actions-row">' +
            '<button data-tv-focus="1" id="titleFavBtn" class="btn btn-sm">' + (store.isFavorite(summary.id) ? 'Rimuovi preferito' : 'Aggiungi preferito') + '</button>' +
            '<button data-tv-focus="1" id="titleWatchBtn" class="btn btn-sm">' + (store.isWatchlist(summary.id) ? 'Rimuovi watchlist' : 'Aggiungi watchlist') + '</button>' +
          '</div>' +
        '</div>' +
        '<div>' +
          '<h1>' + utils.escapeHtml(summary.title) + '</h1>' +
          '<div class="meta-list">' +
            '<span class="badge">' + utils.escapeHtml(summary.year) + '</span>' +
            '<span class="badge">' + utils.escapeHtml(summary.maturity) + '</span>' +
            '<span class="badge">' + utils.escapeHtml(summary.duration) + '</span>' +
            '<span class="badge">Match ' + utils.escapeHtml(summary.match) + '%</span>' +
          '</div>' +
          '<p>' + utils.escapeHtml((detail.synopsis || summary.description || '').substring(0, 1200)) + '</p>' +
          '<div class="actions-row">' +
            '<a data-tv-focus="1" class="btn btn-primary" href="' + utils.escapeHtml(utils.resolvePath('html/player.html') + '?id=' + encodeURIComponent(summary.id) + '&provider=' + encodeURIComponent(summary.provider || '')) + '">Apri player</a>' +
            (source ? '<a data-tv-focus="1" class="btn" target="_blank" rel="noopener" href="' + utils.escapeHtml(source) + '">Apri provider</a>' : '') +
          '</div>' +
          '<div class="detail-columns">' +
            '<div class="detail-box"><h3 class="section-title">Cast</h3><p>' + utils.escapeHtml(castValue) + '</p></div>' +
            '<div class="detail-box"><h3 class="section-title">' + utils.escapeHtml(directorsLabel) + '</h3><p>' + utils.escapeHtml(directorsValue) + '</p></div>' +
          '</div>' +
        '</div>' +
      '</div>';

    bindActions(summary.id);
    renderFacts(detail, summary);
    renderRelated(detail, summary.provider || '');
  }

  function bindActions(id) {
    var favBtn = utils.byId('titleFavBtn');
    var watchBtn = utils.byId('titleWatchBtn');
    if (favBtn) {
      favBtn.onclick = function () {
        store.toggleFavorite(id);
        favBtn.innerHTML = store.isFavorite(id) ? 'Rimuovi preferito' : 'Aggiungi preferito';
      };
    }
    if (watchBtn) {
      watchBtn.onclick = function () {
        store.toggleWatchlist(id);
        watchBtn.innerHTML = store.isWatchlist(id) ? 'Rimuovi watchlist' : 'Aggiungi watchlist';
      };
    }
  }

  function renderFacts(detail, summary) {
    var list = [];
    list.push(row('Provider: ' + (summary.provider || '-')));
    list.push(row('Tipo: ' + (detail.type || summary.type || '-')));
    list.push(row('Anno: ' + (detail.year || summary.year || '-')));
    list.push(row('Qualita: ' + (detail.quality || '-')));
    list.push(row('Studio: ' + (detail.studio || '-')));
    list.push(row('Stato: ' + (detail.status || '-')));
    list.push(row('Episodi: ' + (detail.episodesCount || '-')));
    list.push(row('Stagioni: ' + (detail.seasonsCount || (detail.seasons || []).length || '-')));
    list.push(row('Lingua ITA dub: ' + (detail.dubIta || detail.dubbed ? 'Si' : 'No')));
    list.push(row('Lingua ITA sub: ' + (detail.subIta ? 'Si' : 'No')));
    list.push(row('ID esterni: ' + utils.safeText(JSON.stringify(detail.ids || {}))));

    refs.facts.innerHTML = '<h2 class="section-title">Dettagli tecnici</h2><ul class="kv-list">' + list.join('') + '</ul>';

    if (Array.isArray(detail.seasons) && detail.seasons.length) {
      var seasonRows = [];
      for (var s = 0; s < detail.seasons.length; s += 1) {
        var season = detail.seasons[s] || {};
        var seasonNumber = season.number || (s + 1);
        var seasonName = season.name || ('Stagione ' + seasonNumber);
        var episodesLabel = season.episodesCount ? (' - ' + season.episodesCount + ' episodi') : '';
        seasonRows.push(row('S' + seasonNumber + ': ' + seasonName + episodesLabel));
      }
      refs.facts.innerHTML += '<h3 class="section-title">Stagioni</h3><ul class="kv-list">' + seasonRows.join('') + '</ul>';
    }

    if (detail.loadedSeason && detail.loadedSeason.episodes && detail.loadedSeason.episodes.length) {
      var episodes = detail.loadedSeason.episodes.slice(0, 30);
      var epRows = [];
      for (var i = 0; i < episodes.length; i += 1) {
        epRows.push(row('Ep ' + (episodes[i].number || (i + 1)) + ': ' + (episodes[i].name || 'Senza titolo')));
      }
      refs.facts.innerHTML += '<h3 class="section-title">Episodi disponibili (S' + (detail.loadedSeason.number || 1) + ')</h3><ul class="kv-list">' + epRows.join('') + '</ul>';
    }
  }

  function renderRelated(detail, providerHint) {
    var source = detail.related || [];
    var mapped = [];
    for (var i = 0; i < source.length; i += 1) {
      var relatedItem = source[i] || {};
      var relatedImage = utils.safeText(relatedItem.image || '');
      var catalogId = data.resolveCatalogId(relatedItem.id, providerHint);
      var relatedSummary = catalogId ? data.getSummaryById(catalogId) : null;
      if (!relatedImage && relatedSummary) {
        relatedImage = utils.safeText(relatedSummary.poster || '');
      }
      mapped.push(
        Object.assign({}, relatedItem, {
          catalogId: catalogId,
          image: relatedImage,
          imageFallback: relatedSummary ? utils.safeText(relatedSummary.backdrop || '') : ''
        })
      );
    }
    refs.similar.innerHTML = '<h2 class="section-title">Titoli simili</h2>' + templates.relatedCards(mapped, providerHint);
    if (global.requestAnimationFrame) {
      global.requestAnimationFrame(function () { tvNav.refreshRails(refs.similar, false); });
    } else {
      setTimeout(function () { tvNav.refreshRails(refs.similar, false); }, 0);
    }
  }

  function bindRelatedControls() {
    if (!refs.similar) return;
    tvNav.bindRailControls(refs.similar);
  }

  function bindTvNavigation() {
    tvNav.bindKeyboard({
      bindKey: 'title',
      getFocusable: function () {
        return tvNav.getFocusable(document);
      }
    });
  }

  StreamBox.titlePage = { init: init };
})(window);

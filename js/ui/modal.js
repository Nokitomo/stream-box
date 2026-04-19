(function (global) {
  var StreamBox = global.StreamBox = global.StreamBox || {};
  var templates = StreamBox.templates;
  var data = StreamBox.data;
  var store = StreamBox.store;
  var utils = StreamBox.utils;

  var refs = {};

  function bind() {
    refs.root = utils.byId('titleModal');
    refs.mask = utils.byId('titleModalMask');
    refs.content = utils.byId('titleModalContent');
    if (!refs.root) return;

    refs.root.addEventListener('click', function (event) {
      var target = event.target;
      var closeBtn = target.closest('[data-modal-action="close"]');
      if (closeBtn || target === refs.mask) {
        close();
        return;
      }
      var fav = target.closest('[data-modal-action="favorite"]');
      if (fav) {
        toggleFavorite(fav.getAttribute('data-id'));
        return;
      }
      var watch = target.closest('[data-modal-action="watchlist"]');
      if (watch) {
        toggleWatchlist(watch.getAttribute('data-id'));
        return;
      }
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' || event.keyCode === 27) close();
    });
  }

  function openById(id) {
    if (!refs.root) return;
    var summary = data.getSummaryById(id);
    if (!summary) return;
    refs.root.className = 'modal open';
    refs.root.setAttribute('aria-hidden', 'false');
    renderLoading();
    store.addHistory(id);

    data.getDetailById(id).then(function (detail) {
      render(summary, detail || null);
    }, function () {
      render(summary, null);
    });
  }

  function renderLoading() {
    refs.content.innerHTML = '<p>Caricamento dettagli...</p>';
  }

  function actionButtons(summary, detail) {
    var id = summary.id;
    var titleLink = utils.resolvePath('html/title.html') + '?id=' + encodeURIComponent(id) + '&provider=' + encodeURIComponent(summary.provider || '');
    var source = summary.sourceLink || (detail && detail.links && detail.links.source) || '';
    var isFav = store.isFavorite(id);
    var isWatch = store.isWatchlist(id);

    var html = '';
    html += '<a class="btn btn-primary" data-modal-action="open-page" href="' + utils.escapeHtml(titleLink) + '">Pagina titolo</a>';
    if (source) html += '<a class="btn" target="_blank" rel="noopener" href="' + utils.escapeHtml(source) + '">Apri provider</a>';
    html += '<button class="btn btn-ghost" data-modal-action="favorite" data-id="' + utils.escapeHtml(id) + '">' + (isFav ? 'Rimuovi preferito' : 'Aggiungi preferito') + '</button>';
    html += '<button class="btn btn-ghost" data-modal-action="watchlist" data-id="' + utils.escapeHtml(id) + '">' + (isWatch ? 'Rimuovi watchlist' : 'Aggiungi watchlist') + '</button>';
    html += '<button class="btn btn-sm" data-modal-action="close">Chiudi</button>';
    return html;
  }

  function render(summary, detail) {
    var description = summary.description || (detail && detail.synopsis) || 'Sinossi non disponibile.';
    var backdrop = templates.backdrop(summary.backdrop || (detail && detail.images && detail.images.background));
    var facts = detail ? templates.detailFacts(detail) : '<p>Dati estesi non disponibili.</p>';

    refs.content.innerHTML = '' +
      '<img class="detail-backdrop" src="' + utils.escapeHtml(backdrop) + '" alt="' + utils.escapeHtml(summary.title) + '">' +
      '<h2>' + utils.escapeHtml(summary.title) + '</h2>' +
      '<p>' + utils.escapeHtml(description) + '</p>' +
      '<div class="actions-row">' + actionButtons(summary, detail) + '</div>' +
      '<div class="detail-columns">' +
        '<div class="detail-box">' + facts + '</div>' +
        '<div class="detail-box"><h3 class="section-title">Generi</h3><p>' + utils.escapeHtml((summary.genres || []).join(', ') || '-') + '</p></div>' +
      '</div>';
  }

  function close() {
    if (!refs.root) return;
    refs.root.className = 'modal';
    refs.root.setAttribute('aria-hidden', 'true');
  }

  function toggleFavorite(id) {
    if (!id) return;
    store.toggleFavorite(id);
    openById(id);
  }

  function toggleWatchlist(id) {
    if (!id) return;
    store.toggleWatchlist(id);
    openById(id);
  }

  StreamBox.modal = {
    bind: bind,
    openById: openById,
    close: close
  };
})(window);

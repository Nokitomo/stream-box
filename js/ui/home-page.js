(function (global) {
  var StreamBox = global.StreamBox = global.StreamBox || {};
  var utils = StreamBox.utils;
  var store = StreamBox.store;
  var data = StreamBox.data;
  var urlState = StreamBox.urlState;
  var templates = StreamBox.templates;
  var modal = StreamBox.modal;

  var refs = {};
  var catalog = null;

  function init(payload) {
    catalog = payload || { featuredId: '', items: [] };
    store.init(catalog);
    store.setFilters(urlState.read(), false);
    cacheRefs();
    bindEvents();
    modal.bind();
    fillFilterOptions();
    syncFilterInputs();
    render();
    urlState.bind(function (query) {
      store.setFilters(query, false);
      syncFilterInputs();
      render();
    });
  }

  function cacheRefs() {
    refs.form = utils.byId('filtersForm');
    refs.q = utils.byId('searchInput');
    refs.provider = utils.byId('providerFilter');
    refs.type = utils.byId('typeFilter');
    refs.genre = utils.byId('genreFilter');
    refs.year = utils.byId('yearFilter');
    refs.sort = utils.byId('sortFilter');
    refs.reset = utils.byId('resetFilters');
    refs.save = utils.byId('saveFilters');
    refs.loadMore = utils.byId('loadMoreRows');
    refs.status = utils.byId('homeStatus');
    refs.hero = utils.byId('heroMount');
    refs.rails = utils.byId('railsMount');
  }

  function bindEvents() {
    var onQueryInput = utils.debounce(function () {
      applyFilters(true);
    }, 280);

    refs.q.addEventListener('input', onQueryInput);
    refs.provider.addEventListener('change', function () { applyFilters(true); });
    refs.type.addEventListener('change', function () { applyFilters(true); });
    refs.genre.addEventListener('change', function () { applyFilters(true); });
    refs.year.addEventListener('change', function () { applyFilters(true); });
    refs.sort.addEventListener('change', function () { applyFilters(false); });

    refs.form.addEventListener('submit', function (event) {
      event.preventDefault();
      applyFilters(false);
    });

    refs.reset.addEventListener('click', function () {
      store.setFilters({ q: '', provider: '', type: '', genre: '', year: '', sort: 'match-desc', page: 1 }, false);
      syncUrl(true);
      syncFilterInputs();
      render();
    });

    refs.save.addEventListener('click', function () {
      var name = global.prompt('Nome della sezione personalizzata:', 'I miei filtri');
      if (name == null) return;
      store.saveCurrentFilter(name);
      render();
    });

    refs.loadMore.addEventListener('click', function () {
      var filters = store.getFilters();
      store.setFilters({ page: filters.page + 1 }, false);
      syncUrl(false);
      render();
    });

    refs.hero.addEventListener('click', function (event) {
      var btn = event.target.closest('[data-action="open-modal"]');
      if (btn) modal.openById(btn.getAttribute('data-id'));
    });

    refs.rails.addEventListener('click', function (event) {
      var trigger = event.target.closest('[data-action="open-modal"]');
      if (trigger) {
        modal.openById(trigger.getAttribute('data-id'));
        return;
      }
      var remove = event.target.closest('[data-action="remove-row"]');
      if (remove) {
        store.removeCustomRow(remove.getAttribute('data-row-id'));
        render();
      }
    });

    bindTvKeyboard();
  }

  function bindTvKeyboard() {
    document.addEventListener('keydown', function (event) {
      var key = event.key || '';
      var code = event.keyCode;
      if (!isArrow(key, code)) return;
      if (isTypingElement(document.activeElement)) return;
      var focusables = getFocusable();
      if (!focusables.length) return;
      var current = document.activeElement;
      if (!current || !current.getAttribute || current.getAttribute('data-tv-focus') !== '1') {
        focusables[0].focus();
        event.preventDefault();
        return;
      }
      var next = moveByKey(current, focusables, key, code);
      if (next) {
        next.focus();
        event.preventDefault();
      }
    });
  }

  function isArrow(key, code) {
    return key === 'ArrowRight' || key === 'ArrowLeft' || key === 'ArrowUp' || key === 'ArrowDown' || code === 37 || code === 38 || code === 39 || code === 40;
  }

  function isTypingElement(node) {
    if (!node || !node.tagName) return false;
    var tag = node.tagName.toLowerCase();
    return tag === 'input' || tag === 'select' || tag === 'textarea';
  }

  function getFocusable() {
    var nodes = document.querySelectorAll('[data-tv-focus="1"]');
    var out = [];
    for (var i = 0; i < nodes.length; i += 1) {
      if (nodes[i].offsetParent !== null) out.push(nodes[i]);
    }
    return out;
  }

  function moveByKey(current, focusables, key, code) {
    var direction = key;
    if (!direction) {
      if (code === 37) direction = 'ArrowLeft';
      if (code === 38) direction = 'ArrowUp';
      if (code === 39) direction = 'ArrowRight';
      if (code === 40) direction = 'ArrowDown';
    }
    if (direction === 'ArrowRight' || direction === 'ArrowLeft') {
      var idx = focusables.indexOf(current);
      if (idx < 0) return focusables[0];
      var step = direction === 'ArrowRight' ? 1 : -1;
      var nextIndex = Math.max(0, Math.min(focusables.length - 1, idx + step));
      return focusables[nextIndex];
    }
    return moveSpatial(current, focusables, direction === 'ArrowDown' ? 1 : -1);
  }

  function moveSpatial(current, focusables, verticalDirection) {
    var base = current.getBoundingClientRect();
    var baseX = base.left + base.width / 2;
    var chosen = null;
    var best = Infinity;
    for (var i = 0; i < focusables.length; i += 1) {
      var node = focusables[i];
      if (node === current) continue;
      var box = node.getBoundingClientRect();
      var nodeY = box.top + box.height / 2;
      var baseY = base.top + base.height / 2;
      var deltaY = nodeY - baseY;
      if (verticalDirection > 0 && deltaY <= 2) continue;
      if (verticalDirection < 0 && deltaY >= -2) continue;
      var nodeX = box.left + box.width / 2;
      var score = Math.abs(deltaY) * 10 + Math.abs(nodeX - baseX);
      if (score < best) {
        best = score;
        chosen = node;
      }
    }
    return chosen;
  }

  function syncFilterInputs() {
    var f = store.getFilters();
    refs.q.value = f.q;
    refs.provider.value = f.provider;
    refs.type.value = f.type;
    refs.genre.value = f.genre;
    refs.year.value = f.year;
    refs.sort.value = f.sort;
  }

  function fillFilterOptions() {
    var opt = store.options();
    refs.provider.innerHTML = templates.options(opt.providers, '', 'Provider');
    refs.type.innerHTML = templates.options(opt.types, '', 'Tipo');
    refs.genre.innerHTML = templates.options(opt.genres, '', 'Genere');
    refs.year.innerHTML = templates.options(opt.years, '', 'Anno');
    refs.sort.innerHTML = '' +
      '<option value="match-desc">Rilevanza</option>' +
      '<option value="newest">Piu recenti</option>' +
      '<option value="oldest">Piu datati</option>' +
      '<option value="title-az">Titolo A-Z</option>' +
      '<option value="title-za">Titolo Z-A</option>';
  }

  function applyFilters(resetPage) {
    store.setFilters({
      q: refs.q.value,
      provider: refs.provider.value,
      type: refs.type.value,
      genre: refs.genre.value,
      year: refs.year.value,
      sort: refs.sort.value
    }, resetPage);
    syncUrl(true);
    render();
  }

  function syncUrl(replace) {
    urlState.write(store.toQuery(), replace);
  }

  function summaryByIds(ids, title, rowId) {
    var unique = [];
    var seen = {};
    for (var i = 0; i < ids.length; i += 1) {
      var id = String(ids[i]);
      if (seen[id]) continue;
      seen[id] = true;
      var item = data.getSummaryById(id);
      if (item) unique.push(item);
      if (unique.length >= 36) break;
    }
    if (!unique.length) return null;
    return { id: rowId, title: title, items: unique };
  }

  function chooseHero(rows) {
    var featured = data.getSummaryById(catalog.featuredId || '');
    if (!featured && rows.length && rows[0].items.length) featured = rows[0].items[0];
    return featured || null;
  }

  function renderHero(item) {
    if (!item) {
      refs.hero.innerHTML = '<div class="hero-wrap"><div class="hero-overlay"><h2>Nessun titolo trovato</h2></div></div>';
      return;
    }
    var source = item.sourceLink ? '<a data-tv-focus="1" class="btn" target="_blank" rel="noopener" href="' + utils.escapeHtml(item.sourceLink) + '">Apri provider</a>' : '';
    var titleUrl = utils.resolvePath('html/title.html') + '?id=' + encodeURIComponent(item.id) + '&provider=' + encodeURIComponent(item.provider || '');
    var playerUrl = utils.resolvePath('html/player.html') + '?id=' + encodeURIComponent(item.id) + '&provider=' + encodeURIComponent(item.provider || '');
    refs.hero.innerHTML = '' +
      '<div class="hero-wrap" style="background-image:url(' + utils.escapeHtml(templates.backdrop(item.backdrop)) + ')">' +
        '<div class="hero-overlay">' +
          '<div class="meta-list"><span class="badge">' + utils.escapeHtml(item.kicker || 'In evidenza') + '</span><span class="badge">Match ' + utils.escapeHtml(item.match || '-') + '%</span></div>' +
          '<h2 class="hero-title">' + utils.escapeHtml(item.title) + '</h2>' +
          '<p>' + utils.escapeHtml(item.description || '') + '</p>' +
          '<div class="hero-actions">' +
            '<button data-tv-focus="1" class="btn btn-primary" data-action="open-modal" data-id="' + utils.escapeHtml(item.id) + '">Dettagli rapidi</button>' +
            '<a data-tv-focus="1" class="btn" href="' + utils.escapeHtml(titleUrl) + '">Pagina titolo</a>' +
            '<a data-tv-focus="1" class="btn" href="' + utils.escapeHtml(playerUrl) + '">Player</a>' +
            source +
          '</div>' +
        '</div>' +
      '</div>';
  }

  function renderRows(rows, info) {
    refs.rails.innerHTML = '';
    var index = 0;

    function chunk() {
      var end = Math.min(rows.length, index + 2);
      for (; index < end; index += 1) refs.rails.insertAdjacentHTML('beforeend', templates.rowSection(rows[index]));
      if (index < rows.length) {
        setTimeout(chunk, 0);
      } else {
        var visibleNow = info.page * info.pageSize;
        var hasMore = info.total > visibleNow;
        refs.loadMore.className = hasMore ? 'btn' : 'btn hidden';
      }
    }

    if (!rows.length) {
      refs.rails.innerHTML = '<p>Nessun risultato con i filtri attuali.</p>';
      refs.loadMore.className = 'btn hidden';
      return;
    }

    chunk();
  }

  function renderStatus(info, rowsCount) {
    refs.status.innerHTML = 'Risultati: <strong>' + info.total + '</strong> · Pagina rail: <strong>' + info.page + '</strong> · Sezioni: <strong>' + rowsCount + '</strong>';
  }

  function render() {
    var payload = store.getRows();
    var rows = payload.rows.slice();

    var favRow = summaryByIds(store.getFavorites(), 'Preferiti', 'favorites');
    var watchRow = summaryByIds(store.getWatchlist(), 'Watchlist', 'watchlist');
    var historyRow = summaryByIds(store.getHistory(), 'Cronologia visite', 'history');
    if (historyRow) rows.unshift(historyRow);
    if (watchRow) rows.unshift(watchRow);
    if (favRow) rows.unshift(favRow);

    renderHero(chooseHero(rows));
    renderStatus(payload, rows.length);
    renderRows(rows, payload);
  }

  StreamBox.homePage = {
    init: init,
    render: render
  };
})(window);

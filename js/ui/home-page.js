(function (global) {
  var StreamBox = global.StreamBox = global.StreamBox || {};
  var utils = StreamBox.utils;
  var store = StreamBox.store;
  var data = StreamBox.data;
  var urlState = StreamBox.urlState;
  var templates = StreamBox.templates;
  var modal = StreamBox.modal;
  var tvNav = StreamBox.tvNav;
  var MAX_HOME_ROWS = 10;
  var MAX_PERSONAL_ROW_CARDS = 30;

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
    refs.categoryWrap = utils.byId('categoryMenuWrap');
    refs.categoryToggle = utils.byId('categoryMenuToggle');
    refs.categoryPanel = utils.byId('categoryMenuPanel');
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
    tvNav.bindRailControls(refs.rails);
    bindCategoryMenuEvents();

    bindTvKeyboard();
  }

  function bindCategoryMenuEvents() {
    if (!refs.categoryToggle || !refs.categoryPanel) return;
    refs.categoryToggle.addEventListener('click', function () {
      setCategoryMenuOpen(refs.categoryPanel.className.indexOf('hidden') !== -1);
    });
    refs.categoryPanel.addEventListener('click', function (event) {
      var option = event.target.closest('[data-category-value]');
      if (!option) return;
      event.preventDefault();
      var value = String(option.getAttribute('data-category-value') || '');
      refs.genre.value = value;
      applyFilters(true);
      setCategoryMenuOpen(false);
    });
    document.addEventListener('click', function (event) {
      if (!refs.categoryWrap || refs.categoryPanel.className.indexOf('hidden') !== -1) return;
      if (refs.categoryWrap.contains(event.target)) return;
      setCategoryMenuOpen(false);
    });
    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape' && event.keyCode !== 27) return;
      setCategoryMenuOpen(false);
    });
  }

  function bindTvKeyboard() {
    tvNav.bindKeyboard({
      bindKey: 'home',
      ignoreTyping: true,
      getFocusable: function () {
        return tvNav.getFocusable(document);
      }
    });
  }

  function syncFilterInputs() {
    var f = store.getFilters();
    refs.q.value = f.q;
    refs.provider.value = f.provider;
    refs.type.value = f.type;
    refs.genre.value = f.genre;
    refs.year.value = f.year;
    refs.sort.value = f.sort;
    syncCategoryMenuState();
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
    renderCategoryMenu(opt.genres || []);
  }

  function categoryLabelByValue(value) {
    var target = String(value || '');
    var genres = store.options().genres || [];
    for (var i = 0; i < genres.length; i += 1) {
      if (String(genres[i].value) === target) return String(genres[i].label || target);
    }
    return '';
  }

  function renderCategoryMenu(values) {
    if (!refs.categoryPanel) return;
    var items = values || [];
    var html = '<button class="category-option" data-tv-focus="1" data-category-value="">Tutte le categorie</button>';
    for (var i = 0; i < items.length; i += 1) {
      var value = String((items[i] && items[i].value) || '');
      if (!value) continue;
      var label = String((items[i] && items[i].label) || value);
      html += '<button class="category-option" data-tv-focus="1" data-category-value="' + utils.escapeHtml(value) + '">' + utils.escapeHtml(label) + '</button>';
    }
    refs.categoryPanel.innerHTML = html;
    syncCategoryMenuState();
  }

  function setCategoryMenuOpen(open) {
    if (!refs.categoryPanel || !refs.categoryToggle) return;
    var shouldOpen = open === true;
    refs.categoryToggle.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
    refs.categoryPanel.className = shouldOpen ? 'category-menu-panel' : 'category-menu-panel hidden';
  }

  function syncCategoryMenuState() {
    if (!refs.categoryPanel || !refs.categoryToggle) return;
    var active = String((store.getFilters() && store.getFilters().genre) || '');
    var options = refs.categoryPanel.querySelectorAll('[data-category-value]');
    for (var i = 0; i < options.length; i += 1) {
      var option = options[i];
      var value = String(option.getAttribute('data-category-value') || '');
      if (value === active) option.className = 'category-option active';
      else option.className = 'category-option';
    }
    var label = categoryLabelByValue(active);
    refs.categoryToggle.innerHTML = active ? ('Categorie: ' + utils.escapeHtml(label || active)) : 'Categorie';
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
    syncCategoryMenuState();
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
      if (unique.length >= MAX_PERSONAL_ROW_CARDS) break;
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

  function renderRows(rows) {
    refs.rails.innerHTML = '';
    if (!rows.length) {
      refs.rails.innerHTML = '<p>Nessun risultato con i filtri attuali.</p>';
      refs.loadMore.className = 'btn hidden';
      return;
    }
    for (var i = 0; i < rows.length; i += 1) refs.rails.insertAdjacentHTML('beforeend', templates.rowSection(rows[i]));
    refs.loadMore.className = 'btn hidden';
    if (global.requestAnimationFrame) {
      global.requestAnimationFrame(function () { tvNav.refreshRails(refs.rails, true); });
    } else {
      setTimeout(function () { tvNav.refreshRails(refs.rails, true); }, 0);
    }
  }

  function renderStatus(info, rowsCount) {
    refs.status.innerHTML = 'Risultati: <strong>' + info.total + '</strong> · Sezioni: <strong>' + rowsCount + '</strong> · Scroll: <strong>infinito</strong>';
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
    if (rows.length > MAX_HOME_ROWS) rows = rows.slice(0, MAX_HOME_ROWS);

    syncCategoryMenuState();
    renderHero(chooseHero(rows));
    renderStatus(payload, rows.length);
    renderRows(rows);
  }

  StreamBox.homePage = {
    init: init,
    render: render
  };
})(window);

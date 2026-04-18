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
    cacheRefs();
    bindEvents();
    modal.bind();
    renderCategoryMenu();
    applyHomeQuery(urlState.read(), true);

    urlState.bind(function (query) {
      applyHomeQuery(query, true);
    });
  }

  function cacheRefs() {
    refs.status = utils.byId('homeStatus');
    refs.hero = utils.byId('heroMount');
    refs.rails = utils.byId('railsMount');
    refs.categoryWrap = utils.byId('categoryMenuWrap');
    refs.categoryToggle = utils.byId('categoryMenuToggle');
    refs.categoryPanel = utils.byId('categoryMenuPanel');
  }

  function bindEvents() {
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
      applyCategory(String(option.getAttribute('data-category-value') || ''), true);
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
      ignoreTyping: false,
      getFocusable: function () {
        return tvNav.getFocusable(document);
      }
    });
  }

  function normalizeHomeQuery(query) {
    var src = query || {};
    return {
      genre: utils.safeText(src.genre || '')
    };
  }

  function applyHomeQuery(query, replace) {
    var normalized = normalizeHomeQuery(query);
    applyCategory(normalized.genre, replace === true);
  }

  function applyCategory(value, replace) {
    store.setFilters({
      q: '',
      provider: '',
      type: '',
      genre: value,
      year: '',
      sort: 'match-desc',
      page: 1
    }, false);
    syncUrl(replace === true);
    syncCategoryMenuState();
    render();
  }

  function syncUrl(replace) {
    var filters = store.getFilters();
    var query = {};
    if (filters.genre) query.genre = filters.genre;
    urlState.write(query, replace);
  }

  function renderCategoryMenu() {
    if (!refs.categoryPanel) return;
    var options = (store.options() && store.options().genres) || [];
    var html = '<button class="category-option" data-tv-focus="1" data-category-value="">Tutte le categorie</button>';
    for (var i = 0; i < options.length; i += 1) {
      var entry = options[i] || {};
      var value = String(entry.value || '');
      if (!value) continue;
      var label = String(entry.label || value);
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

  function currentCategoryLabel() {
    var value = String((store.getFilters() && store.getFilters().genre) || '');
    if (!value) return '';
    var options = (store.options() && store.options().genres) || [];
    for (var i = 0; i < options.length; i += 1) {
      if (String(options[i].value) === value) return String(options[i].label || value);
    }
    return value;
  }

  function syncCategoryMenuState() {
    if (!refs.categoryPanel || !refs.categoryToggle) return;
    var active = String((store.getFilters() && store.getFilters().genre) || '');
    var options = refs.categoryPanel.querySelectorAll('[data-category-value]');
    for (var i = 0; i < options.length; i += 1) {
      var option = options[i];
      var value = String(option.getAttribute('data-category-value') || '');
      option.className = value === active ? 'category-option active' : 'category-option';
    }
    var label = currentCategoryLabel();
    refs.categoryToggle.innerHTML = active ? ('Categorie: ' + utils.escapeHtml(label)) : 'Categorie';
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
      refs.rails.innerHTML = '<p>Nessun risultato per questa categoria.</p>';
      return;
    }
    for (var i = 0; i < rows.length; i += 1) refs.rails.insertAdjacentHTML('beforeend', templates.rowSection(rows[i]));
    if (global.requestAnimationFrame) {
      global.requestAnimationFrame(function () { tvNav.refreshRails(refs.rails, true); });
    } else {
      setTimeout(function () { tvNav.refreshRails(refs.rails, true); }, 0);
    }
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
    renderRows(rows);
  }

  StreamBox.homePage = {
    init: init,
    render: render
  };
})(window);

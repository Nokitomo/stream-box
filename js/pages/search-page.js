(function (global) {
  var StreamBox = global.StreamBox = global.StreamBox || {};
  var utils = StreamBox.utils;
  var urlState = StreamBox.urlState;
  var store = StreamBox.store;
  var engine = StreamBox.catalogEngine;
  var templates = StreamBox.templates;
  var modal = StreamBox.modal;
  var tvNav = StreamBox.tvNav;
  var MAX_RESULTS = 240;

  var refs = {};
  var state = {
    items: []
  };

  function init(payload) {
    var catalog = payload || { items: [] };
    store.init(catalog);
    state.items = engine.enrichItems(catalog.items || []);

    cacheRefs();
    bindEvents();
    modal.bind();
    applyQuery(urlState.read(), true);
  }

  function cacheRefs() {
    refs.form = utils.byId('searchForm');
    refs.input = utils.byId('searchPageInput');
    refs.status = utils.byId('searchStatus');
    refs.results = utils.byId('searchResults');
  }

  function bindEvents() {
    var onInput = utils.debounce(function () {
      applySearch(true);
    }, 220);

    refs.input.addEventListener('input', onInput);
    refs.form.addEventListener('submit', function (event) {
      event.preventDefault();
      applySearch(false);
    });

    refs.results.addEventListener('click', function (event) {
      var trigger = event.target.closest('[data-action="open-modal"]');
      if (!trigger) return;
      modal.openById(trigger.getAttribute('data-id'));
    });

    urlState.bind(function (query) {
      applyQuery(query, true);
    });

    tvNav.bindKeyboard({
      bindKey: 'search',
      ignoreTyping: true,
      getFocusable: function () {
        return tvNav.getFocusable(document);
      }
    });
  }

  function applyQuery(query, replace) {
    var q = utils.safeText((query && query.q) || '');
    refs.input.value = q;
    render(q);
    if (replace) writeQuery(q, true);
  }

  function applySearch(replace) {
    var q = utils.safeText(refs.input.value || '');
    writeQuery(q, replace === true);
    render(q);
  }

  function writeQuery(q, replace) {
    var params = {};
    if (q) params.q = q;
    urlState.write(params, replace);
  }

  function filterItems(query) {
    if (!query) return [];
    var filters = {
      q: query,
      provider: '',
      type: '',
      genre: '',
      year: '',
      sort: 'match-desc',
      page: 1
    };
    return engine.filterAndSort(state.items, filters).slice(0, MAX_RESULTS);
  }

  function renderResults(items) {
    if (!items.length) {
      refs.results.innerHTML = '<p>Nessun risultato trovato.</p>';
      return;
    }
    var cards = '';
    for (var i = 0; i < items.length; i += 1) cards += templates.card(items[i], null);
    refs.results.innerHTML = '<div class="search-grid">' + cards + '</div>';
  }

  function render(query) {
    var q = utils.safeText(query || '');
    if (!q) {
      refs.status.innerHTML = 'Scrivi una ricerca per iniziare.';
      refs.results.innerHTML = '';
      return;
    }

    var items = filterItems(q);
    refs.status.innerHTML = 'Risultati per <strong>' + utils.escapeHtml(q) + '</strong>: <strong>' + items.length + '</strong>';
    renderResults(items);
  }

  StreamBox.searchPage = {
    init: init
  };
})(window);

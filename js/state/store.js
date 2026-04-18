(function (global) {
  var StreamBox = global.StreamBox = global.StreamBox || {};
  var utils = StreamBox.utils;
  var storage = StreamBox.storage;
  var engine = StreamBox.catalogEngine;
  var MAX_ROW_CARDS = 30;
  var MAX_DYNAMIC_ROWS = 10;
  var MIN_DYNAMIC_ROW_ITEMS = 8;

  var state = {
    catalog: null,
    items: [],
    filters: engine.normalizeFilters({ q: '', provider: '', type: '', genre: '', year: '', sort: 'match-desc', page: 1 }),
    favorites: [],
    watchlist: [],
    history: [],
    savedFilters: [],
    customRows: [],
    optionCache: { providers: [], types: [], genres: [], years: [] }
  };

  function hydratePersistent() {
    state.favorites = storage.load(storage.keys.favorites, []);
    state.watchlist = storage.load(storage.keys.watchlist, []);
    state.history = storage.load(storage.keys.history, []);
    state.savedFilters = storage.load(storage.keys.savedFilters, []);
    state.customRows = storage.load(storage.keys.customRows, []);
  }

  function init(catalog) {
    state.catalog = catalog || { rowConfigs: [], items: [] };
    state.items = engine.enrichItems((state.catalog && state.catalog.items) || []);
    state.optionCache = engine.buildOptionCache(state.items);
    hydratePersistent();
  }

  function setFilters(next, resetPage) {
    state.filters = engine.normalizeFilters(Object.assign({}, state.filters, next || {}));
    if (resetPage) state.filters.page = 1;
  }

  function getFilters() {
    return engine.normalizeFilters(state.filters);
  }

  function toQuery() {
    var query = getFilters();
    if (query.page <= 1) delete query.page;
    return query;
  }

  function getVisibleBase() {
    var filters = getFilters();
    var visibleItems = engine.filterAndSort(state.items, filters);
    return {
      total: visibleItems.length,
      items: visibleItems
    };
  }

  function getRows() {
    var visible = getVisibleBase();
    var activeCategory = String(state.filters.genre || '');
    var activeCategoryLabel = '';
    var genreOptions = (state.optionCache && state.optionCache.genres) || [];
    for (var g = 0; g < genreOptions.length; g += 1) {
      if (String(genreOptions[g].value) === activeCategory) {
        activeCategoryLabel = String(genreOptions[g].label || '');
        break;
      }
    }
    var rows = engine.buildDynamicRows(visible.items, {
      maxRows: MAX_DYNAMIC_ROWS,
      maxCards: MAX_ROW_CARDS,
      minItems: MIN_DYNAMIC_ROW_ITEMS,
      activeCategory: activeCategory,
      activeCategoryLabel: activeCategoryLabel
    });

    for (var i = 0; i < state.customRows.length; i += 1) {
      var custom = state.customRows[i];
      if (!custom || !custom.id) continue;
      var customItems = engine.applyRowFilter(visible.items, custom.filters);
      if (!customItems.length) continue;
      rows.unshift({
        id: custom.id,
        title: custom.title || 'Sezione personalizzata',
        items: customItems.slice(0, MAX_ROW_CARDS),
        custom: true
      });
    }

    return {
      rows: rows,
      total: visible.total,
      page: state.filters.page,
      pageSize: visible.total
    };
  }

  function options() {
    return engine.cloneOptions(state.optionCache);
  }

  function hasIn(list, id) {
    for (var i = 0; i < list.length; i += 1) {
      if (String(list[i]) === String(id)) return true;
    }
    return false;
  }

  function toggleFavorite(id) {
    var result = storage.toggleArrayItem(storage.keys.favorites, id);
    state.favorites = result.list;
    return result;
  }

  function toggleWatchlist(id) {
    var result = storage.toggleArrayItem(storage.keys.watchlist, id);
    state.watchlist = result.list;
    return result;
  }

  function addHistory(id) {
    state.history = storage.pushHistory(id);
    return state.history;
  }

  function saveCurrentFilter(name) {
    var rowId = 'custom-' + new Date().getTime();
    var record = {
      id: rowId,
      title: utils.safeText(name) || ('Filtro ' + (state.customRows.length + 1)),
      filters: getFilters()
    };
    state.savedFilters.unshift(record);
    state.customRows.unshift(record);
    state.savedFilters = state.savedFilters.slice(0, 30);
    state.customRows = state.customRows.slice(0, 20);
    storage.save(storage.keys.savedFilters, state.savedFilters);
    storage.save(storage.keys.customRows, state.customRows);
    return record;
  }

  function removeCustomRow(id) {
    var next = [];
    for (var i = 0; i < state.customRows.length; i += 1) {
      if (state.customRows[i].id !== id) next.push(state.customRows[i]);
    }
    state.customRows = next;
    storage.save(storage.keys.customRows, state.customRows);
  }

  StreamBox.store = {
    init: init,
    setFilters: setFilters,
    getFilters: getFilters,
    toQuery: toQuery,
    getRows: getRows,
    options: options,
    isFavorite: function (id) { return hasIn(state.favorites, id); },
    isWatchlist: function (id) { return hasIn(state.watchlist, id); },
    getHistory: function () { return state.history.slice(); },
    getFavorites: function () { return state.favorites.slice(); },
    getWatchlist: function () { return state.watchlist.slice(); },
    getCatalog: function () { return state.catalog; },
    toggleFavorite: toggleFavorite,
    toggleWatchlist: toggleWatchlist,
    addHistory: addHistory,
    saveCurrentFilter: saveCurrentFilter,
    removeCustomRow: removeCustomRow,
    getCustomRows: function () { return state.customRows.slice(); }
  };
})(window);

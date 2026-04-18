(function (global) {
  var StreamBox = global.StreamBox = global.StreamBox || {};
  var utils = StreamBox.utils;
  var storage = StreamBox.storage;

  var PAGE_SIZE = 24;
  var CARDS_PER_ROW_PAGE = 12;
  var state = {
    catalog: null,
    items: [],
    filters: { q: '', provider: '', type: '', genre: '', year: '', sort: 'match-desc', page: 1 },
    favorites: [],
    watchlist: [],
    history: [],
    savedFilters: [],
    customRows: []
  };

  function num(value, fallback) {
    var n = parseInt(value, 10);
    return isFinite(n) && n > 0 ? n : fallback;
  }

  function normalizeFilters(raw) {
    var data = raw || {};
    return {
      q: utils.safeText(data.q),
      provider: utils.safeText(data.provider),
      type: utils.safeText(data.type),
      genre: utils.safeText(data.genre),
      year: utils.safeText(data.year),
      sort: utils.safeText(data.sort) || 'match-desc',
      page: num(data.page, 1)
    };
  }

  function hydratePersistent() {
    state.favorites = storage.load(storage.keys.favorites, []);
    state.watchlist = storage.load(storage.keys.watchlist, []);
    state.history = storage.load(storage.keys.history, []);
    state.savedFilters = storage.load(storage.keys.savedFilters, []);
    state.customRows = storage.load(storage.keys.customRows, []);
  }

  function init(catalog) {
    state.catalog = catalog || { rowConfigs: [], items: [] };
    state.items = state.catalog.items || [];
    hydratePersistent();
  }

  function setFilters(next, resetPage) {
    state.filters = normalizeFilters(Object.assign({}, state.filters, next || {}));
    if (resetPage) state.filters.page = 1;
  }

  function getFilters() {
    return normalizeFilters(state.filters);
  }

  function toQuery() {
    var q = getFilters();
    if (q.page <= 1) delete q.page;
    return q;
  }

  function itemHas(item, listKey, value) {
    if (!value) return true;
    var list = item && item[listKey];
    if (!list || !list.length) return false;
    var low = value.toLowerCase();
    for (var i = 0; i < list.length; i += 1) {
      if (String(list[i]).toLowerCase() === low) return true;
    }
    return false;
  }

  function matchItem(item, f) {
    if (!item) return false;
    if (f.provider && String(item.provider) !== f.provider) return false;
    if (f.type && String(item.type) !== f.type) return false;
    if (f.year && String(item.year) !== f.year) return false;
    if (f.genre && !itemHas(item, 'genres', f.genre)) return false;
    if (f.q) {
      var q = f.q.toLowerCase();
      var text = (
        String(item.title || '') + ' ' +
        String(item.description || '') + ' ' +
        String((item.genres || []).join(' ')) + ' ' +
        String(item.cast || '')
      ).toLowerCase();
      if (text.indexOf(q) === -1) return false;
    }
    return true;
  }

  function sortItems(items, mode) {
    var out = items.slice();
    if (mode === 'newest') return utils.sortByKey(out, 'year', true);
    if (mode === 'oldest') return utils.sortByKey(out, 'year', false);
    if (mode === 'title-az') return utils.sortByKey(out, 'title', false);
    if (mode === 'title-za') return utils.sortByKey(out, 'title', true);
    return out.sort(function (a, b) {
      var ma = utils.toNumber(a.match, 0);
      var mb = utils.toNumber(b.match, 0);
      if (mb !== ma) return mb - ma;
      return String(a.title || '').localeCompare(String(b.title || ''), 'it');
    });
  }

  function getVisibleBase() {
    var f = getFilters();
    var matched = [];
    for (var i = 0; i < state.items.length; i += 1) if (matchItem(state.items[i], f)) matched.push(state.items[i]);
    var sorted = sortItems(matched, f.sort);
    var limit = Math.max(PAGE_SIZE, f.page * PAGE_SIZE);
    return { total: sorted.length, items: sorted.slice(0, limit) };
  }

  function applyRowFilter(items, filter) {
    if (!filter) return items;
    var f = normalizeFilters(filter);
    var out = [];
    for (var i = 0; i < items.length; i += 1) if (matchItem(items[i], f)) out.push(items[i]);
    return sortItems(out, f.sort || 'match-desc');
  }

  function getRows() {
    var visible = getVisibleBase();
    var rows = [];
    var rowConfigs = (state.catalog && state.catalog.rowConfigs) || [];

    for (var i = 0; i < rowConfigs.length; i += 1) {
      var row = rowConfigs[i];
      if (!row || !row.id || row.id === 'continue') continue;
      var rowItems = [];
      for (var j = 0; j < visible.items.length; j += 1) {
        var item = visible.items[j];
        var itemRows = item.rows || [];
        for (var r = 0; r < itemRows.length; r += 1) {
          if (itemRows[r] === row.id) {
            rowItems.push(item);
            break;
          }
        }
      }
      if (!rowItems.length) continue;
      rows.push({
        id: row.id,
        title: row.title || row.id,
        items: rowItems.slice(0, row.top10 === true ? 10 : Math.max(CARDS_PER_ROW_PAGE, state.filters.page * CARDS_PER_ROW_PAGE)),
        top10: row.top10 === true
      });
    }

    for (var c = 0; c < state.customRows.length; c += 1) {
      var custom = state.customRows[c];
      if (!custom || !custom.id) continue;
      var items = applyRowFilter(visible.items, custom.filters);
      if (!items.length) continue;
      rows.unshift({
        id: custom.id,
        title: custom.title || 'Sezione personalizzata',
        items: items.slice(0, Math.max(CARDS_PER_ROW_PAGE, state.filters.page * CARDS_PER_ROW_PAGE)),
        custom: true
      });
    }

    return { rows: rows, total: visible.total, page: state.filters.page, pageSize: PAGE_SIZE };
  }

  function options() {
    var providerSet = {};
    var typeSet = {};
    var genreSet = {};
    var yearSet = {};
    for (var i = 0; i < state.items.length; i += 1) {
      var it = state.items[i];
      providerSet[it.provider] = true;
      typeSet[it.type] = true;
      yearSet[String(it.year)] = true;
      var genres = it.genres || [];
      for (var g = 0; g < genres.length; g += 1) genreSet[genres[g]] = true;
    }
    return {
      providers: Object.keys(providerSet).sort(),
      types: Object.keys(typeSet).sort(),
      genres: Object.keys(genreSet).sort(),
      years: Object.keys(yearSet).sort(function (a, b) { return parseInt(b, 10) - parseInt(a, 10); })
    };
  }

  function hasIn(list, id) {
    for (var i = 0; i < list.length; i += 1) if (String(list[i]) === String(id)) return true;
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
    var id = 'custom-' + new Date().getTime();
    var record = { id: id, title: utils.safeText(name) || ('Filtro ' + (state.customRows.length + 1)), filters: getFilters() };
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
    for (var i = 0; i < state.customRows.length; i += 1) if (state.customRows[i].id !== id) next.push(state.customRows[i]);
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

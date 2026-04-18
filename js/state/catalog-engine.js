(function (global) {
  var StreamBox = global.StreamBox = global.StreamBox || {};
  var utils = StreamBox.utils;
  var taxonomy = StreamBox.categoryTaxonomy;
  var sections = StreamBox.homeSections;
  var NOW_YEAR = new Date().getFullYear();
  var TYPE_DEFS = [
    { value: 'movie', label: 'Film' },
    { value: 'series', label: 'Serie TV' }
  ];

  function num(value, fallback) {
    var n = parseInt(value, 10);
    return isFinite(n) && n > 0 ? n : fallback;
  }

  function stripDiacritics(value) {
    var text = String(value == null ? '' : value);
    if (!text) return '';
    if (typeof text.normalize === 'function') return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return text;
  }

  function normalizeToken(value) {
    return stripDiacritics(utils.safeText(value))
      .toLowerCase()
      .replace(/['"`]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normalizeProvider(value) {
    return utils.safeText(value).toLowerCase();
  }

  function normalizeType(value) {
    var token = normalizeToken(value);
    if (!token) return '';
    if (token === 'movie' || token.indexOf('movie') !== -1 || token.indexOf('film') !== -1) return 'movie';
    if (token === 'series' || token === 'tv' || token.indexOf('serie') !== -1 || token.indexOf('anime') !== -1) return 'series';
    return '';
  }

  function normalizeYear(value) {
    var match = String(value == null ? '' : value).match(/\d{4}/);
    return match ? String(match[0]) : '';
  }

  function normalizeGenreFilter(value) {
    return taxonomy.normalizeSlug(value);
  }

  function normalizeFilters(raw) {
    var data = raw || {};
    return {
      q: utils.safeText(data.q),
      provider: normalizeProvider(data.provider),
      type: normalizeType(data.type),
      genre: normalizeGenreFilter(data.genre),
      year: normalizeYear(data.year),
      sort: utils.safeText(data.sort) || 'match-desc',
      page: num(data.page, 1)
    };
  }

  function toNumber(value) {
    var parsed = Number(value);
    return isFinite(parsed) ? parsed : 0;
  }

  function hasArrayValue(list, value) {
    if (!list || !list.length) return false;
    for (var i = 0; i < list.length; i += 1) if (String(list[i]) === String(value)) return true;
    return false;
  }

  function buildSearchText(item) {
    var castText = Array.isArray(item && item.cast) ? item.cast.join(' ') : String((item && item.cast) || '');
    var tags = Array.isArray(item && item.tags) ? item.tags.join(' ') : '';
    var keywords = Array.isArray(item && item.keywords) ? item.keywords.join(' ') : '';
    return (
      String((item && item.title) || '') + ' ' +
      String((item && item.description) || '') + ' ' +
      String((((item && item.genres) || []).join(' ')) + ' ' + tags + ' ' + keywords) + ' ' +
      castText
    ).toLowerCase();
  }

  function toMaturityAge(value) {
    var match = String(value == null ? '' : value).match(/\d{1,2}/);
    return match ? parseInt(match[0], 10) : 0;
  }

  function popularityScore(item) {
    var views = toNumber(item && item.views);
    var daily = toNumber(item && item.dailyViews);
    var match = toNumber(item && item.match);
    var score = toNumber(item && item.score);
    var viewsSignal = views > 0 ? Math.log(views + 1) : 0;
    return (daily * 25) + (viewsSignal * 20) + (match * 1.2) + (score * 6);
  }

  function enrichItem(item) {
    var source = item || {};
    var clone = Object.assign({}, source);
    clone.normalizedProvider = normalizeProvider(source.provider);
    clone.normalizedType = normalizeType(source.type);
    clone.normalizedYear = normalizeYear(source.year || source.releaseDate || source.lastAirDate);
    clone.categorySlugs = taxonomy.deriveItemCategories(source);
    clone.searchText = buildSearchText(source);
    clone.isNew = source.isNew === true || (parseInt(clone.normalizedYear, 10) >= NOW_YEAR - 1);
    clone.score = toNumber(source.score);
    clone.match = toNumber(source.match);
    clone.views = toNumber(source.views || (source.stats && source.stats.views));
    clone.dailyViews = toNumber(source.dailyViews || (source.stats && source.stats.dailyViews));
    clone.maturityAge = toMaturityAge(source.maturity);
    clone.popularityScore = popularityScore(clone);
    return clone;
  }

  function enrichItems(items) {
    var out = [];
    var list = items || [];
    for (var i = 0; i < list.length; i += 1) out.push(enrichItem(list[i]));
    return out;
  }

  function buildOptionCache(items) {
    var providerCounts = {};
    var providerLabels = {};
    var typeCounts = {};
    var yearSet = {};
    var list = items || [];
    for (var i = 0; i < list.length; i += 1) {
      var item = list[i];
      var provider = item.normalizedProvider;
      if (provider) {
        providerCounts[provider] = (providerCounts[provider] || 0) + 1;
        if (!providerLabels[provider]) providerLabels[provider] = utils.safeText(item.provider) || provider;
      }
      if (item.normalizedType) typeCounts[item.normalizedType] = (typeCounts[item.normalizedType] || 0) + 1;
      if (item.normalizedYear) yearSet[item.normalizedYear] = true;
    }

    var providers = Object.keys(providerCounts).sort(function (a, b) {
      return String(providerLabels[a] || a).localeCompare(String(providerLabels[b] || b), 'it');
    });

    var types = [];
    for (var t = 0; t < TYPE_DEFS.length; t += 1) {
      if (typeCounts[TYPE_DEFS[t].value]) types.push({ value: TYPE_DEFS[t].value, label: TYPE_DEFS[t].label });
    }

    var years = Object.keys(yearSet).sort(function (a, b) { return parseInt(b, 10) - parseInt(a, 10); });
    var categoryCounts = taxonomy.countByCategory(list);
    var genres = taxonomy.categoryOptions(categoryCounts);
    return { providers: providers, types: types, genres: genres, years: years, categoryCounts: categoryCounts };
  }

  function cloneOptions(cache) {
    var data = cache || { providers: [], types: [], genres: [], years: [] };
    var types = [];
    var genres = [];
    for (var i = 0; i < (data.types || []).length; i += 1) types.push(Object.assign({}, data.types[i]));
    for (var g = 0; g < (data.genres || []).length; g += 1) genres.push(Object.assign({}, data.genres[g]));
    return { providers: (data.providers || []).slice(), types: types, genres: genres, years: (data.years || []).slice() };
  }

  function matchItem(item, filters) {
    var f = normalizeFilters(filters);
    if (!item) return false;
    if (f.genre && !hasArrayValue(item.categorySlugs || [], f.genre)) return false;
    if (f.provider && String(item.normalizedProvider || '') !== f.provider) return false;
    if (f.type && String(item.normalizedType || '') !== f.type) return false;
    if (f.year && String(item.normalizedYear || '') !== f.year) return false;
    if (f.q && String(item.searchText || '').indexOf(f.q.toLowerCase()) === -1) return false;
    return true;
  }

  function toItemYear(item) {
    var value = parseInt(String((item && item.normalizedYear) || ''), 10);
    return isFinite(value) ? value : 0;
  }

  function sortItems(items, mode) {
    var out = (items || []).slice();
    if (mode === 'newest') return out.sort(function (a, b) { return toItemYear(b) - toItemYear(a) || String(a.title || '').localeCompare(String(b.title || ''), 'it'); });
    if (mode === 'oldest') return out.sort(function (a, b) { return toItemYear(a) - toItemYear(b) || String(a.title || '').localeCompare(String(b.title || ''), 'it'); });
    if (mode === 'title-az') return utils.sortByKey(out, 'title', false);
    if (mode === 'title-za') return utils.sortByKey(out, 'title', true);
    return out.sort(function (a, b) {
      var ma = toNumber(a.match);
      var mb = toNumber(b.match);
      if (mb !== ma) return mb - ma;
      return toNumber(b.popularityScore) - toNumber(a.popularityScore);
    });
  }

  function filterAndSort(items, filters) {
    var f = normalizeFilters(filters);
    var out = [];
    var list = items || [];
    for (var i = 0; i < list.length; i += 1) if (matchItem(list[i], f)) out.push(list[i]);
    return sortItems(out, f.sort);
  }

  function applyRowFilter(items, filter) {
    if (!filter) return items || [];
    return filterAndSort(items, filter);
  }

  function buildDynamicRows(items, config) {
    return sections.buildRows(items || [], config || {});
  }

  StreamBox.catalogEngine = {
    normalizeFilters: normalizeFilters,
    enrichItems: enrichItems,
    buildOptionCache: buildOptionCache,
    cloneOptions: cloneOptions,
    filterAndSort: filterAndSort,
    applyRowFilter: applyRowFilter,
    buildDynamicRows: buildDynamicRows
  };
})(window);

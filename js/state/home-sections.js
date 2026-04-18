(function (global) {
  var StreamBox = global.StreamBox = global.StreamBox || {};

  function toNumber(value) {
    var parsed = Number(value);
    return isFinite(parsed) ? parsed : 0;
  }

  function hasCategory(item, slug) {
    var list = (item && item.categorySlugs) || [];
    for (var i = 0; i < list.length; i += 1) if (String(list[i]) === String(slug)) return true;
    return false;
  }

  function maturityAge(item) {
    var match = String((item && item.maturity) || '').match(/\d{1,2}/);
    return match ? parseInt(match[0], 10) : 0;
  }

  function scoreSorter(a, b) {
    var sa = toNumber(a && a.score);
    var sb = toNumber(b && b.score);
    if (sb !== sa) return sb - sa;
    var pa = toNumber(a && a.popularityScore);
    var pb = toNumber(b && b.popularityScore);
    if (pb !== pa) return pb - pa;
    return toNumber(b && b.match) - toNumber(a && a.match);
  }

  function popularitySorter(a, b) {
    var pa = toNumber(a && a.popularityScore);
    var pb = toNumber(b && b.popularityScore);
    if (pb !== pa) return pb - pa;
    var ma = toNumber(a && a.match);
    var mb = toNumber(b && b.match);
    if (mb !== ma) return mb - ma;
    return toNumber(b && b.score) - toNumber(a && a.score);
  }

  function titleForCategory(base, categoryLabel) {
    if (!categoryLabel) return base;
    return base + ' · ' + categoryLabel;
  }

  function rowSignature(items) {
    var ids = [];
    for (var i = 0; i < items.length; i += 1) ids.push(String(items[i].id || ''));
    return ids.join('|');
  }

  function sortedCandidates(items, matcher, sorter) {
    var out = [];
    for (var i = 0; i < items.length; i += 1) if (matcher(items[i])) out.push(items[i]);
    if (sorter) out.sort(sorter);
    return out;
  }

  function pickRowItems(candidates, seen, maxCards) {
    var fresh = [];
    var overlap = [];
    for (var i = 0; i < candidates.length; i += 1) {
      var item = candidates[i];
      if (seen[item.id]) overlap.push(item);
      else fresh.push(item);
    }
    var out = [];
    for (var f = 0; f < fresh.length && out.length < maxCards; f += 1) out.push(fresh[f]);
    for (var o = 0; o < overlap.length && out.length < maxCards; o += 1) out.push(overlap[o]);
    for (var k = 0; k < out.length; k += 1) seen[out[k].id] = true;
    return out;
  }

  function resolveMinItems(total, inputMin, activeCategory) {
    var base = Math.max(2, parseInt(inputMin, 10) || 8);
    if (!activeCategory) return base;
    if (total < 35) return 2;
    if (total < 70) return 3;
    if (total < 120) return 4;
    return Math.min(base, 6);
  }

  function buildRows(items, context) {
    var opts = context || {};
    var maxRows = Math.max(1, parseInt(opts.maxRows, 10) || 10);
    var maxCards = Math.max(1, parseInt(opts.maxCards, 10) || 30);
    var activeCategory = String(opts.activeCategory || '');
    var categoryLabel = String(opts.activeCategoryLabel || '');
    var minItems = resolveMinItems((items || []).length, opts.minItems, activeCategory);
    var seen = {};
    var signatures = {};
    var rows = [];

    var rowDefs = [
      {
        id: 'loved',
        title: titleForCategory('I piu amati dal pubblico', categoryLabel),
        allowSmall: true,
        matcher: function (item) { return toNumber(item && item.score) >= 8; },
        relaxedMatcher: function (item) { return toNumber(item && item.score) >= 7.5; },
        sorter: scoreSorter
      },
      {
        id: 'trending',
        title: titleForCategory('In tendenza', categoryLabel),
        allowSmall: true,
        matcher: function () { return true; },
        sorter: popularitySorter
      },
      {
        id: 'anime',
        title: titleForCategory('Anime', categoryLabel),
        matcher: function (item) {
          return hasCategory(item, 'anime') || String(item.normalizedProvider || '') === 'animeunity';
        },
        sorter: popularitySorter
      },
      {
        id: 'series',
        title: titleForCategory('Serie TV', categoryLabel),
        matcher: function (item) { return String(item.normalizedType || '') === 'series'; },
        sorter: popularitySorter
      },
      {
        id: 'movies',
        title: titleForCategory('Film', categoryLabel),
        matcher: function (item) { return String(item.normalizedType || '') === 'movie'; },
        sorter: popularitySorter
      },
      {
        id: 'kids',
        title: titleForCategory('TV per bambini', categoryLabel),
        matcher: function (item) {
          return hasCategory(item, 'bambini-e-famiglie') || (maturityAge(item) > 0 && maturityAge(item) <= 13);
        },
        sorter: popularitySorter
      },
      {
        id: 'new-release',
        title: titleForCategory('Nuove uscite', categoryLabel),
        allowSmall: true,
        matcher: function (item) { return item && item.isNew === true; },
        sorter: popularitySorter
      }
    ];

    for (var i = 0; i < rowDefs.length; i += 1) {
      if (rows.length >= maxRows) break;
      var def = rowDefs[i];
      var candidates = sortedCandidates(items || [], def.matcher, def.sorter);
      if (candidates.length < minItems && def.relaxedMatcher) {
        candidates = sortedCandidates(items || [], def.relaxedMatcher, def.sorter);
      }
      if (!candidates.length) continue;
      var rowItems = pickRowItems(candidates, seen, maxCards);
      if (!def.allowSmall && rowItems.length < minItems) continue;
      var signature = rowSignature(rowItems);
      if (signature && signatures[signature]) continue;
      signatures[signature] = true;
      rows.push({ id: def.id, title: def.title, items: rowItems, top10: false });
    }

    return rows;
  }

  StreamBox.homeSections = {
    buildRows: buildRows
  };
})(window);

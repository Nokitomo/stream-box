(function (global) {
  var StreamBox = global.StreamBox = global.StreamBox || {};
  var utils = StreamBox.utils;

  var CATEGORY_DEFS = [
    { value: 'acclamati-dalla-critica', label: 'Acclamati dalla critica', terms: ['acclaimed', 'critically acclaimed', 'award winning', 'oscar', 'golden globe', 'festival'] },
    { value: 'anime', label: 'Anime', terms: ['anime', 'animazione', 'animation', 'cartoon', 'ova', 'ona'] },
    { value: 'astrologia', label: 'Astrologia', terms: ['astrologia', 'astrology', 'zodiac', 'oroscopo', 'horoscope'] },
    { value: 'azione', label: 'Azione', terms: ['azione', 'action', 'shounen', 'battle', 'martial arts', 'superhero'] },
    { value: 'bambini-e-famiglie', label: 'Bambini e famiglie', terms: ['family', 'famiglia', 'kids', 'children', 'per famiglie', 'cartoon'] },
    { value: 'campione-d-incassi', label: 'Campione d\'incassi', terms: ['box office', 'blockbuster', 'highest grossing', 'campione d incassi'] },
    { value: 'commedie', label: 'Commedie', terms: ['comedy', 'commedia', 'humor', 'sitcom', 'comic'] },
    { value: 'documentari', label: 'Documentari', terms: ['documentary', 'documentario', 'docu'] },
    { value: 'drammi', label: 'Drammi', terms: ['drama', 'dramma', 'drammatico', 'melodrama'] },
    { value: 'europei', label: 'Europei', terms: ['europe', 'european', 'europa'] },
    { value: 'fantascienza', label: 'Fantascienza', terms: ['sci fi', 'sci-fi', 'science fiction', 'fantascienza', 'cyberpunk', 'space opera'] },
    { value: 'fantasy', label: 'Fantasy', terms: ['fantasy', 'fantastico', 'magia', 'magic', 'isekai', 'supernatural', 'soprannaturale'] },
    { value: 'horror', label: 'Horror', terms: ['horror', 'orrore', 'slasher', 'creepy'] },
    { value: 'internazionali', label: 'Internazionali', terms: ['international', 'internazionale', 'global'] },
    { value: 'italiani', label: 'Italiani', terms: ['italy', 'italia', 'italian', 'italiano'] },
    { value: 'musica-e-musical', label: 'Musica e musical', terms: ['music', 'musica', 'musical', 'concert', 'band'] },
    { value: 'reality', label: 'Reality', terms: ['reality', 'reality show'] },
    { value: 'romantici', label: 'Romantici', terms: ['romance', 'romantico', 'romantica', 'love', 'sentimentale'] },
    { value: 'sport', label: 'Sport', terms: ['sport', 'sports', 'basket', 'football', 'calcio', 'tennis'] },
    { value: 'thriller', label: 'Thriller', terms: ['thriller', 'suspense', 'psicologico', 'psychological', 'crime thriller'] },
    { value: 'avventura', label: 'Avventura', terms: ['adventure', 'avventura', 'journey', 'quest'] },
    { value: 'crime', label: 'Crime', terms: ['crime', 'gangster', 'mafia', 'detective', 'mystery', 'noir', 'police'] }
  ];

  var aliasMap = {};
  var defByValue = {};
  initDefinitions();

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

  function toNumber(value) {
    var parsed = Number(value);
    return isFinite(parsed) ? parsed : 0;
  }

  function normalizeMaturity(value) {
    var match = String(value == null ? '' : value).match(/\d{1,2}/);
    return match ? parseInt(match[0], 10) : 0;
  }

  function addAlias(alias, target) {
    var key = normalizeToken(alias);
    if (!key) return;
    aliasMap[key] = target;
  }

  function initDefinitions() {
    aliasMap = {};
    defByValue = {};
    for (var i = 0; i < CATEGORY_DEFS.length; i += 1) {
      var def = CATEGORY_DEFS[i];
      defByValue[def.value] = def;
      addAlias(def.value, def.value);
      addAlias(def.label, def.value);
      var terms = def.terms || [];
      for (var t = 0; t < terms.length; t += 1) addAlias(terms[t], def.value);
    }

    addAlias('action', 'azione');
    addAlias('comedy', 'commedie');
    addAlias('drama', 'drammi');
    addAlias('romance', 'romantici');
    addAlias('sci-fi', 'fantascienza');
    addAlias('sci fi', 'fantascienza');
    addAlias('science fiction', 'fantascienza');
    addAlias('family', 'bambini-e-famiglie');
    addAlias('animation', 'anime');
    addAlias('animazione', 'anime');
    addAlias('documentary', 'documentari');
    addAlias('documentario', 'documentari');
    addAlias('music', 'musica-e-musical');
    addAlias('musical', 'musica-e-musical');
    addAlias('adventure', 'avventura');
    addAlias('crime thriller', 'thriller');
  }

  function normalizeSlug(value) {
    var token = normalizeToken(value);
    if (!token) return '';
    return aliasMap[token] || token;
  }

  function normalizeCategoryList(values) {
    var list = values || [];
    var out = [];
    var seen = {};
    for (var i = 0; i < list.length; i += 1) {
      var normalized = normalizeSlug(list[i]);
      if (!normalized || seen[normalized]) continue;
      seen[normalized] = true;
      out.push(normalized);
    }
    return out;
  }

  function prepareTokenContext(item) {
    var sources = [];
    function append(values) {
      if (!values) return;
      var list = Array.isArray(values) ? values : [values];
      for (var i = 0; i < list.length; i += 1) {
        var token = normalizeToken(list[i]);
        if (token) sources.push(token);
      }
    }

    append(item && item.categoryTags);
    append(item && item.genres);
    append(item && item.tags);
    append(item && item.keywords);
    append(item && item.type);
    append(item && item.provider);
    append(item && item.title);
    append(item && item.description);
    append(item && item.synopsis);

    var set = {};
    for (var s = 0; s < sources.length; s += 1) set[sources[s]] = true;
    return {
      tokenSet: set,
      tokenText: ' ' + sources.join(' ') + ' ',
      score: toNumber(item && item.score),
      match: toNumber(item && item.match),
      views: toNumber(item && item.views),
      dailyViews: toNumber(item && item.dailyViews),
      maturity: normalizeMaturity(item && item.maturity),
      provider: normalizeToken(item && item.provider),
      type: normalizeToken(item && item.type)
    };
  }

  function hasAnyToken(ctx, terms) {
    var list = terms || [];
    for (var i = 0; i < list.length; i += 1) {
      var term = normalizeToken(list[i]);
      if (!term) continue;
      if (ctx.tokenSet[term]) return true;
      if (ctx.tokenText.indexOf(' ' + term + ' ') !== -1) return true;
    }
    return false;
  }

  function matchesCategory(ctx, slug) {
    if (!slug) return false;
    var def = defByValue[slug];
    if (!def) return false;
    if (hasAnyToken(ctx, def.terms || [])) return true;
    if (slug === 'anime') return ctx.provider === 'animeunity' || hasAnyToken(ctx, ['anime', 'animation', 'animazione', 'cartoon']);
    if (slug === 'bambini-e-famiglie') return hasAnyToken(ctx, ['kids', 'children', 'family', 'famiglia']) || (ctx.maturity > 0 && ctx.maturity <= 13);
    if (slug === 'acclamati-dalla-critica') return ctx.score >= 8;
    if (slug === 'campione-d-incassi') return ctx.views >= 50000 || ctx.dailyViews >= 90 || (ctx.match >= 97 && ctx.score >= 7.5);
    if (slug === 'internazionali') return hasAnyToken(ctx, ['international', 'internazionale']) || ctx.provider === 'streamingunity';
    return false;
  }

  function deriveItemCategories(item) {
    var ctx = prepareTokenContext(item || {});
    var out = normalizeCategoryList((item && item.categoryTags) || []);
    var seen = {};
    for (var i = 0; i < out.length; i += 1) seen[out[i]] = true;
    for (var d = 0; d < CATEGORY_DEFS.length; d += 1) {
      var slug = CATEGORY_DEFS[d].value;
      if (seen[slug]) continue;
      if (!matchesCategory(ctx, slug)) continue;
      seen[slug] = true;
      out.push(slug);
    }
    return out;
  }

  function countByCategory(items) {
    var counts = {};
    var list = items || [];
    for (var i = 0; i < CATEGORY_DEFS.length; i += 1) counts[CATEGORY_DEFS[i].value] = 0;
    for (var n = 0; n < list.length; n += 1) {
      var categories = (list[n] && list[n].categorySlugs) || deriveItemCategories(list[n] || {});
      var unique = {};
      for (var c = 0; c < categories.length; c += 1) {
        var slug = normalizeSlug(categories[c]);
        if (!slug || unique[slug] || counts[slug] == null) continue;
        unique[slug] = true;
        counts[slug] += 1;
      }
    }
    return counts;
  }

  function categoryOptions(counts) {
    var values = [];
    var data = counts || {};
    for (var i = 0; i < CATEGORY_DEFS.length; i += 1) {
      var def = CATEGORY_DEFS[i];
      if (toNumber(data[def.value]) <= 0) continue;
      values.push({ value: def.value, label: def.label });
    }
    return values;
  }

  StreamBox.categoryTaxonomy = {
    normalizeToken: normalizeToken,
    normalizeSlug: normalizeSlug,
    normalizeCategoryList: normalizeCategoryList,
    deriveItemCategories: deriveItemCategories,
    countByCategory: countByCategory,
    categoryOptions: categoryOptions,
    getDefinitions: function () { return CATEGORY_DEFS.slice(); },
    getLabel: function (slug) {
      var key = normalizeSlug(slug);
      return defByValue[key] ? defByValue[key].label : '';
    }
  };
})(window);

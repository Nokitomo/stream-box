(function (global) {
  var StreamBox = global.StreamBox = global.StreamBox || {};
  var utils = StreamBox.utils;

  var CACHE_LIMIT = 12;
  var detailCache = {};
  var cacheOrder = [];
  var indexData = null;
  var summaryById = {};
  var detailChunkById = {};
  var catalogIdByProviderLocal = {};

  function xhrJson(url) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;
        if (xhr.status < 200 || xhr.status >= 300) {
          reject(new Error('Request failed: ' + xhr.status + ' ' + url));
          return;
        }
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch (err) {
          reject(err);
        }
      };
      xhr.onerror = function () { reject(new Error('Network error')); };
      xhr.send();
    });
  }

  function requestJson(url) {
    if (global.fetch) {
      return global.fetch(url).then(function (res) {
        if (!res.ok) throw new Error('Request failed: ' + res.status + ' ' + url);
        return res.json();
      });
    }
    return xhrJson(url);
  }

  function touchChunk(file) {
    var next = [];
    for (var i = 0; i < cacheOrder.length; i += 1) if (cacheOrder[i] !== file) next.push(cacheOrder[i]);
    next.unshift(file);
    if (next.length > CACHE_LIMIT) {
      var removed = next.pop();
      delete detailCache[removed];
    }
    cacheOrder = next;
  }

  function prepareIndex(data) {
    indexData = data || {};
    summaryById = {};
    detailChunkById = {};
    catalogIdByProviderLocal = {};
    var items = indexData.items || [];
    for (var i = 0; i < items.length; i += 1) {
      var item = items[i];
      if (!item || !item.id) continue;
      var catalogId = String(item.id);
      summaryById[catalogId] = item;
      detailChunkById[catalogId] = item.detailChunk || '';

      var dash = catalogId.indexOf('-');
      if (dash > 0) {
        var provider = catalogId.slice(0, dash);
        var localId = catalogId.slice(dash + 1);
        if (provider && localId) catalogIdByProviderLocal[provider + ':' + localId] = catalogId;
      }
    }
    return indexData;
  }

  function loadIndex() {
    return requestJson(utils.resolvePath('data/app/catalog-index.json')).then(function (data) {
      return prepareIndex(data);
    });
  }

  function getSummaryById(id) {
    return summaryById[id] || null;
  }

  function getItems() {
    return (indexData && indexData.items) ? indexData.items : [];
  }

  function chunkUrl(file) {
    return utils.resolvePath('data/app/' + String(file || '').replace(/^\/+/, ''));
  }

  function resolveCatalogId(rawId, providerHint) {
    var input = utils.safeText(rawId);
    if (!input) return '';
    if (summaryById[input]) return input;

    var hint = utils.safeText(providerHint).toLowerCase();
    if (hint && catalogIdByProviderLocal[hint + ':' + input]) {
      return catalogIdByProviderLocal[hint + ':' + input];
    }

    var anime = catalogIdByProviderLocal['animeunity:' + input] || '';
    var stream = catalogIdByProviderLocal['streamingunity:' + input] || '';
    if (anime && !stream) return anime;
    if (!anime && stream) return stream;
    if (anime && stream) return hint === 'animeunity' ? anime : stream;
    return '';
  }

  function getDetailById(id) {
    var file = detailChunkById[id];
    if (!file) return Promise.resolve(null);
    if (detailCache[file]) {
      touchChunk(file);
      return Promise.resolve(detailCache[file][id] || null);
    }
    return requestJson(chunkUrl(file)).then(function (chunk) {
      var map = {};
      var items = (chunk && chunk.items) || [];
      for (var i = 0; i < items.length; i += 1) {
        if (items[i] && items[i].id) map[items[i].id] = items[i];
      }
      detailCache[file] = map;
      touchChunk(file);
      return map[id] || null;
    });
  }

  function getUniqueValues(key, max) {
    var items = getItems();
    var values = [];
    for (var i = 0; i < items.length; i += 1) {
      var row = items[i];
      if (!row) continue;
      if (key === 'genre') {
        var genres = row.genres || [];
        for (var g = 0; g < genres.length; g += 1) values.push(genres[g]);
      } else {
        values.push(row[key]);
      }
    }
    var clean = [];
    for (var j = 0; j < values.length; j += 1) {
      var text = utils.safeText(values[j]);
      if (text) clean.push(text);
    }
    clean = utils.unique(clean).sort();
    return clean.slice(0, max || clean.length);
  }

  StreamBox.data = {
    requestJson: requestJson,
    loadIndex: loadIndex,
    getItems: getItems,
    getSummaryById: getSummaryById,
    getDetailById: getDetailById,
    getUniqueValues: getUniqueValues,
    resolveCatalogId: resolveCatalogId
  };
})(window);

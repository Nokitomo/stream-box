(function (global) {
  var StreamBox = global.StreamBox = global.StreamBox || {};
  var NS = 'streambox.v1.';

  function load(key, fallback) {
    try {
      var raw = global.localStorage.getItem(NS + key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (_) {
      return fallback;
    }
  }

  function save(key, value) {
    try {
      global.localStorage.setItem(NS + key, JSON.stringify(value));
      return true;
    } catch (_) {
      return false;
    }
  }

  function remove(key) {
    try { global.localStorage.removeItem(NS + key); } catch (_) {}
  }

  function toggleArrayItem(key, id) {
    var list = load(key, []);
    var next = [];
    var found = false;
    for (var i = 0; i < list.length; i += 1) {
      if (String(list[i]) === String(id)) {
        found = true;
      } else {
        next.push(list[i]);
      }
    }
    if (!found) next.unshift(id);
    if (next.length > 800) next = next.slice(0, 800);
    save(key, next);
    return { list: next, added: !found };
  }

  function pushHistory(id) {
    var list = load('history', []);
    var next = [id];
    for (var i = 0; i < list.length; i += 1) {
      if (String(list[i]) !== String(id)) next.push(list[i]);
      if (next.length >= 120) break;
    }
    save('history', next);
    return next;
  }

  StreamBox.storage = {
    load: load,
    save: save,
    remove: remove,
    toggleArrayItem: toggleArrayItem,
    pushHistory: pushHistory,
    keys: {
      favorites: 'favorites',
      watchlist: 'watchlist',
      history: 'history',
      savedFilters: 'savedFilters',
      customRows: 'customRows'
    }
  };
})(window);

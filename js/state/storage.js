(function (global) {
  var StreamBox = global.StreamBox = global.StreamBox || {};
  var NS = 'streambox.v1.';
  var PLAYER_PROGRESS_NS = NS + 'player.progress.';

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

  function toNumber(value, fallback) {
    var parsed = Number(value);
    return isFinite(parsed) ? parsed : fallback;
  }

  function cleanText(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  }

  function parseEpisodeHint(rawKey, prefix) {
    var suffix = String(rawKey || '').replace(String(prefix || ''), '');
    if (!suffix) return '';
    var decoded = suffix;
    try {
      decoded = decodeURIComponent(suffix).replace(/\+/g, ' ');
    } catch (_) {
      decoded = suffix;
    }
    decoded = cleanText(decoded);
    if (!decoded) return '';
    if (/^\d+$/.test(decoded)) return 'Ep ' + decoded;
    var match = decoded.match(/(?:ep(?:isodio)?|episode)[^\d]*(\d+)/i);
    if (match && match[1]) return 'Ep ' + match[1];
    return '';
  }

  function makeProgressPrefixes(contentIds) {
    var prefixes = [];
    var seen = {};
    var source = Array.isArray(contentIds) ? contentIds : [];
    for (var i = 0; i < source.length; i += 1) {
      var id = String(source[i] || '');
      if (!id || seen[id]) continue;
      seen[id] = true;
      prefixes.push({
        id: id,
        prefix: PLAYER_PROGRESS_NS + id + '.'
      });
    }
    return prefixes;
  }

  function listContinueWatching(contentIds, limit) {
    var prefixes = makeProgressPrefixes(contentIds);
    var out = [];
    if (!prefixes.length) return out;

    var byId = {};
    try {
      for (var i = 0; i < global.localStorage.length; i += 1) {
        var key = String(global.localStorage.key(i) || '');
        if (key.indexOf(PLAYER_PROGRESS_NS) !== 0) continue;

        var matchedId = '';
        var matchedPrefix = '';
        for (var p = 0; p < prefixes.length; p += 1) {
          if (key.indexOf(prefixes[p].prefix) === 0) {
            matchedId = prefixes[p].id;
            matchedPrefix = prefixes[p].prefix;
            break;
          }
        }
        if (!matchedId) continue;

        var raw = global.localStorage.getItem(key);
        if (!raw) continue;

        var parsed = null;
        try {
          parsed = JSON.parse(raw);
        } catch (_) {
          parsed = null;
        }
        if (!parsed || typeof parsed !== 'object') continue;

        var position = Math.max(0, toNumber(parsed.position, 0));
        var duration = Math.max(0, toNumber(parsed.duration, 0));
        if (!position || !duration) continue;

        var percent = Math.max(0, Math.min(100, (position / duration) * 100));
        if (percent <= 0 || percent >= 99) continue;

        var updatedAt = toNumber(parsed.updatedAt, 0);
        var prev = byId[matchedId];
        if (!prev || updatedAt >= prev.updatedAt) {
          var episodeTitle = cleanText(parsed.episodeTitle || '');
          var episodeNumber = toNumber(parsed.episodeNumber, NaN);
          var seasonNumber = toNumber(parsed.seasonNumber, NaN);
          var episodeLabel = '';
          if (isFinite(episodeNumber) && episodeNumber > 0) {
            episodeLabel = isFinite(seasonNumber) && seasonNumber > 0
              ? ('S' + seasonNumber + ' Ep ' + episodeNumber)
              : ('Ep ' + episodeNumber);
          } else if (episodeTitle) {
            episodeLabel = episodeTitle;
          } else {
            episodeLabel = parseEpisodeHint(key, matchedPrefix);
          }
          byId[matchedId] = {
            id: matchedId,
            percent: percent,
            position: position,
            duration: duration,
            updatedAt: updatedAt,
            episodeLabel: episodeLabel,
            episodeTitle: episodeTitle,
            episodeNumber: isFinite(episodeNumber) ? episodeNumber : undefined,
            seasonNumber: isFinite(seasonNumber) ? seasonNumber : undefined
          };
        }
      }
    } catch (_) {
      return out;
    }

    for (var id in byId) {
      if (!Object.prototype.hasOwnProperty.call(byId, id)) continue;
      out.push(byId[id]);
    }

    out.sort(function (a, b) {
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });

    var max = Math.max(0, Number(limit) || 0);
    if (max && out.length > max) return out.slice(0, max);
    return out;
  }

  StreamBox.storage = {
    load: load,
    save: save,
    remove: remove,
    toggleArrayItem: toggleArrayItem,
    pushHistory: pushHistory,
    listContinueWatching: listContinueWatching,
    keys: {
      favorites: 'favorites',
      watchlist: 'watchlist',
      history: 'history',
      savedFilters: 'savedFilters',
      customRows: 'customRows'
    }
  };
})(window);

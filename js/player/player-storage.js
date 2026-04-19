(function (global) {
  var StreamBox = global.StreamBox = global.StreamBox || {};
  var NS = 'streambox.v1.player.';

  function safeParse(raw, fallback) {
    if (!raw) return fallback;
    try {
      return JSON.parse(raw);
    } catch (_) {
      return fallback;
    }
  }

  function key(name) {
    return NS + name;
  }

  function makeProgressKey(contentId, episodeLink) {
    return key('progress.' + String(contentId || '') + '.' + String(episodeLink || ''));
  }

  function makePrefsKey(contentId) {
    return key('prefs.' + String(contentId || ''));
  }

  function loadProgress(contentId, episodeLink) {
    try {
      var raw = global.localStorage.getItem(makeProgressKey(contentId, episodeLink));
      return safeParse(raw, null);
    } catch (_) {
      return null;
    }
  }

  function saveProgress(contentId, episodeLink, position, duration, meta) {
    if (!contentId || !episodeLink) return false;
    var extras = meta && typeof meta === 'object' ? meta : {};
    var payload = {
      position: Number(position) || 0,
      duration: Number(duration) || 0,
      updatedAt: Date.now()
    };
    if (extras.episodeTitle) payload.episodeTitle = String(extras.episodeTitle);
    if (isFinite(Number(extras.episodeNumber))) payload.episodeNumber = Number(extras.episodeNumber);
    if (isFinite(Number(extras.seasonNumber))) payload.seasonNumber = Number(extras.seasonNumber);
    try {
      global.localStorage.setItem(makeProgressKey(contentId, episodeLink), JSON.stringify(payload));
      return true;
    } catch (_) {
      return false;
    }
  }

  function loadPreferences(contentId) {
    if (!contentId) return {};
    try {
      var raw = global.localStorage.getItem(makePrefsKey(contentId));
      return safeParse(raw, {}) || {};
    } catch (_) {
      return {};
    }
  }

  function savePreferences(contentId, nextPrefs) {
    if (!contentId || !nextPrefs) return false;
    var prev = loadPreferences(contentId);
    var merged = {};
    var keyName;
    for (keyName in prev) {
      if (Object.prototype.hasOwnProperty.call(prev, keyName)) merged[keyName] = prev[keyName];
    }
    for (keyName in nextPrefs) {
      if (Object.prototype.hasOwnProperty.call(nextPrefs, keyName)) merged[keyName] = nextPrefs[keyName];
    }
    try {
      global.localStorage.setItem(makePrefsKey(contentId), JSON.stringify(merged));
      return true;
    } catch (_) {
      return false;
    }
  }

  StreamBox.playerStorage = {
    loadProgress: loadProgress,
    saveProgress: saveProgress,
    loadPreferences: loadPreferences,
    savePreferences: savePreferences
  };
})(window);

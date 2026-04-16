window.NetflixClone = window.NetflixClone || {};

(function initStorage(app) {
  const keys = {
    myList: "netflix-clone-my-list",
    progress: "netflix-clone-progress-map"
  };

  function loadArray(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) {
        return [];
      }

      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  function saveArray(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function loadObject(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) {
        return {};
      }

      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return {};
      }

      return parsed;
    } catch (error) {
      return {};
    }
  }

  function saveObject(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function clampProgress(value) {
    return Math.max(0, Math.min(100, Number(value) || 0));
  }

  app.storage = {
    keys,
    loadArray,
    saveArray,
    loadObject,
    saveObject,
    clampProgress
  };
})(window.NetflixClone);

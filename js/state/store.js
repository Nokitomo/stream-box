window.NetflixClone = window.NetflixClone || {};

(function initStore(app) {
  const storage = app.storage || {};

  function loadMyList() {
    return new Set(storage.loadArray(storage.keys.myList));
  }

  function saveMyList(myListSet) {
    storage.saveArray(storage.keys.myList, [...myListSet]);
  }

  function loadProgressMap() {
    const map = storage.loadObject(storage.keys.progress);
    const normalized = {};

    Object.keys(map).forEach((id) => {
      normalized[id] = storage.clampProgress(map[id]);
    });

    return normalized;
  }

  function saveProgressMap(progressMap) {
    storage.saveObject(storage.keys.progress, progressMap);
  }

  app.createStore = function createStore(initialRoute) {
    const data = app.data || {};
    const defaultHero = data.featuredId || "";
    const listeners = new Set();
    const state = {
      activeTab: "home",
      query: "",
      heroId: defaultHero,
      selectedId: null,
      myList: loadMyList(),
      progressMap: loadProgressMap()
    };

    function notify() {
      listeners.forEach((listener) => listener(state));
    }

    function setRoute(route) {
      let dirty = false;
      const safeTab = ["home", "series", "movie", "new", "my-list"].includes(route.tab) ? route.tab : "home";
      const safeQuery = typeof route.query === "string" ? route.query : "";
      const safeTitle = route.title || null;

      if (state.activeTab !== safeTab) {
        state.activeTab = safeTab;
        dirty = true;
      }

      if (state.query !== safeQuery) {
        state.query = safeQuery;
        dirty = true;
      }

      if (state.selectedId !== safeTitle) {
        state.selectedId = safeTitle;
        dirty = true;
      }

      if (dirty) {
        notify();
      }
    }

    if (initialRoute) {
      setRoute(initialRoute);
    }

    return {
      getState() {
        return state;
      },

      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },

      setRoute,

      setActiveTab(tab) {
        if (state.activeTab === tab) {
          return;
        }

        state.activeTab = tab;
        notify();
      },

      setQuery(query) {
        if (state.query === query) {
          return;
        }

        state.query = query;
        notify();
      },

      setHero(id) {
        if (!id || state.heroId === id) {
          return;
        }

        state.heroId = id;
        notify();
      },

      openModal(id) {
        if (state.selectedId === id) {
          return;
        }

        state.selectedId = id;
        notify();
      },

      closeModal() {
        if (!state.selectedId) {
          return;
        }

        state.selectedId = null;
        notify();
      },

      toggleList(id) {
        if (state.myList.has(id)) {
          state.myList.delete(id);
          saveMyList(state.myList);
          notify();
          return false;
        }

        state.myList.add(id);
        saveMyList(state.myList);
        notify();
        return true;
      },

      getProgress(id, fallback) {
        if (typeof state.progressMap[id] === "number") {
          return state.progressMap[id];
        }

        return storage.clampProgress(fallback);
      },

      setProgress(id, value) {
        const next = storage.clampProgress(value);
        if (state.progressMap[id] === next) {
          return next;
        }

        state.progressMap[id] = next;
        saveProgressMap(state.progressMap);
        notify();
        return next;
      },

      bumpProgress(id, delta, fallback) {
        const current = this.getProgress(id, fallback);
        const next = storage.clampProgress(current + delta);
        return this.setProgress(id, next);
      }
    };
  };
})(window.NetflixClone);

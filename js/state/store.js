import { featuredId } from "../data/catalog.js";

const STORAGE_KEY = "netflix-clone-my-list";

function loadStoredList() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return new Set();
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return new Set();
    }

    return new Set(parsed);
  } catch (error) {
    return new Set();
  }
}

function persistList(listSet) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...listSet]));
}

export function createStore() {
  const listeners = new Set();
  const state = {
    activeTab: "home",
    query: "",
    heroId: featuredId,
    selectedId: null,
    myList: loadStoredList()
  };

  function notify() {
    listeners.forEach((listener) => listener(state));
  }

  return {
    getState() {
      return state;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

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
        persistList(state.myList);
        notify();
        return false;
      }

      state.myList.add(id);
      persistList(state.myList);
      notify();
      return true;
    }
  };
}

window.NetflixClone = window.NetflixClone || {};

(function initUrlState(app) {
  const validTabs = new Set(["home", "series", "movie", "new", "my-list"]);

  function parseRoute(search) {
    const params = new URLSearchParams(search || window.location.search);
    const tab = params.get("tab") || "home";
    const query = params.get("q") || "";
    const title = params.get("title");

    return {
      tab: validTabs.has(tab) ? tab : "home",
      query,
      title: title || null
    };
  }

  function buildRoute(state) {
    const params = new URLSearchParams();

    if (state.activeTab && state.activeTab !== "home") {
      params.set("tab", state.activeTab);
    }

    if (state.query) {
      params.set("q", state.query);
    }

    if (state.selectedId) {
      params.set("title", state.selectedId);
    }

    return params.toString();
  }

  function syncUrlFromState(state, replace) {
    const query = buildRoute(state);
    const target = query ? `?${query}` : window.location.pathname.split("/").pop() || "index.html";
    const method = replace ? "replaceState" : "pushState";
    window.history[method]({}, "", target);
  }

  app.urlState = {
    parseRoute,
    buildRoute,
    syncUrlFromState
  };
})(window.NetflixClone);

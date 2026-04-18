window.NetflixClone = window.NetflixClone || {};

(async function boot(app) {
  if (typeof app.data?.loadCatalogIndex === "function") {
    await app.data.loadCatalogIndex();
  }

  const route = app.urlState.parseRoute();
  const store = app.createStore(route);
  const renderer = app.initRenderer(store);
  let ignoreNextUrlSync = false;
  let initialized = false;
  let lastRouteQuery = app.urlState.buildRoute(store.getState());

  function getModalFromQuery(query) {
    const params = new URLSearchParams(query);
    return params.get("title");
  }

  store.subscribe((state) => {
    renderer.render();

    if (ignoreNextUrlSync) {
      ignoreNextUrlSync = false;
      return;
    }

    const nextRouteQuery = app.urlState.buildRoute(state);
    if (nextRouteQuery !== lastRouteQuery) {
      const previousModal = getModalFromQuery(lastRouteQuery);
      const nextModal = getModalFromQuery(nextRouteQuery);
      const shouldReplace = !initialized || previousModal === nextModal;
      app.urlState.syncUrlFromState(state, shouldReplace);
      lastRouteQuery = nextRouteQuery;
      initialized = true;
    }
  });

  app.initInteractions(store, renderer);
  renderer.render();
  app.urlState.syncUrlFromState(store.getState(), true);
  lastRouteQuery = app.urlState.buildRoute(store.getState());
  initialized = true;

  window.addEventListener("popstate", () => {
    ignoreNextUrlSync = true;
    store.setRoute(app.urlState.parseRoute());
  });
})(window.NetflixClone);

(function (global) {
  var StreamBox = global.StreamBox;
  var utils = StreamBox.utils;
  var data = StreamBox.data;

  function boot() {
    var status = utils.byId('searchStatus');
    if (status) status.innerHTML = 'Caricamento catalogo...';
    data.loadIndex().then(function (catalog) {
      StreamBox.searchPage.init(catalog);
    }, function (error) {
      if (!status) return;
      status.innerHTML = 'Errore caricamento catalogo: ' + utils.escapeHtml(error && error.message ? error.message : String(error));
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);

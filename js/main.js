(function (global) {
  var StreamBox = global.StreamBox;
  var utils = StreamBox.utils;
  var data = StreamBox.data;

  function boot() {
    var status = utils.byId('homeStatus');
    utils.setLoading(status, true, 'Caricamento catalogo in corso...');
    data.loadIndex().then(function (catalog) {
      utils.setLoading(status, false);
      StreamBox.homePage.init(catalog);
    }, function (error) {
      status.innerHTML = 'Errore caricamento catalogo: ' + utils.escapeHtml(error && error.message ? error.message : String(error));
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);

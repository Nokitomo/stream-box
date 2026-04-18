(function (global) {
  var StreamBox = global.StreamBox;
  var utils = StreamBox.utils;
  var data = StreamBox.data;

  function boot() {
    var status = utils.byId('homeStatus');
    if (status) status.className = 'badge hidden';
    data.loadIndex().then(function (catalog) {
      StreamBox.homePage.init(catalog);
    }, function (error) {
      if (status) {
        status.className = 'badge';
        status.innerHTML = 'Errore caricamento catalogo: ' + utils.escapeHtml(error && error.message ? error.message : String(error));
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);

(function (global) {
  var StreamBox = global.StreamBox;
  var utils = StreamBox.utils;
  var data = StreamBox.data;

  function boot() {
    var status = utils.byId('playerStatus');
    status.innerHTML = 'Caricamento catalogo...';
    data.loadIndex().then(function (catalog) {
      StreamBox.playerPage.init(catalog);
      status.innerHTML = '';
    }, function (error) {
      status.innerHTML = 'Errore caricamento catalogo: ' + utils.escapeHtml(error && error.message ? error.message : String(error));
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);

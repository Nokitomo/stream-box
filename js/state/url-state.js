(function (global) {
  var StreamBox = global.StreamBox = global.StreamBox || {};
  var utils = StreamBox.utils;

  function read() {
    return utils.parseQuery(global.location.search || '');
  }

  function write(params, replace) {
    var query = utils.toQuery(params || {});
    var target = global.location.pathname + query + (global.location.hash || '');
    if (replace) global.history.replaceState(null, '', target);
    else global.history.pushState(null, '', target);
  }

  function bind(onChange) {
    if (typeof onChange !== 'function') return;
    global.addEventListener('popstate', function () {
      onChange(read());
    });
  }

  StreamBox.urlState = {
    read: read,
    write: write,
    bind: bind
  };
})(window);

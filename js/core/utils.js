(function (global) {
  var StreamBox = global.StreamBox = global.StreamBox || {};
  var basePath = detectBasePath();

  function safeText(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function detectBasePath() {
    var pathname = String((global.location && global.location.pathname) || '');
    if (pathname.indexOf('/html/') !== -1 || /\/html$/.test(pathname)) return '../';
    return '';
  }

  function resolvePath(input) {
    var text = safeText(input);
    if (!text) return '';
    if (
      /^(https?:)?\/\//i.test(text) ||
      text.indexOf('data:') === 0 ||
      text.indexOf('mailto:') === 0 ||
      text.indexOf('tel:') === 0 ||
      text.charAt(0) === '#'
    ) {
      return text;
    }
    if (text.charAt(0) === '/') return text;
    return basePath + text.replace(/^\.\//, '');
  }

  function normalizeImageUrl(input) {
    var text = safeText(input);
    if (!text) return '';
    if (text.indexOf('//') === 0) text = 'https:' + text;
    if (!/^https?:\/\//i.test(text)) return text;
    try {
      var parsed = new URL(text);
      var host = String(parsed.hostname || '').toLowerCase();
      if (host.indexOf('animeworld.so') !== -1 || host.indexOf('forbiddenlol.cloud') !== -1) {
        var parts = String(parsed.pathname || '').split('/');
        var filename = safeText(parts[parts.length - 1]);
        if (filename) return 'https://img.animeunity.so/anime/' + filename;
      }
      return proxyMediaUrl(text);
    } catch (_) {
      return proxyMediaUrl(text);
    }
  }

  function shouldProxyMediaUrl(value) {
    var text = safeText(value);
    if (!/^https?:\/\//i.test(text)) return false;
    try {
      var parsed = new URL(text);
      var host = String(parsed.hostname || '').toLowerCase();
      return host.indexOf('streamingunity') !== -1 || host.indexOf('vixcloud') !== -1;
    } catch (_) {
      return false;
    }
  }

  function proxyMediaUrl(value) {
    var text = safeText(value);
    if (!text) return '';
    if (!shouldProxyMediaUrl(text)) return text;
    if (text.indexOf('/api/player/proxy?') !== -1) return text;
    return '/api/player/proxy?url=' + encodeURIComponent(text);
  }

  function isPlaceholderImage(input) {
    var text = safeText(input);
    if (!text) return false;
    return /\/anime\/640x960(?:$|[/?#])/i.test(text);
  }

  function pickImage(candidates) {
    var list = candidates || [];
    for (var i = 0; i < list.length; i += 1) {
      var normalized = normalizeImageUrl(list[i]);
      if (!normalized) continue;
      if (isPlaceholderImage(normalized)) continue;
      return normalized;
    }
    return '';
  }

  function toNumber(value, fallback) {
    var n = Number(value);
    return isFinite(n) ? n : fallback;
  }

  function unique(values) {
    var seen = {};
    var out = [];
    for (var i = 0; i < values.length; i += 1) {
      var key = String(values[i]);
      if (seen[key]) continue;
      seen[key] = true;
      out.push(values[i]);
    }
    return out;
  }

  function parseQuery(search) {
    var query = {};
    var src = String(search || '').replace(/^\?/, '');
    if (!src) return query;
    var pairs = src.split('&');
    for (var i = 0; i < pairs.length; i += 1) {
      if (!pairs[i]) continue;
      var parts = pairs[i].split('=');
      var key = decodeURIComponent(parts[0] || '');
      if (!key) continue;
      var value = decodeURIComponent((parts.slice(1).join('=') || '').replace(/\+/g, ' '));
      query[key] = value;
    }
    return query;
  }

  function toQuery(params) {
    var parts = [];
    for (var key in params) {
      if (!Object.prototype.hasOwnProperty.call(params, key)) continue;
      var value = safeText(params[key]);
      if (!value) continue;
      parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(value));
    }
    return parts.length ? ('?' + parts.join('&')) : '';
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function debounce(fn, delay) {
    var timer = null;
    return function () {
      var ctx = this;
      var args = arguments;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(ctx, args); }, delay || 200);
    };
  }

  function sortByKey(list, key, desc) {
    return list.slice().sort(function (a, b) {
      var va = a && a[key];
      var vb = b && b[key];
      if (typeof va === 'number' && typeof vb === 'number') return desc ? (vb - va) : (va - vb);
      var sa = safeText(va).toLowerCase();
      var sb = safeText(vb).toLowerCase();
      if (sa < sb) return desc ? 1 : -1;
      if (sa > sb) return desc ? -1 : 1;
      return 0;
    });
  }

  StreamBox.utils = {
    safeText: safeText,
    escapeHtml: escapeHtml,
    toNumber: toNumber,
    unique: unique,
    parseQuery: parseQuery,
    toQuery: toQuery,
    byId: byId,
    debounce: debounce,
    sortByKey: sortByKey,
    resolvePath: resolvePath,
    basePath: basePath,
    normalizeImageUrl: normalizeImageUrl,
    isPlaceholderImage: isPlaceholderImage,
    pickImage: pickImage,
    proxyMediaUrl: proxyMediaUrl
  };
})(window);

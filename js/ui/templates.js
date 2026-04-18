(function (global) {
  var StreamBox = global.StreamBox = global.StreamBox || {};
  var utils = StreamBox.utils;

  function poster() {
    var candidates = [];
    for (var i = 0; i < arguments.length; i += 1) candidates.push(arguments[i]);
    var value = utils.pickImage(candidates);
    return value || utils.resolvePath('assets/poster-fallback.svg');
  }

  function backdrop() {
    var candidates = [];
    for (var i = 0; i < arguments.length; i += 1) candidates.push(arguments[i]);
    var value = utils.pickImage(candidates);
    return value || utils.resolvePath('assets/backdrop-fallback.svg');
  }

  function badge(text) {
    return '<span class="badge">' + utils.escapeHtml(text) + '</span>';
  }

  function card(item, opts) {
    var options = opts || {};
    var rank = options.rank ? '<span class="badge">#' + options.rank + '</span>' : '';
    var provider = badge(item.provider || 'catalog');
    var meta = [item.year, item.maturity, item.duration].filter(Boolean).map(badge).join('');
    return '' +
      '<article class="title-card">' +
        '<button type="button" data-tv-focus="1" data-action="open-modal" data-id="' + utils.escapeHtml(item.id) + '">' +
          '<img class="title-thumb" loading="lazy" src="' + utils.escapeHtml(poster(item.poster, item.backdrop)) + '" alt="' + utils.escapeHtml(item.title) + '">' +
          '<div class="title-meta">' +
            '<h3 class="title-name">' + utils.escapeHtml(item.title) + '</h3>' +
            '<div class="title-info">' + rank + provider + meta + '</div>' +
          '</div>' +
        '</button>' +
      '</article>';
  }

  function rowSection(row) {
    var list = row.items || [];
    var cards = '';
    for (var i = 0; i < list.length; i += 1) cards += card(list[i], row.top10 ? { rank: i + 1 } : null);
    return '' +
      '<section class="rail" data-row-id="' + utils.escapeHtml(row.id) + '">' +
        '<div class="rail-head">' +
          '<h2 class="section-title">' + utils.escapeHtml(row.title) + '</h2>' +
          (row.custom ? '<button class="btn btn-sm btn-ghost" data-tv-focus="1" data-action="remove-row" data-row-id="' + utils.escapeHtml(row.id) + '">Rimuovi</button>' : '') +
        '</div>' +
        '<div class="card-grid">' + cards + '</div>' +
      '</section>';
  }

  function options(values, selected, label) {
    var html = '<option value="">' + utils.escapeHtml(label || 'Tutti') + '</option>';
    for (var i = 0; i < values.length; i += 1) {
      var val = String(values[i]);
      var active = String(selected || '') === val ? ' selected' : '';
      html += '<option value="' + utils.escapeHtml(val) + '"' + active + '>' + utils.escapeHtml(val) + '</option>';
    }
    return html;
  }

  function detailFacts(detail) {
    var tags = (detail.tags || []).slice(0, 8).map(badge).join('');
    var genres = (detail.genres || []).slice(0, 8).map(badge).join('');
    var kv = [];
    kv.push('<li><strong>Provider:</strong> ' + utils.escapeHtml(detail.provider || '-') + '</li>');
    kv.push('<li><strong>Tipo:</strong> ' + utils.escapeHtml(detail.type || '-') + '</li>');
    kv.push('<li><strong>Anno:</strong> ' + utils.escapeHtml(detail.year || '-') + '</li>');
    kv.push('<li><strong>Voto:</strong> ' + utils.escapeHtml(detail.score || '-') + '</li>');
    kv.push('<li><strong>Durata:</strong> ' + utils.escapeHtml(detail.duration || '-') + '</li>');
    kv.push('<li><strong>Maturita:</strong> ' + utils.escapeHtml(detail.maturity || '-') + '</li>');
    return '' +
      '<div class="meta-list">' + genres + tags + '</div>' +
      '<ul class="kv-list">' + kv.join('') + '</ul>';
  }

  function relatedCards(related, providerHint) {
    var list = related || [];
    if (!list.length) return '<p>Nessun titolo correlato disponibile.</p>';
    var html = '';
    for (var i = 0; i < list.length && i < 24; i += 1) {
      var item = list[i];
      var targetId = utils.safeText(item.catalogId || '');
      var href = '#';
      if (targetId) {
        href = utils.resolvePath('html/title.html') +
          '?id=' + encodeURIComponent(targetId) +
          '&provider=' + encodeURIComponent(providerHint || '');
      }
      html += '' +
        '<article class="title-card">' +
          '<a href="' + utils.escapeHtml(href) + '">' +
            '<img class="title-thumb" loading="lazy" src="' + utils.escapeHtml(poster(item.image, item.imageFallback)) + '" alt="' + utils.escapeHtml(item.title || '') + '">' +
            '<div class="title-meta"><h3 class="title-name">' + utils.escapeHtml(item.title || '') + '</h3></div>' +
          '</a>' +
        '</article>';
    }
    return '<div class="similar-grid">' + html + '</div>';
  }

  StreamBox.templates = {
    poster: poster,
    backdrop: backdrop,
    card: card,
    rowSection: rowSection,
    options: options,
    detailFacts: detailFacts,
    relatedCards: relatedCards
  };
})(window);

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

  function progressBar(item) {
    var value = Number(item && item.progressPercent);
    if (!isFinite(value) || value <= 0) return '';
    var percent = Math.max(0, Math.min(100, Math.round(value)));
    return '' +
      '<div class="card-progress" aria-hidden="true">' +
        '<div class="card-progress-fill" style="width:' + percent + '%"></div>' +
      '</div>';
  }

  function card(item, opts) {
    var options = opts || {};
    var rank = options.rank ? '<span class="badge">#' + options.rank + '</span>' : '';
    var provider = badge(item.provider || 'catalog');
    var meta = [item.year, item.maturity, item.duration].filter(Boolean).map(badge).join('');
    return '' +
      '<article class="title-card" data-rail-card="1">' +
        '<button class="card-action" type="button" data-tv-focus="1" data-action="open-modal" data-id="' + utils.escapeHtml(item.id) + '">' +
          '<img class="title-thumb" loading="lazy" src="' + utils.escapeHtml(poster(item.poster, item.backdrop)) + '" alt="' + utils.escapeHtml(item.title) + '">' +
          progressBar(item) +
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
        '<div class="rail-body">' +
          '<button type="button" class="rail-nav rail-nav-prev" data-tv-focus="1" data-action="rail-prev" data-row-id="' + utils.escapeHtml(row.id) + '" aria-label="Scorri a sinistra">‹</button>' +
          '<div class="rail-track" data-rail-track="1">' +
            '<div class="rail-strip">' + cards + '</div>' +
          '</div>' +
          '<button type="button" class="rail-nav rail-nav-next" data-tv-focus="1" data-action="rail-next" data-row-id="' + utils.escapeHtml(row.id) + '" aria-label="Scorri a destra">›</button>' +
        '</div>' +
      '</section>';
  }

  function options(values, selected, label) {
    var html = '<option value="">' + utils.escapeHtml(label || 'Tutti') + '</option>';
    for (var i = 0; i < values.length; i += 1) {
      var entry = values[i];
      var val = '';
      var text = '';
      if (entry && typeof entry === 'object') {
        val = String(entry.value == null ? '' : entry.value);
        text = String(entry.label == null ? val : entry.label);
      } else {
        val = String(entry == null ? '' : entry);
        text = val;
      }
      var active = String(selected || '') === val ? ' selected' : '';
      html += '<option value="' + utils.escapeHtml(val) + '"' + active + '>' + utils.escapeHtml(text) + '</option>';
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
    for (var i = 0; i < list.length; i += 1) {
      var item = list[i];
      var targetId = utils.safeText(item.catalogId || '');
      var href = '#';
      if (targetId) {
        href = utils.resolvePath('html/title.html') +
          '?id=' + encodeURIComponent(targetId) +
          '&provider=' + encodeURIComponent(providerHint || '');
      }
      html += '' +
        '<article class="title-card" data-rail-card="1">' +
          '<a data-tv-focus="1" class="card-action" href="' + utils.escapeHtml(href) + '">' +
            '<img class="title-thumb" loading="lazy" src="' + utils.escapeHtml(poster(item.image, item.imageFallback)) + '" alt="' + utils.escapeHtml(item.title || '') + '">' +
            '<div class="title-meta"><h3 class="title-name">' + utils.escapeHtml(item.title || '') + '</h3></div>' +
          '</a>' +
        '</article>';
    }
    return '' +
      '<div class="rail rail-inline" data-row-id="related">' +
        '<div class="rail-body">' +
          '<button type="button" class="rail-nav rail-nav-prev" data-tv-focus="1" data-action="rail-prev" data-row-id="related" aria-label="Scorri correlati a sinistra">‹</button>' +
          '<div class="rail-track" data-rail-track="1">' +
            '<div class="rail-strip">' + html + '</div>' +
          '</div>' +
          '<button type="button" class="rail-nav rail-nav-next" data-tv-focus="1" data-action="rail-next" data-row-id="related" aria-label="Scorri correlati a destra">›</button>' +
        '</div>' +
      '</div>';
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

(function (global) {
  var StreamBox = global.StreamBox = global.StreamBox || {};
  var utils = StreamBox.utils;
  var MIN_CARDS_FOR_INFINITE_LOOP = 7;

  function normalizeArrowDirection(key, code) {
    if (key === 'ArrowRight' || key === 'Right') return 'ArrowRight';
    if (key === 'ArrowLeft' || key === 'Left') return 'ArrowLeft';
    if (key === 'ArrowUp' || key === 'Up') return 'ArrowUp';
    if (key === 'ArrowDown' || key === 'Down') return 'ArrowDown';
    if (code === 37) return 'ArrowLeft';
    if (code === 38) return 'ArrowUp';
    if (code === 39) return 'ArrowRight';
    if (code === 40) return 'ArrowDown';
    return '';
  }

  function isTypingElement(node) {
    if (!node || !node.tagName) return false;
    var tag = String(node.tagName).toLowerCase();
    return tag === 'input' || tag === 'select' || tag === 'textarea';
  }

  function getFocusable(root) {
    var scope = root || document;
    var nodes = scope.querySelectorAll('[data-tv-focus="1"]');
    var out = [];
    for (var i = 0; i < nodes.length; i += 1) {
      if (nodes[i].offsetParent !== null) out.push(nodes[i]);
    }
    return out;
  }

  function moveSpatial(current, focusables, verticalDirection) {
    var base = current.getBoundingClientRect();
    var baseX = base.left + base.width / 2;
    var chosen = null;
    var best = Infinity;
    for (var i = 0; i < focusables.length; i += 1) {
      var node = focusables[i];
      if (node === current) continue;
      var box = node.getBoundingClientRect();
      var nodeY = box.top + box.height / 2;
      var baseY = base.top + base.height / 2;
      var deltaY = nodeY - baseY;
      if (verticalDirection > 0 && deltaY <= 2) continue;
      if (verticalDirection < 0 && deltaY >= -2) continue;
      var nodeX = box.left + box.width / 2;
      var score = Math.abs(deltaY) * 10 + Math.abs(nodeX - baseX);
      if (score < best) {
        best = score;
        chosen = node;
      }
    }
    return chosen;
  }

  function moveByDirection(current, focusables, direction) {
    if (direction === 'ArrowRight' || direction === 'ArrowLeft') {
      var idx = focusables.indexOf(current);
      if (idx < 0) return focusables[0];
      var step = direction === 'ArrowRight' ? 1 : -1;
      var nextIndex = idx + step;
      if (nextIndex >= focusables.length) nextIndex = 0;
      if (nextIndex < 0) nextIndex = focusables.length - 1;
      return focusables[nextIndex];
    }
    return moveSpatial(current, focusables, direction === 'ArrowDown' ? 1 : -1);
  }

  function getRailTrack(node) {
    if (!node || !node.closest) return null;
    var rail = node.closest('.rail');
    if (!rail) return null;
    return rail.querySelector('[data-rail-track="1"]');
  }

  function getRailFocusables(rail) {
    if (!rail) return [];
    var nodes = rail.querySelectorAll(
      '.rail-nav[data-tv-focus="1"], .rail-strip .title-card:not([data-clone="1"]) [data-tv-focus="1"]'
    );
    var out = [];
    for (var i = 0; i < nodes.length; i += 1) {
      if (nodes[i].offsetParent !== null) out.push(nodes[i]);
    }
    return out;
  }

  function moveWithinRail(current, direction) {
    if (direction !== 'ArrowLeft' && direction !== 'ArrowRight') return null;
    if (!current || !current.closest) return null;
    var rail = current.closest('.rail');
    if (!rail) return null;
    var rowFocusables = getRailFocusables(rail);
    if (!rowFocusables.length) return null;
    var idx = rowFocusables.indexOf(current);
    if (idx < 0) return null;
    var step = direction === 'ArrowRight' ? 1 : -1;
    var nextIndex = idx + step;
    if (nextIndex >= rowFocusables.length) nextIndex = 0;
    if (nextIndex < 0) nextIndex = rowFocusables.length - 1;
    return rowFocusables[nextIndex];
  }

  function keepFocusedCardVisible(node) {
    var track = getRailTrack(node);
    if (!track || !track.contains(node)) return;
    if (node.scrollIntoView) {
      node.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
    }
  }

  function scrollRailByButton(button) {
    if (!button || !button.closest) return;
    var rail = button.closest('.rail');
    if (!rail) return;
    var track = rail.querySelector('[data-rail-track="1"]');
    if (!track) return;
    var direction = button.getAttribute('data-action') === 'rail-prev' ? -1 : 1;
    var item = track.querySelector('.rail-strip .title-card:not([data-clone="1"])');
    var strip = track.querySelector('.rail-strip');
    var width = item ? item.getBoundingClientRect().width : 220;
    var gap = 12;
    if (strip && global.getComputedStyle) {
      var style = global.getComputedStyle(strip);
      var gapValue = style ? (style.columnGap || style.gap) : '';
      var parsedGap = Number(String(gapValue || '').replace('px', ''));
      if (isFinite(parsedGap)) gap = parsedGap;
    }
    var amount = Math.max(40, width + gap);
    if (track.scrollBy) {
      try {
        track.scrollBy({ left: amount * direction, behavior: 'smooth' });
        return;
      } catch (_) {
        try {
          track.scrollBy(amount * direction, 0);
          return;
        } catch (__ignored) {}
      }
    }
    track.scrollLeft += amount * direction;
  }

  function removeTvFocusOnClone(node) {
    if (!node) return;
    node.setAttribute('data-clone', '1');
    node.setAttribute('aria-hidden', 'true');
    var focusables = node.querySelectorAll('[data-tv-focus="1"]');
    for (var i = 0; i < focusables.length; i += 1) {
      focusables[i].setAttribute('tabindex', '-1');
      focusables[i].removeAttribute('data-tv-focus');
    }
  }

  function syncLoopPosition(track) {
    var start = utils.toNumber(track.getAttribute('data-loop-start'), 0);
    var end = utils.toNumber(track.getAttribute('data-loop-end'), 0);
    var span = utils.toNumber(track.getAttribute('data-loop-span'), 0);
    if (!start || !end || !span) return;
    if (track.scrollLeft <= start - 2) {
      track.scrollLeft += span;
      return;
    }
    if (track.scrollLeft >= end - 2) {
      track.scrollLeft -= span;
    }
  }

  function computeTrackMetrics(track, keepOffset) {
    if (!track) return;
    var strip = track.querySelector('.rail-strip');
    if (!strip) return;
    var cloneCount = utils.toNumber(track.getAttribute('data-clone-count'), 0);
    var realCount = utils.toNumber(track.getAttribute('data-real-count'), 0);
    if (!cloneCount || !realCount) return;
    var children = strip.children;
    var firstReal = children[cloneCount];
    var firstAfterReal = children[cloneCount + realCount];
    if (!firstReal || !firstAfterReal) return;
    var loopStart = firstReal.offsetLeft;
    var loopEnd = firstAfterReal.offsetLeft;
    var loopSpan = loopEnd - loopStart;
    var hadLoopStart = track.getAttribute('data-loop-start') !== null;
    var previousLoopStart = hadLoopStart ? utils.toNumber(track.getAttribute('data-loop-start'), loopStart) : loopStart;
    var currentOffset = (keepOffset && hadLoopStart) ? (track.scrollLeft - previousLoopStart) : 0;
    track.setAttribute('data-loop-start', String(loopStart));
    track.setAttribute('data-loop-end', String(loopEnd));
    track.setAttribute('data-loop-span', String(loopSpan));
    track.scrollLeft = loopStart + currentOffset;
    syncLoopPosition(track);
  }

  function initInfiniteTrack(track) {
    if (!track || track.getAttribute('data-loop-ready') === '1') return;
    var strip = track.querySelector('.rail-strip');
    if (!strip) return;
    var cards = strip.querySelectorAll('.title-card');
    if (cards.length < 2) return;
    // Avoid visible duplicated cards on sparse rows (e.g. 2-6 items).
    if (cards.length < MIN_CARDS_FOR_INFINITE_LOOP) return;
    if (track.clientWidth && strip.scrollWidth <= (track.clientWidth + 20)) return;
    var cloneCount = Math.min(cards.length, 8);
    var before = document.createDocumentFragment();
    var after = document.createDocumentFragment();
    for (var i = cards.length - cloneCount; i < cards.length; i += 1) {
      var prependClone = cards[i].cloneNode(true);
      removeTvFocusOnClone(prependClone);
      before.appendChild(prependClone);
    }
    for (var j = 0; j < cloneCount; j += 1) {
      var appendClone = cards[j].cloneNode(true);
      removeTvFocusOnClone(appendClone);
      after.appendChild(appendClone);
    }
    strip.insertBefore(before, strip.firstChild);
    strip.appendChild(after);
    track.setAttribute('data-clone-count', String(cloneCount));
    track.setAttribute('data-real-count', String(cards.length));
    track.setAttribute('data-loop-ready', '1');
    track.addEventListener('scroll', function () {
      syncLoopPosition(track);
    }, { passive: true });
    computeTrackMetrics(track, false);
  }

  function refreshRails(root, keepOffset) {
    var scope = root || document;
    var tracks = scope.querySelectorAll ? scope.querySelectorAll('[data-rail-track="1"]') : [];
    for (var i = 0; i < tracks.length; i += 1) {
      initInfiniteTrack(tracks[i]);
      computeTrackMetrics(tracks[i], keepOffset !== false);
    }
  }

  function bindRailControls(container) {
    if (!container || container.getAttribute('data-tv-rails-bound') === '1') return;
    container.setAttribute('data-tv-rails-bound', '1');
    container.addEventListener('click', function (event) {
      var nav = event.target.closest('[data-action="rail-prev"], [data-action="rail-next"]');
      if (!nav) return;
      scrollRailByButton(nav);
    });
    container.addEventListener('focusin', function (event) {
      keepFocusedCardVisible(event.target);
    });
    if (!global.__streamBoxTvNavResizeBound) {
      global.__streamBoxTvNavResizeBound = true;
      global.addEventListener('resize', utils.debounce(function () {
        refreshRails(document, true);
      }, 140));
    }
  }

  function bindKeyboard(options) {
    var opts = options || {};
    var key = opts.bindKey || 'default';
    var marker = '__streamBoxTvKeyboardBound_' + key;
    if (document[marker]) return;
    document[marker] = true;
    document.addEventListener('keydown', function (event) {
      var direction = normalizeArrowDirection(event.key || '', event.keyCode);
      if (!direction) return;
      if (opts.ignoreTyping && isTypingElement(document.activeElement)) return;
      var focusables = typeof opts.getFocusable === 'function' ? opts.getFocusable() : getFocusable(document);
      if (!focusables.length) return;
      var current = document.activeElement;
      if (!current || !current.getAttribute || current.getAttribute('data-tv-focus') !== '1') {
        focusables[0].focus();
        event.preventDefault();
        return;
      }
      var railNext = moveWithinRail(current, direction);
      if (railNext) {
        railNext.focus();
        keepFocusedCardVisible(railNext);
        event.preventDefault();
        return;
      }
      var next = moveByDirection(current, focusables, direction);
      if (!next) return;
      next.focus();
      keepFocusedCardVisible(next);
      event.preventDefault();
    });
  }

  StreamBox.tvNav = {
    normalizeArrowDirection: normalizeArrowDirection,
    getFocusable: getFocusable,
    bindKeyboard: bindKeyboard,
    bindRailControls: bindRailControls,
    moveByDirection: moveByDirection,
    moveWithinRail: moveWithinRail,
    refreshRails: refreshRails,
    keepFocusedCardVisible: keepFocusedCardVisible,
    scrollRailByButton: scrollRailByButton
  };
})(window);

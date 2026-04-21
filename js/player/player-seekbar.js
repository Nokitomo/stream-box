(function (global) {
  var StreamBox = global.StreamBox = global.StreamBox || {};

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function getClientX(event) {
    var src = event || {};
    if (src.touches && src.touches[0]) return Number(src.touches[0].clientX) || 0;
    if (src.changedTouches && src.changedTouches[0]) return Number(src.changedTouches[0].clientX) || 0;
    return Number(src.clientX) || 0;
  }

  function addClass(node, className) {
    if (!node || !className) return;
    if (node.classList && node.classList.add) {
      node.classList.add(className);
      return;
    }
    var source = String(node.className || '');
    if (source.indexOf(className) !== -1) return;
    node.className = (source ? (source + ' ') : '') + className;
  }

  function removeClass(node, className) {
    if (!node || !className) return;
    if (node.classList && node.classList.remove) {
      node.classList.remove(className);
      return;
    }
    var source = String(node.className || '');
    if (!source) return;
    var next = source.replace(new RegExp('(^|\\s)' + className + '(?=\\s|$)', 'g'), ' ').replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
    node.className = next;
  }

  function create(opts) {
    var options = opts || {};
    var refs = options.refs || {};
    var engine = options.engine;
    var ui = options.ui;
    var isLocked = typeof options.isLocked === 'function' ? options.isLocked : function () { return false; };
    var track = refs.progressTrack;
    if (!track || !engine || !ui) return { destroy: function () {} };

    var dragging = false;

    function canSeek() {
      if (isLocked()) return false;
      var duration = Number(engine.getDuration()) || 0;
      return duration > 0;
    }

    function seekFromClientX(clientX) {
      if (!canSeek()) return;
      var rect = track.getBoundingClientRect ? track.getBoundingClientRect() : null;
      if (!rect || !rect.width) return;
      var ratio = clamp((Number(clientX) - rect.left) / rect.width, 0, 1);
      var duration = Number(engine.getDuration()) || 0;
      var target = ratio * duration;
      engine.seekTo(target);
      ui.setProgress(refs, target, duration);
    }

    function onPointerDown(event) {
      if (event && typeof event.button === 'number' && event.button !== 0) return;
      dragging = true;
      addClass(track, 'is-dragging');
      seekFromClientX(getClientX(event));
      if (event && event.preventDefault) event.preventDefault();
    }

    function onPointerMove(event) {
      if (!dragging) return;
      seekFromClientX(getClientX(event));
      if (event && event.preventDefault) event.preventDefault();
    }

    function onPointerUp(event) {
      if (!dragging) return;
      dragging = false;
      removeClass(track, 'is-dragging');
      seekFromClientX(getClientX(event));
      if (event && event.preventDefault) event.preventDefault();
    }

    function onTrackClick(event) {
      if (dragging) return;
      seekFromClientX(getClientX(event));
    }

    function onTrackKeydown(event) {
      var code = Number(event && (event.keyCode || event.which)) || 0;
      if (isLocked()) return;
      if (code === 37) {
        engine.seekBy(-10);
      } else if (code === 39) {
        engine.seekBy(10);
      } else if (code === 36) {
        engine.seekTo(0);
      } else if (code === 35) {
        var duration = Number(engine.getDuration()) || 0;
        if (duration > 0) engine.seekTo(duration);
      } else {
        return;
      }
      ui.setProgress(refs, engine.getCurrentTime(), engine.getDuration());
      if (event && event.preventDefault) event.preventDefault();
    }

    track.addEventListener('mousedown', onPointerDown);
    track.addEventListener('touchstart', onPointerDown, false);
    track.addEventListener('click', onTrackClick);
    track.addEventListener('keydown', onTrackKeydown);
    global.document.addEventListener('mousemove', onPointerMove);
    global.document.addEventListener('mouseup', onPointerUp);
    global.document.addEventListener('touchmove', onPointerMove, false);
    global.document.addEventListener('touchend', onPointerUp, false);

    return {
      destroy: function () {
        track.removeEventListener('mousedown', onPointerDown);
        track.removeEventListener('touchstart', onPointerDown, false);
        track.removeEventListener('click', onTrackClick);
        track.removeEventListener('keydown', onTrackKeydown);
        global.document.removeEventListener('mousemove', onPointerMove);
        global.document.removeEventListener('mouseup', onPointerUp);
        global.document.removeEventListener('touchmove', onPointerMove, false);
        global.document.removeEventListener('touchend', onPointerUp, false);
      }
    };
  }

  StreamBox.playerSeekbar = {
    create: create
  };
})(window);

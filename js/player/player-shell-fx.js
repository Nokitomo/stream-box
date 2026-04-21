(function (global) {
  var StreamBox = global.StreamBox = global.StreamBox || {};

  function addClass(node, className) {
    if (!node || !className) return;
    if (node.classList && node.classList.add) { node.classList.add(className); return; }
    var source = String(node.className || '');
    if (source.indexOf(className) !== -1) return;
    node.className = (source ? source + ' ' : '') + className;
  }

  function removeClass(node, className) {
    if (!node || !className) return;
    if (node.classList && node.classList.remove) { node.classList.remove(className); return; }
    var source = String(node.className || '');
    if (!source) return;
    node.className = source.replace(new RegExp('(^|\\s)' + className + '(?=\\s|$)', 'g'), ' ').replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
  }

  function isFullscreenActive() {
    var doc = global.document;
    return !!(doc.fullscreenElement || doc.webkitFullscreenElement || doc.msFullscreenElement || doc.mozFullScreenElement);
  }
  function fullscreenElement() {
    var doc = global.document;
    return doc.fullscreenElement || doc.webkitFullscreenElement || doc.msFullscreenElement || doc.mozFullScreenElement || null;
  }

  function create(options) {
    var opts = options || {};
    var refs = opts.refs || {};
    var state = opts.state || {};
    var ui = opts.ui;
    var engine = opts.engine;
    var onToggleFullscreen = typeof opts.onToggleFullscreen === 'function' ? opts.onToggleFullscreen : function () {};
    var hideTimer = null;
    var tapTimer = null;
    function isPlayerFullscreen() {
      var wrap = refs.videoWrap;
      var fs = fullscreenElement();
      if (!wrap || !fs) return false;
      if (fs === wrap) return true;
      if (wrap.contains && wrap.contains(fs)) return true;
      return false;
    }
    function syncFullscreenClasses() {
      var wrap = refs.videoWrap;
      var root = global.document && global.document.documentElement;
      var active = isPlayerFullscreen();
      if (wrap) {
        if (active) addClass(wrap, 'player-fullscreen-active');
        else removeClass(wrap, 'player-fullscreen-active');
      }
      if (root) {
        if (active) addClass(root, 'player-page-fullscreen-active');
        else removeClass(root, 'player-page-fullscreen-active');
      }
    }

    function setChromeHidden(hidden) {
      if (!refs.videoWrap) return;
      if (hidden) {
        addClass(refs.videoWrap, 'player-chrome-hidden');
        if (ui && ui.setMenuOpen) ui.setMenuOpen(refs, false);
      } else {
        removeClass(refs.videoWrap, 'player-chrome-hidden');
      }
    }

    function clearHideTimer() {
      if (!hideTimer) return;
      global.clearTimeout(hideTimer);
      hideTimer = null;
    }

    function scheduleHide() {
      clearHideTimer();
      syncFullscreenClasses();
      if (!isPlayerFullscreen()) return setChromeHidden(false);
      if (!refs.video || state.locked) return setChromeHidden(false);
      hideTimer = global.setTimeout(function () { setChromeHidden(true); }, 2400);
    }

    function clearTapTimer() {
      if (!tapTimer) return;
      global.clearTimeout(tapTimer);
      tapTimer = null;
    }

    function onActivity() {
      setChromeHidden(false);
      scheduleHide();
    }

    function onVideoClick() {
      if (state.locked) return;
      onActivity();
      clearTapTimer();
      tapTimer = global.setTimeout(function () {
        tapTimer = null;
        if (!engine) return;
        engine.togglePlayPause();
        if (ui && ui.setPlayState) ui.setPlayState(refs, engine.isPaused());
        scheduleHide();
      }, 210);
    }

    function onVideoDblClick(event) {
      if (state.locked) return;
      clearTapTimer();
      if (event && event.preventDefault) event.preventDefault();
      onToggleFullscreen();
      global.setTimeout(onActivity, 50);
    }

    function onPause() { setChromeHidden(false); clearHideTimer(); }
    function onPlay() { onActivity(); }

    if (refs.video) {
      refs.video.addEventListener('click', onVideoClick);
      refs.video.addEventListener('dblclick', onVideoDblClick);
      refs.video.addEventListener('pause', onPause);
      refs.video.addEventListener('play', onPlay);
    }
    if (refs.videoWrap) {
      refs.videoWrap.addEventListener('mousemove', onActivity);
      refs.videoWrap.addEventListener('touchstart', onActivity, false);
      refs.videoWrap.addEventListener('keydown', onActivity);
      refs.videoWrap.addEventListener('click', onActivity);
    }
    global.document.addEventListener('fullscreenchange', onActivity);
    global.document.addEventListener('webkitfullscreenchange', onActivity);
    global.document.addEventListener('MSFullscreenChange', onActivity);
    global.document.addEventListener('mozfullscreenchange', onActivity);
    syncFullscreenClasses();
    scheduleHide();

    return {
      destroy: function () {
        clearHideTimer();
        clearTapTimer();
        if (refs.video) {
          refs.video.removeEventListener('click', onVideoClick);
          refs.video.removeEventListener('dblclick', onVideoDblClick);
          refs.video.removeEventListener('pause', onPause);
          refs.video.removeEventListener('play', onPlay);
        }
        if (refs.videoWrap) {
          refs.videoWrap.removeEventListener('mousemove', onActivity);
          refs.videoWrap.removeEventListener('touchstart', onActivity, false);
          refs.videoWrap.removeEventListener('keydown', onActivity);
          refs.videoWrap.removeEventListener('click', onActivity);
          removeClass(refs.videoWrap, 'player-chrome-hidden');
          removeClass(refs.videoWrap, 'player-fullscreen-active');
        }
        var root = global.document && global.document.documentElement;
        if (root) removeClass(root, 'player-page-fullscreen-active');
        global.document.removeEventListener('fullscreenchange', onActivity);
        global.document.removeEventListener('webkitfullscreenchange', onActivity);
        global.document.removeEventListener('MSFullscreenChange', onActivity);
        global.document.removeEventListener('mozfullscreenchange', onActivity);
      }
    };
  }

  StreamBox.playerShellFx = {
    create: create
  };
})(window);

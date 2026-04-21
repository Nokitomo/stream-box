(function (global) {
  var StreamBox = global.StreamBox = global.StreamBox || {};
  var utils = StreamBox.utils;

  function toText(value) {
    return utils.safeText(value || '');
  }

  function detectType(stream) {
    var declared = toText(stream && stream.type).toLowerCase();
    var url = toText(stream && stream.url).split('?')[0].split('#')[0].toLowerCase();
    if (declared === 'hls' || declared === 'm3u8' || /\.m3u8$/.test(url)) return 'hls';
    if (declared === 'dash' || declared === 'mpd' || /\.mpd$/.test(url)) return 'dash';
    if (declared === 'mp4' || /\.mp4$/.test(url)) return 'mp4';
    return 'auto';
  }

  function isForbiddenHeader(name) {
    var key = toText(name).toLowerCase();
    if (!key) return true;
    if (key === 'accept-charset' || key === 'accept-encoding' || key === 'access-control-request-headers' || key === 'access-control-request-method' || key === 'connection' || key === 'content-length' || key === 'cookie' || key === 'cookie2' || key === 'date' || key === 'dnt' || key === 'expect' || key === 'host' || key === 'keep-alive' || key === 'origin' || key === 'referer' || key === 'te' || key === 'trailer' || key === 'transfer-encoding' || key === 'upgrade' || key === 'via' || key === 'user-agent') {
      return true;
    }
    if (key.indexOf('proxy-') === 0 || key.indexOf('sec-') === 0) return true;
    return false;
  }

  function create(videoEl) {
    var video = videoEl;
    var mode = 'none';
    var hls = null;
    var dash = null;
    var callbacks = {};
    var trackElements = [];
    var selectedSubtitleIndex = -1;
    var videoHandlers = [];
    var hlsHandlers = [];
    var dashHandlers = [];
    var currentStream = null;

    function destroyHls() {
      if (!hls) return;
      try {
        for (var i = 0; i < hlsHandlers.length; i += 1) hls.off(hlsHandlers[i].event, hlsHandlers[i].fn);
        hlsHandlers = [];
        hls.destroy();
      } catch (_) {}
      hls = null;
    }

    function destroyDash() {
      if (!dash) return;
      try {
        for (var i = 0; i < dashHandlers.length; i += 1) dash.off(dashHandlers[i].event, dashHandlers[i].fn);
        dashHandlers = [];
        dash.reset();
      } catch (_) {}
      dash = null;
    }

    function clearVideoListeners() {
      for (var i = 0; i < videoHandlers.length; i += 1) {
        try {
          video.removeEventListener(videoHandlers[i].event, videoHandlers[i].fn);
        } catch (_) {}
      }
      videoHandlers = [];
    }

    function bindVideoEvent(event, fn) {
      video.addEventListener(event, fn);
      videoHandlers.push({ event: event, fn: fn });
    }

    function emitError(payload) {
      if (callbacks.onError) callbacks.onError(payload || {});
    }

    function emitProgress() {
      if (!callbacks.onProgress) return;
      callbacks.onProgress({
        currentTime: Number(video.currentTime) || 0,
        duration: Number(video.duration) || 0
      });
    }

    function emitTracksChanged() {
      if (!callbacks.onTracksChanged) return;
      callbacks.onTracksChanged({
        audioTracks: listAudioTracks(),
        qualityOptions: listQualityOptions()
      });
    }

    function clearSubtitleTracks() {
      for (var i = 0; i < trackElements.length; i += 1) {
        try {
          video.removeChild(trackElements[i]);
        } catch (_) {}
      }
      trackElements = [];
      selectedSubtitleIndex = -1;
    }

    function bindBaseVideoEvents() {
      clearVideoListeners();

      bindVideoEvent('loadedmetadata', function () {
        var startTime = Number(callbacks.startTime) || 0;
        if (startTime > 0 && startTime < (video.duration || Number.MAX_SAFE_INTEGER)) {
          try { video.currentTime = startTime; } catch (_) {}
        }
        if (callbacks.playbackRate && isFinite(callbacks.playbackRate)) video.playbackRate = callbacks.playbackRate;
        if (callbacks.onReady) callbacks.onReady();
        emitTracksChanged();
      });

      bindVideoEvent('timeupdate', emitProgress);
      bindVideoEvent('ended', function () {
        if (callbacks.onEnded) callbacks.onEnded();
      });
      bindVideoEvent('error', function () {
        var code = video && video.error ? Number(video.error.code) : 0;
        emitError({
          status: 0,
          message: 'Video error code ' + code,
          fatal: true
        });
      });
    }

    function applyNativeSource(url) {
      mode = 'native';
      try {
        video.src = url;
        video.load();
      } catch (error) {
        emitError({ message: 'Cannot load source: ' + String(error && error.message || error), fatal: true });
      }
    }

    function supportsNativeHls() {
      return !!(video && video.canPlayType && (video.canPlayType('application/vnd.apple.mpegurl') || video.canPlayType('application/x-mpegURL')));
    }

    function supportsNativeDash() {
      return !!(video && video.canPlayType && video.canPlayType('application/dash+xml'));
    }

    function bindHlsEvent(event, fn) {
      hls.on(event, fn);
      hlsHandlers.push({ event: event, fn: fn });
    }

    function bindDashEvent(event, fn) {
      dash.on(event, fn);
      dashHandlers.push({ event: event, fn: fn });
    }

    function applyHlsSource(stream) {
      if (!global.Hls || !global.Hls.isSupported()) {
        emitError({ message: 'HLS not supported in this browser', fatal: true });
        return;
      }
      var headers = stream && stream.headers && typeof stream.headers === 'object' ? stream.headers : {};
      mode = 'hls';
      hls = new global.Hls({
        xhrSetup: function (xhr) {
          for (var key in headers) {
            if (!Object.prototype.hasOwnProperty.call(headers, key)) continue;
            var normKey = toText(key);
            var normValue = toText(headers[key]);
            if (!normKey || !normValue) continue;
            if (isForbiddenHeader(normKey)) continue;
            try {
              xhr.setRequestHeader(normKey, normValue);
            } catch (_) {}
          }
        }
      });

      bindHlsEvent(global.Hls.Events.MANIFEST_PARSED, function () {
        if (callbacks.onReady) callbacks.onReady();
        emitTracksChanged();
      });
      bindHlsEvent(global.Hls.Events.LEVEL_SWITCHED, emitTracksChanged);
      bindHlsEvent(global.Hls.Events.AUDIO_TRACK_SWITCHED, emitTracksChanged);
      bindHlsEvent(global.Hls.Events.ERROR, function (_, data) {
        var status = data && data.response ? Number(data.response.code) || 0 : 0;
        emitError({
          status: status,
          message: toText(data && data.details) || 'HLS error',
          fatal: !!(data && data.fatal)
        });
      });

      hls.loadSource(stream.url);
      hls.attachMedia(video);
    }

    function applyDashSource(stream) {
      if (!global.dashjs || !global.dashjs.MediaPlayer) {
        emitError({ message: 'DASH not supported in this browser', fatal: true });
        return;
      }
      mode = 'dash';
      dash = global.dashjs.MediaPlayer().create();
      dash.initialize(video, stream.url, false);
      if (callbacks.playbackRate && isFinite(callbacks.playbackRate)) video.playbackRate = callbacks.playbackRate;

      var events = global.dashjs.MediaPlayer.events || {};
      if (events.STREAM_INITIALIZED) {
        bindDashEvent(events.STREAM_INITIALIZED, function () {
          if (callbacks.onReady) callbacks.onReady();
          emitTracksChanged();
        });
      }
      if (events.QUALITY_CHANGE_RENDERED) bindDashEvent(events.QUALITY_CHANGE_RENDERED, emitTracksChanged);
      if (events.ERROR) {
        bindDashEvent(events.ERROR, function (event) {
          var message = toText(event && event.error && (event.error.message || event.error.code));
          var statusMatch = message.match(/\b(403|503)\b/);
          emitError({
            status: statusMatch ? Number(statusMatch[1]) : 0,
            message: message || 'DASH error',
            fatal: true
          });
        });
      }
    }

    function setSource(stream, opts) {
      callbacks = opts || {};
      currentStream = stream || null;
      destroyHls();
      destroyDash();
      clearSubtitleTracks();
      bindBaseVideoEvents();

      var url = toText(stream && stream.url);
      if (!url) {
        emitError({ message: 'Empty stream URL', fatal: true });
        return;
      }

      var type = detectType(stream);
      if (type === 'hls') {
        if (global.Hls && global.Hls.isSupported && global.Hls.isSupported()) applyHlsSource(stream);
        else if (supportsNativeHls()) applyNativeSource(url);
        else emitError({ message: 'HLS non supportato (hls.js non disponibile e player nativo assente)', fatal: true });
      } else if (type === 'dash') {
        if (supportsNativeDash()) applyNativeSource(url);
        else applyDashSource(stream);
      } else {
        applyNativeSource(url);
      }
    }

    function listAudioTracks() {
      if (mode === 'hls' && hls && Array.isArray(hls.audioTracks)) {
        var hlsTracks = [];
        for (var i = 0; i < hls.audioTracks.length; i += 1) {
          var item = hls.audioTracks[i] || {};
          hlsTracks.push({
            index: i,
            label: toText(item.name || item.lang || ('Track ' + (i + 1))),
            language: toText(item.lang || 'und'),
            selected: Number(hls.audioTrack) === i
          });
        }
        return hlsTracks;
      }
      return [];
    }

    function selectAudioTrack(index) {
      if (mode === 'hls' && hls && hls.audioTracks && hls.audioTracks.length) {
        hls.audioTrack = Number(index) || 0;
      }
      emitTracksChanged();
    }

    function listQualityOptions() {
      if (mode === 'hls' && hls && Array.isArray(hls.levels) && hls.levels.length) {
        var out = [{ index: -1, auto: true, selected: hls.autoLevelEnabled, label: 'Auto' }];
        for (var i = 0; i < hls.levels.length; i += 1) {
          var level = hls.levels[i] || {};
          out.push({
            index: i,
            auto: false,
            height: Number(level.height) || 0,
            bitrate: Number(level.bitrate) || 0,
            selected: !hls.autoLevelEnabled && Number(hls.currentLevel) === i
          });
        }
        return out;
      }
      if (mode === 'dash' && dash && dash.getBitrateInfoListFor) {
        var infos = dash.getBitrateInfoListFor('video') || [];
        var settings = dash.getSettings ? dash.getSettings() : {};
        var isAuto = !!(settings && settings.streaming && settings.streaming.abr && settings.streaming.abr.autoSwitchBitrate && settings.streaming.abr.autoSwitchBitrate.video);
        var current = dash.getQualityFor ? dash.getQualityFor('video') : -1;
        var dashOut = [{ index: -1, auto: true, selected: isAuto, label: 'Auto' }];
        for (var d = 0; d < infos.length; d += 1) {
          dashOut.push({
            index: d,
            auto: false,
            height: Number(infos[d].height) || 0,
            bitrate: Number(infos[d].bitrate) || 0,
            selected: !isAuto && current === d
          });
        }
        return dashOut;
      }
      return [{ index: -1, auto: true, selected: true, label: 'Auto' }];
    }

    function selectQuality(option) {
      if (mode === 'hls' && hls) {
        if (option && option.auto) hls.currentLevel = -1;
        else hls.currentLevel = Number(option && option.index) || 0;
      } else if (mode === 'dash' && dash && dash.updateSettings) {
        var auto = option && option.auto;
        dash.updateSettings({ streaming: { abr: { autoSwitchBitrate: { video: !!auto } } } });
        if (!auto && dash.setQualityFor) dash.setQualityFor('video', Number(option.index) || 0);
      }
      emitTracksChanged();
    }

    function setSubtitleTracks(tracks, selectedIndex) {
      clearSubtitleTracks();
      var source = Array.isArray(tracks) ? tracks : [];
      for (var i = 0; i < source.length; i += 1) {
        var item = source[i] || {};
        var src = toText(item.url);
        if (!src) continue;
        var trackEl = document.createElement('track');
        trackEl.kind = 'subtitles';
        trackEl.label = toText(item.label) || ('Subtitle ' + (i + 1));
        trackEl.srclang = toText(item.language) || 'und';
        trackEl.src = src;
        video.appendChild(trackEl);
        trackElements.push(trackEl);
      }
      global.setTimeout(function () {
        selectSubtitle(typeof selectedIndex === 'number' ? selectedIndex : -1);
      }, 50);
    }

    function selectSubtitle(index) {
      selectedSubtitleIndex = Number(index);
      var textTracks = video.textTracks || [];
      var i;
      for (i = 0; i < textTracks.length; i += 1) textTracks[i].mode = 'disabled';
      if (selectedSubtitleIndex >= 0 && textTracks[selectedSubtitleIndex]) textTracks[selectedSubtitleIndex].mode = 'showing';
    }

    function destroy() {
      destroyHls();
      destroyDash();
      clearVideoListeners();
      clearSubtitleTracks();
      try {
        video.pause();
        video.removeAttribute('src');
        video.load();
      } catch (_) {}
    }

    return {
      setSource: setSource,
      destroy: destroy,
      play: function () { return video.play(); },
      pause: function () { video.pause(); },
      togglePlayPause: function () { if (video.paused) video.play(); else video.pause(); },
      seekBy: function (offset) { video.currentTime = Math.max(0, (Number(video.currentTime) || 0) + (Number(offset) || 0)); },
      seekTo: function (value) { video.currentTime = Math.max(0, Number(value) || 0); },
      setPlaybackRate: function (rate) { video.playbackRate = Number(rate) || 1; },
      getPlaybackRate: function () { return Number(video.playbackRate) || 1; },
      getCurrentTime: function () { return Number(video.currentTime) || 0; },
      getDuration: function () { return Number(video.duration) || 0; },
      setSubtitleTracks: setSubtitleTracks,
      selectSubtitle: selectSubtitle,
      listAudioTracks: listAudioTracks,
      selectAudioTrack: selectAudioTrack,
      listQualityOptions: listQualityOptions,
      selectQuality: selectQuality,
      canPictureInPicture: function () { return !!(video && video.requestPictureInPicture && document.pictureInPictureEnabled); },
      enterPictureInPicture: function () { if (video.requestPictureInPicture) return video.requestPictureInPicture(); return Promise.reject(new Error('PIP unsupported')); },
      isPaused: function () { return !!video.paused; },
      getCurrentStream: function () { return currentStream; }
    };
  }

  StreamBox.playerEngine = {
    create: create
  };
})(window);

(function (global) {
  var StreamBox = global.StreamBox = global.StreamBox || {};
  var utils = StreamBox.utils;
  var data = StreamBox.data;
  var store = StreamBox.store;
  var tvNav = StreamBox.tvNav;
  var adapter = StreamBox.playerAdapter;
  var ui = StreamBox.playerUI;
  var engineFactory = StreamBox.playerEngine;
  var episodesLib = StreamBox.playerEpisodes;
  var tracksLib = StreamBox.playerTracks;
  var seekbarLib = StreamBox.playerSeekbar;
  var storage = StreamBox.playerStorage;
  var view = StreamBox.playerView;
  var SPEEDS = [0.25, 0.5, 1, 1.25, 1.35, 1.5, 1.75, 2];
  var refs = {};
  var state = {};
  function boot(payload, options) {
    var opts = options || {};
    if (payload) store.init(payload);
    refs.root = opts.root || utils.byId('playerPageRoot');
    refs.meta = opts.meta || utils.byId('playerMeta');
    if (!refs.root) return;
    var query = opts.query || utils.parseQuery(global.location.search || '');
    var id = query.id;
    if (!id) return writePageError('ID titolo mancante.');
    var summary = data.getSummaryById(id);
    if (!summary) summary = data.getSummaryById(data.resolveCatalogId(id, query.provider || ''));
    if (!summary) return writePageError('Titolo non presente nel catalogo.');
    store.addHistory(summary.id);
    refs.root.innerHTML = '<p>Preparazione player per <strong>' + utils.escapeHtml(summary.title) + '</strong>...</p>';
    data.getDetailById(summary.id).then(function (detail) {
      startWithDetail(summary, detail || {}, query);
    }, function () {
      startWithDetail(summary, {}, query);
    });
  }
  function init(payload) { boot(payload, {}); }
  function mountInline(payload, options) { boot(payload, options || {}); }
  function writePageError(message) {
    if (refs.root) refs.root.innerHTML = '<p>' + utils.escapeHtml(message || 'Errore') + '</p>';
  }
  function getClosest(target, selector) {
    var node = target;
    while (node && node.nodeType !== 1) node = node.parentNode;
    if (!node || !node.closest) return null;
    return node.closest(selector);
  }
  function startWithDetail(summary, detail, query) {
    adapter.resolvePayload(summary, detail, query).then(function (result) {
      mountPlayer(summary, detail, query, result.payload, result.links);
    }, function (error) {
      writePageError('Errore inizializzazione player: ' + utils.safeText(error && error.message || error));
    });
  }
  function mountPlayer(summary, detail, query, payload, links) {
    refs.ui = ui.mount(refs.root, refs.meta, summary, detail, links);
    state.summary = summary;
    state.detail = detail;
    state.query = query;
    state.payload = payload;
    state.links = links;
    state.navigator = episodesLib.createNavigator(payload, payload.defaults.seasonIndex, payload.defaults.episodeIndex);
    state.panelSeasonIndex = payload.defaults.seasonIndex;
    state.activeStreamIndex = payload.defaults.streamIndex || 0;
    state.preferences = storage.loadPreferences(payload.content.id);
    state.playbackRate = Number(state.preferences.playbackRate) || 1;
    state.subtitleIndex = -1;
    state.uploadedSubtitles = [];
    state.startupTimer = null;
    state.startupProgress = false;
    state.retryState = { key: '', count: 0, lastAttempt: 0 };
    state.lastProgressSave = 0;
    state.qualityOptions = [];
    state.subtitleOptions = [];
    state.locked = false;
    state.seasonLoadQueue = {}; state.seekbar = null; state.videoTapTimer = null;
    state.engine = engineFactory.create(refs.ui.video);
    if (refs.ui.video) refs.ui.video.controls = false;
    bindCoreButtons();
    bindSeekbar();
    bindTabs();
    bindLists();
    bindSubtitleUpload();
    bindVideoState();
    bindFavoriteButtons();
    bindTvNavigation();
    applyLockState(false);
    ui.setActiveTab(refs.ui, 'server');
    ui.setMenuOpen(refs.ui, false);
    loadInitialEpisode();
  }
  function bindCoreButtons() {
    refs.ui.playPause.onclick = function () {
      if (state.locked) return;
      state.engine.togglePlayPause();
      ui.setPlayState(refs.ui, state.engine.isPaused());
    };
    refs.ui.seekBack.onclick = function () {
      if (state.locked) return;
      state.engine.seekBy(-10);
    };
    refs.ui.seekFwd.onclick = function () {
      if (state.locked) return;
      state.engine.seekBy(10);
    };
    refs.ui.nextEpisode.onclick = function () {
      if (state.locked) return;
      if (!state.navigator.goNextEpisode()) return;
      state.panelSeasonIndex = state.navigator.toState().seasonIndex;
      state.activeStreamIndex = 0;
      ensureSeasonLoaded(state.panelSeasonIndex, true).then(function () {
        view.renderEpisodes(state, refs);
        loadCurrentEpisode(0);
      });
    };
    refs.ui.pip.onclick = function () {
      if (state.locked) return;
      if (!state.engine.canPictureInPicture()) return ui.setRuntimeStatus(refs.ui, 'PIP non supportato', 'warn');
      state.engine.enterPictureInPicture().catch(function () { ui.setRuntimeStatus(refs.ui, 'PIP non disponibile', 'warn'); });
    };
    refs.ui.fullscreen.onclick = function () {
      if (state.locked) return;
      toggleFullscreen();
    };
    refs.ui.lock.onclick = function () { applyLockState(!state.locked); };
    if (refs.ui.menuBtn) {
      refs.ui.menuBtn.onclick = function () {
        if (state.locked) return;
        var open = !refs.ui.menuDock || refs.ui.menuDock.className.indexOf('is-open') === -1;
        ui.setMenuOpen(refs.ui, open);
      };
    }
    if (refs.root && refs.root.addEventListener) {
      refs.root.addEventListener('click', function (event) {
        var open = refs.ui.menuDock && refs.ui.menuDock.className.indexOf('is-open') !== -1;
        if (!open) return;
        if (getClosest(event.target, '#playerMenuDock')) return;
        if (getClosest(event.target, '#ctrlMenu')) return;
        ui.setMenuOpen(refs.ui, false);
      });
    }
  }
  function bindTabs() { for (var i = 0; i < refs.ui.tabs.length; i += 1) refs.ui.tabs[i].onclick = function () { ui.setActiveTab(refs.ui, this.getAttribute('data-tab') || 'server'); }; }
  function bindSeekbar() { if (state.seekbar && state.seekbar.destroy) state.seekbar.destroy(); if (!seekbarLib || !seekbarLib.create) return; state.seekbar = seekbarLib.create({ refs: refs.ui, engine: state.engine, ui: ui, isLocked: function () { return !!state.locked; } }); }
  function bindLists() {
    refs.ui.listServers.onclick = function (event) {
      if (state.locked) return;
      var btn = getClosest(event.target, '[data-item-id]');
      if (!btn) return;
      state.activeStreamIndex = Number(btn.getAttribute('data-item-id').replace('srv-', '')) || 0;
      loadCurrentEpisode(state.engine.getCurrentTime());
      ui.setMenuOpen(refs.ui, false);
    };
    refs.ui.listQuality.onclick = function (event) {
      if (state.locked) return;
      var option = findQualityOption(getClosest(event.target, '[data-item-id]'));
      if (!option) return;
      state.engine.selectQuality(option.raw);
      persistPreference({ qualityId: option.id });
      view.renderTracks(state, refs, SPEEDS);
      ui.setMenuOpen(refs.ui, false);
    };
    refs.ui.listAudio.onclick = function (event) {
      if (state.locked) return;
      var btn = getClosest(event.target, '[data-item-id]');
      if (!btn) return;
      var index = Number(btn.getAttribute('data-item-id').replace('aud-', '')) || 0;
      state.engine.selectAudioTrack(index);
      persistPreference({ audioIndex: index });
      view.renderTracks(state, refs, SPEEDS);
      ui.setMenuOpen(refs.ui, false);
    };
    refs.ui.listSubtitle.onclick = function (event) {
      if (state.locked) return;
      var btn = getClosest(event.target, '[data-item-id]');
      if (!btn) return;
      var selectedId = btn.getAttribute('data-item-id');
      for (var i = 0; i < state.subtitleOptions.length; i += 1) {
        if (state.subtitleOptions[i].id !== selectedId) continue;
        state.subtitleIndex = state.subtitleOptions[i].index;
        state.engine.selectSubtitle(state.subtitleIndex);
        persistPreference({ subtitleId: selectedId });
        break;
      }
      view.renderTracks(state, refs, SPEEDS);
      ui.setMenuOpen(refs.ui, false);
    };
    refs.ui.listSpeed.onclick = function (event) {
      if (state.locked) return;
      var btn = getClosest(event.target, '[data-item-id]');
      if (!btn) return;
      state.playbackRate = Number(btn.getAttribute('data-item-id').replace('spd-', '')) || 1;
      state.engine.setPlaybackRate(state.playbackRate);
      persistPreference({ playbackRate: state.playbackRate });
      view.renderTracks(state, refs, SPEEDS);
      ui.setMenuOpen(refs.ui, false);
    };
    refs.ui.listSeasons.onclick = function (event) {
      if (state.locked) return;
      var btn = getClosest(event.target, '[data-item-id]');
      if (!btn) return;
      state.panelSeasonIndex = Number(btn.getAttribute('data-item-id').replace('season-', '')) || 0;
      ensureSeasonLoaded(state.panelSeasonIndex).then(function () {
        view.renderEpisodes(state, refs);
      });
    };
    refs.ui.listEpisodes.onclick = function (event) {
      if (state.locked) return;
      var btn = getClosest(event.target, '[data-item-id]');
      if (!btn) return;
      var episodeIndex = Number(btn.getAttribute('data-item-id').replace('episode-', '')) || 0;
      ensureSeasonLoaded(state.panelSeasonIndex, true).then(function () {
        state.navigator.setIndexes(state.panelSeasonIndex, episodeIndex);
        state.activeStreamIndex = 0;
        loadCurrentEpisode(loadStoredPosition());
        view.renderEpisodes(state, refs);
        ui.setMenuOpen(refs.ui, false);
      });
    };
  }
  function bindSubtitleUpload() {
    refs.ui.subtitleFile.onchange = function (event) {
      var file = event.target && event.target.files && event.target.files[0];
      if (!file) return;
      tracksLib.toVttBlobUrl(file, function (blobUrl) {
        state.uploadedSubtitles.unshift(tracksLib.normalizeUploadedSubtitle(file.name, blobUrl, file.type));
        refreshSubtitleTracks();
        state.subtitleIndex = 0;
        state.engine.selectSubtitle(0);
        view.renderTracks(state, refs, SPEEDS);
        ui.setRuntimeStatus(refs.ui, 'Subtitle locale aggiunto', 'ok');
        refs.ui.subtitleFile.value = '';
      }, function () {
        ui.setRuntimeStatus(refs.ui, 'Impossibile leggere file subtitle', 'error');
      });
    };
  }
  function bindVideoState() {
    refs.ui.video.addEventListener('pause', function () { ui.setPlayState(refs.ui, true); persistProgress(true); });
    refs.ui.video.addEventListener('play', function () { ui.setPlayState(refs.ui, false); });
    refs.ui.video.addEventListener('click', function () { if (state.locked) return; if (state.videoTapTimer) global.clearTimeout(state.videoTapTimer); state.videoTapTimer = global.setTimeout(function () { state.videoTapTimer = null; state.engine.togglePlayPause(); ui.setPlayState(refs.ui, state.engine.isPaused()); }, 210); });
    refs.ui.video.addEventListener('dblclick', function (event) { if (state.locked) return; if (state.videoTapTimer) { global.clearTimeout(state.videoTapTimer); state.videoTapTimer = null; } if (event && event.preventDefault) event.preventDefault(); toggleFullscreen(); });
    global.addEventListener('beforeunload', function () { persistProgress(true); if (state.videoTapTimer) { global.clearTimeout(state.videoTapTimer); state.videoTapTimer = null; } if (state.seekbar && state.seekbar.destroy) state.seekbar.destroy(); if (state.engine) state.engine.destroy(); });
  }
  function bindFavoriteButtons() {
    if (!refs.ui.favBtn || !refs.ui.watchBtn) return;
    refreshFavoriteButtons();
    refs.ui.favBtn.onclick = function () { store.toggleFavorite(state.summary.id); refreshFavoriteButtons(); };
    refs.ui.watchBtn.onclick = function () { store.toggleWatchlist(state.summary.id); refreshFavoriteButtons(); };
  }
  function bindTvNavigation() {
    if (!tvNav || !tvNav.bindKeyboard) return;
    tvNav.bindKeyboard({ bindKey: 'player', getFocusable: function () { return tvNav.getFocusable(document); } });
  }
  function refreshFavoriteButtons() {
    if (refs.ui.favBtn) refs.ui.favBtn.innerHTML = store.isFavorite(state.summary.id) ? 'Rimuovi preferito' : 'Aggiungi preferito';
    if (refs.ui.watchBtn) refs.ui.watchBtn.innerHTML = store.isWatchlist(state.summary.id) ? 'Rimuovi watchlist' : 'Aggiungi watchlist';
  }
  function applyLockState(locked) {
    state.locked = !!locked;
    ui.setLockState(refs.ui, state.locked);
  }
  function persistPreference(patch) {
    if (!patch) return;
    var key;
    if (!state.preferences || typeof state.preferences !== 'object') state.preferences = {};
    for (key in patch) if (Object.prototype.hasOwnProperty.call(patch, key)) state.preferences[key] = patch[key];
    storage.savePreferences(state.payload.content.id, patch);
  }
  function loadStoredPosition() {
    var episode = state.navigator.getCurrentEpisode();
    if (!episode) return 0;
    var stored = storage.loadProgress(state.payload.content.id, episode.link);
    return stored && stored.position ? Number(stored.position) || 0 : 0;
  }
  function loadInitialEpisode() {
    var nav = state.navigator.toState();
    ensureSeasonLoaded(nav.seasonIndex).then(function () { state.navigator.setIndexes(nav.seasonIndex, nav.episodeIndex); state.panelSeasonIndex = state.navigator.toState().seasonIndex; view.renderEpisodes(state, refs); loadCurrentEpisode(loadStoredPosition()); }, function () { view.renderEpisodes(state, refs); loadCurrentEpisode(0); });
  }
  function ensureSeasonLoaded(seasonIndex, silent) {
    var safeSeason = Math.max(0, Number(seasonIndex) || 0);
    var season = state.payload && state.payload.seasons ? state.payload.seasons[safeSeason] : null;
    if (!season) return Promise.resolve([]);
    if (season._episodesLoaded) return Promise.resolve(season.episodes || []);
    if (Array.isArray(season.episodes) && season.episodes.length) { season._episodesLoaded = true; return Promise.resolve(season.episodes); }
    if (!season.episodesLink) { season._episodesLoaded = true; return Promise.resolve([]); }
    if (state.seasonLoadQueue[safeSeason]) return state.seasonLoadQueue[safeSeason];
    if (!silent) ui.setRuntimeStatus(refs.ui, 'Caricamento episodi stagione...', 'warn');
    state.seasonLoadQueue[safeSeason] = adapter.loadSeasonEpisodes(state.payload, safeSeason, state.links).then(function (episodes) { season._episodesLoaded = true; return episodes || []; }, function () { season._episodesLoaded = false; return []; }).then(function (episodes) { delete state.seasonLoadQueue[safeSeason]; return episodes; });
    return state.seasonLoadQueue[safeSeason];
  }
  function loadCurrentEpisode(startTime, skipStreamFetch) {
    clearStartupGuard(false);
    var episode = state.navigator.getCurrentEpisode();
    if (!episode) return blockPlayback('Episodio non disponibile.');
    if (!episode.streams || !episode.streams.length) {
      if (skipStreamFetch) return blockPlayback('Nessuno stream disponibile per questo episodio.');
      ui.setRuntimeStatus(refs.ui, 'Recupero stream episodio...', 'warn');
      return adapter.refreshStreams(state.payload, state.navigator.toState().seasonIndex, state.navigator.toState().episodeIndex).then(function (streams) {
        if (streams && streams.length) { episode.streams = streams; state.activeStreamIndex = 0; loadCurrentEpisode(startTime, true); return; }
        blockPlayback('Nessuno stream disponibile per questo episodio.');
      }, function () { blockPlayback('Impossibile recuperare stream per questo episodio.'); });
    }
    if (state.activeStreamIndex >= episode.streams.length) state.activeStreamIndex = 0;
    var stream = episode.streams[state.activeStreamIndex];
    ui.setOverlay(refs.ui, 'Caricamento stream in corso...'); ui.setRuntimeStatus(refs.ui, 'Caricamento stream...', 'warn'); armStartupGuard();
    state.engine.setSource(stream, {
      startTime: startTime || 0, playbackRate: state.playbackRate,
      onReady: function () { clearStartupGuard(true); ui.setOverlay(refs.ui, ''); ui.setRuntimeStatus(refs.ui, 'Riproduzione pronta', 'ok'); state.engine.setPlaybackRate(state.playbackRate); refreshSubtitleTracks(); applySavedTrackPreferences(); view.renderAll(state, refs, SPEEDS); ui.setPlayState(refs.ui, true); },
      onProgress: function (progress) { if (progress.currentTime >= 0.5) clearStartupGuard(true); ui.setProgress(refs.ui, progress.currentTime, progress.duration); persistProgress(false, progress.currentTime, progress.duration); },
      onEnded: function () { ui.setPlayState(refs.ui, true); ui.setRuntimeStatus(refs.ui, 'Episodio terminato', 'neutral'); },
      onTracksChanged: function () { view.renderTracks(state, refs, SPEEDS); },
      onError: handleEngineError
    });
  }
  function refreshSubtitleTracks() {
    var episode = state.navigator.getCurrentEpisode();
    var stream = episode && episode.streams ? episode.streams[state.activeStreamIndex] : null;
    state.subtitleOptions = tracksLib.buildSubtitleOptions(stream, state.uploadedSubtitles);
    var playable = [];
    for (var i = 0; i < state.subtitleOptions.length; i += 1) if (state.subtitleOptions[i].track) playable.push(state.subtitleOptions[i].track);
    if (state.subtitleIndex >= playable.length) state.subtitleIndex = -1;
    state.engine.setSubtitleTracks(playable, state.subtitleIndex);
  }
  function applySavedTrackPreferences() {
    var prefs = state.preferences || {};
    var qualityId = utils.safeText(prefs.qualityId || '');
    var subtitleId = utils.safeText(prefs.subtitleId || '');
    var i;
    if (qualityId) {
      var quality = state.engine.listQualityOptions();
      for (i = 0; i < quality.length; i += 1) {
        var qualityEntryId = quality[i].auto ? 'ql-auto' : ('ql-' + quality[i].index);
        if (qualityEntryId !== qualityId) continue;
        state.engine.selectQuality(quality[i]);
        break;
      }
    }
    if (isFinite(Number(prefs.audioIndex)) && Number(prefs.audioIndex) >= 0) {
      state.engine.selectAudioTrack(Number(prefs.audioIndex));
    }
    if (subtitleId) {
      for (i = 0; i < state.subtitleOptions.length; i += 1) {
        if (state.subtitleOptions[i].id !== subtitleId) continue;
        state.subtitleIndex = state.subtitleOptions[i].index;
        state.engine.selectSubtitle(state.subtitleIndex);
        break;
      }
    }
  }
  function armStartupGuard() {
    clearStartupGuard(false);
    state.startupProgress = false;
    state.startupTimer = global.setTimeout(function () {
      if (state.startupProgress) return;
      switchToNextServer('Startup timeout: provo server successivo.');
    }, 8000);
  }
  function clearStartupGuard(progressSeen) {
    if (progressSeen) state.startupProgress = true;
    if (state.startupTimer) global.clearTimeout(state.startupTimer);
    state.startupTimer = null;
  }
  function handleEngineError(error) { clearStartupGuard(false); var status = parseStatus(error); if ((status === 403 || status === 503) && canRetryToken()) return retryCurrentStream(); switchToNextServer('Errore stream, provo server successivo.'); }
  function parseStatus(error) { var status = Number(error && error.status) || 0; if (status) return status; var match = utils.safeText(error && error.message || '').match(/\b(403|503)\b/); return match ? Number(match[1]) : 0; }
  function canRetryToken() { var episode = state.navigator.getCurrentEpisode(); if (!episode || !episode.streams || !episode.streams.length) return false; var stream = episode.streams[state.activeStreamIndex]; if (!stream) return false; var key = episode.link + '|' + stream.server; var now = Date.now(); if (state.retryState.key !== key) state.retryState = { key: key, count: 0, lastAttempt: 0 }; return state.retryState.count < 1 && now - state.retryState.lastAttempt > 3000; }
  function retryCurrentStream() {
    var navState = state.navigator.toState();
    state.retryState.count += 1;
    state.retryState.lastAttempt = Date.now();
    ui.setRuntimeStatus(refs.ui, 'Token stream scaduto: refresh in corso...', 'warn');
    adapter.refreshStreams(state.payload, navState.seasonIndex, navState.episodeIndex).then(function (streams) {
      var episode = state.navigator.getCurrentEpisode();
      if (episode && streams && streams.length) {
        episode.streams = streams;
        state.activeStreamIndex = 0;
        loadCurrentEpisode(state.engine.getCurrentTime(), true);
        return;
      }
      switchToNextServer('Refresh stream fallito.');
    }, function () {
      switchToNextServer('Refresh stream fallito.');
    });
  }
  function switchToNextServer(message) { var episode = state.navigator.getCurrentEpisode(); if (!episode || !episode.streams || !episode.streams.length) return blockPlayback('Riproduzione non disponibile. Nessuno stream valido trovato.'); if (state.activeStreamIndex < episode.streams.length - 1) { state.activeStreamIndex += 1; ui.setRuntimeStatus(refs.ui, message || 'Cambio server...', 'warn'); loadCurrentEpisode(state.engine.getCurrentTime()); return; } blockPlayback('Riproduzione non disponibile. Nessun altro server valido.'); }
  function blockPlayback(message) {
    ui.setOverlay(refs.ui, message, 'Torna alla scheda', 'playerGoBackBtn');
    ui.setRuntimeStatus(refs.ui, 'Errore riproduzione', 'error');
    var backBtn = utils.byId('playerGoBackBtn');
    if (backBtn) backBtn.onclick = function () { global.location.href = state.links.titlePage || '../index.html'; };
  }
  function persistProgress(force, current, duration) { var now = Date.now(); if (!force && now - state.lastProgressSave < 5000) return; state.lastProgressSave = now; var episode = state.navigator.getCurrentEpisode(); if (!episode) return; var nav = state.navigator.toState(); var position = typeof current === 'number' ? current : state.engine.getCurrentTime(); var total = typeof duration === 'number' ? duration : state.engine.getDuration(); storage.saveProgress(state.payload.content.id, episode.link, position, total, { episodeTitle: episode.title, episodeNumber: episode.episodeNumber, seasonNumber: (Number(nav.seasonIndex) || 0) + 1 }); }
  function findQualityOption(btn) { if (!btn) return null; var id = btn.getAttribute('data-item-id'); for (var i = 0; i < state.qualityOptions.length; i += 1) if (state.qualityOptions[i].id === id) return state.qualityOptions[i]; return null; }
  function toggleFullscreen() { var target = refs.ui.video; var fsElement = document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement || document.mozFullScreenElement; if (!fsElement) { var request = target.requestFullscreen || target.webkitRequestFullscreen || target.msRequestFullscreen || target.mozRequestFullScreen; if (!request) return ui.setRuntimeStatus(refs.ui, 'Fullscreen non supportato', 'warn'); var result = request.call(target); if (result && result.catch) result.catch(function () {}); return; } var exit = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen || document.mozCancelFullScreen; if (exit) exit.call(document); }
  StreamBox.playerPage = { init: init, mountInline: mountInline };})(window);

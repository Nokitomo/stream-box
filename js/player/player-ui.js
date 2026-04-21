(function (global) {
  var StreamBox = global.StreamBox = global.StreamBox || {};
  var utils = StreamBox.utils;

  function escape(value) {
    return utils.escapeHtml(value == null ? '' : value);
  }

  function text(value) {
    return utils.safeText(value || '');
  }

  function mount(root, metaRoot, summary, detail, links) {
    root.innerHTML = '' +
      '<div class="player-shell">' +
        '<div class="player-video-wrap">' +
          '<video id="playerVideo" class="player-video" controls playsinline crossorigin="anonymous"></video>' +
          '<div id="playerOverlay" class="player-overlay hidden"></div>' +
          '<div class="player-topbar">' +
            '<span id="playerRuntimeStatus" class="badge badge-neutral">Pronto</span>' +
          '</div>' +
          '<div class="player-hud">' +
            '<div class="player-timeline">' +
              '<div data-tv-focus="1" id="playerProgressTrack" class="player-progress-track" role="slider" aria-label="Timeline player" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" tabindex="0">' +
                '<div class="player-progress">' +
                  '<div id="playerProgressFill" class="player-progress-fill"></div>' +
                  '<span id="playerProgressThumb" class="player-progress-thumb" aria-hidden="true"></span>' +
                '</div>' +
              '</div>' +
              '<div class="player-times"><span id="playerCurrentTime">00:00</span><span id="playerDuration">00:00</span></div>' +
            '</div>' +
            '<div id="playerControlRow" class="player-controls">' +
              '<button data-tv-focus="1" id="ctrlPlayPause" class="btn btn-sm">Play</button>' +
              '<button data-tv-focus="1" id="ctrlSeekBack" class="btn btn-sm">-10s</button>' +
              '<button data-tv-focus="1" id="ctrlSeekFwd" class="btn btn-sm">+10s</button>' +
              '<button data-tv-focus="1" id="ctrlNextEpisode" class="btn btn-sm">Next</button>' +
              '<button data-tv-focus="1" id="ctrlPip" class="btn btn-sm">PIP</button>' +
              '<button data-tv-focus="1" id="ctrlFullscreen" class="btn btn-sm">Fullscreen</button>' +
              '<button data-tv-focus="1" id="ctrlLock" class="btn btn-sm">Lock</button>' +
              '<button data-tv-focus="1" id="ctrlMenu" class="btn btn-sm">Menu</button>' +
            '</div>' +
          '</div>' +
          '<div id="playerMenuDock" class="player-menu-dock">' +
            '<div class="player-tabs">' +
              '<button data-tv-focus="1" class="btn btn-sm player-tab is-active" data-tab="server">Server</button>' +
              '<button data-tv-focus="1" class="btn btn-sm player-tab" data-tab="quality">Qualita</button>' +
              '<button data-tv-focus="1" class="btn btn-sm player-tab" data-tab="audio">Audio</button>' +
              '<button data-tv-focus="1" class="btn btn-sm player-tab" data-tab="subtitle">Subtitle</button>' +
              '<button data-tv-focus="1" class="btn btn-sm player-tab" data-tab="speed">Speed</button>' +
              '<button data-tv-focus="1" class="btn btn-sm player-tab" data-tab="episodes">Episodes</button>' +
            '</div>' +
            '<section id="panel-server" class="player-panel is-active"><div id="listServers" class="player-list"></div></section>' +
            '<section id="panel-quality" class="player-panel"><div id="listQuality" class="player-list"></div></section>' +
            '<section id="panel-audio" class="player-panel"><div id="listAudio" class="player-list"></div></section>' +
            '<section id="panel-subtitle" class="player-panel">' +
              '<div class="player-subtitle-tools">' +
                '<label class="btn btn-sm" for="playerSubtitleFile">Aggiungi file subtitle</label>' +
                '<input id="playerSubtitleFile" class="hidden" type="file" accept=".vtt,.srt,.ttml,.xml,text/vtt,application/x-subrip,application/ttml+xml">' +
              '</div>' +
              '<div id="listSubtitle" class="player-list"></div>' +
            '</section>' +
            '<section id="panel-speed" class="player-panel"><div id="listSpeed" class="player-list"></div></section>' +
            '<section id="panel-episodes" class="player-panel">' +
              '<div class="player-episode-grid">' +
                '<div><h3 class="section-title">Stagioni</h3><div id="listSeasons" class="player-list"></div></div>' +
                '<div><h3 class="section-title">Episodi</h3><div id="listEpisodes" class="player-list"></div></div>' +
              '</div>' +
            '</section>' +
          '</div>' +
        '</div>' +
      '</div>';

    if (metaRoot) metaRoot.innerHTML = '<h2 class="section-title">Metadata player</h2><ul id="playerMetaList" class="kv-list"></ul>';

    return {
      video: utils.byId('playerVideo'),
      overlay: utils.byId('playerOverlay'),
      runtimeStatus: utils.byId('playerRuntimeStatus'),
      progressFill: utils.byId('playerProgressFill'),
      progressTrack: utils.byId('playerProgressTrack'),
      progressThumb: utils.byId('playerProgressThumb'),
      currentTime: utils.byId('playerCurrentTime'),
      duration: utils.byId('playerDuration'),
      controlRow: utils.byId('playerControlRow'),
      playPause: utils.byId('ctrlPlayPause'),
      seekBack: utils.byId('ctrlSeekBack'),
      seekFwd: utils.byId('ctrlSeekFwd'),
      nextEpisode: utils.byId('ctrlNextEpisode'),
      pip: utils.byId('ctrlPip'),
      fullscreen: utils.byId('ctrlFullscreen'),
      lock: utils.byId('ctrlLock'),
      menuBtn: utils.byId('ctrlMenu'),
      menuDock: utils.byId('playerMenuDock'),
      favBtn: utils.byId('playerFavBtn'),
      watchBtn: utils.byId('playerWatchBtn'),
      tabs: root.querySelectorAll('.player-tab'),
      panels: root.querySelectorAll('.player-panel'),
      listServers: utils.byId('listServers'),
      listQuality: utils.byId('listQuality'),
      listAudio: utils.byId('listAudio'),
      listSubtitle: utils.byId('listSubtitle'),
      subtitleFile: utils.byId('playerSubtitleFile'),
      listSpeed: utils.byId('listSpeed'),
      listSeasons: utils.byId('listSeasons'),
      listEpisodes: utils.byId('listEpisodes'),
      metaList: utils.byId('playerMetaList')
    };
  }

  function setRuntimeStatus(refs, message, tone) {
    if (!refs.runtimeStatus) return;
    refs.runtimeStatus.className = 'badge badge-' + (tone || 'neutral');
    refs.runtimeStatus.innerHTML = escape(message || '');
  }

  function setOverlay(refs, message, actionLabel, actionId) {
    if (!refs.overlay) return;
    if (!message) {
      refs.overlay.className = 'player-overlay hidden';
      refs.overlay.innerHTML = '';
      return;
    }
    refs.overlay.className = 'player-overlay';
    refs.overlay.innerHTML = '' +
      '<div class="player-overlay-card">' +
        '<p>' + escape(message) + '</p>' +
        (actionLabel ? '<button data-tv-focus="1" id="' + escape(actionId || '') + '" class="btn btn-sm btn-primary">' + escape(actionLabel) + '</button>' : '') +
      '</div>';
  }

  function setPlayState(refs, paused) {
    if (!refs.playPause) return;
    refs.playPause.innerHTML = paused ? 'Play' : 'Pause';
  }

  function setLockState(refs, locked) {
    if (!refs.lock || !refs.controlRow) return;
    refs.lock.innerHTML = locked ? 'Unlock' : 'Lock';
    refs.controlRow.className = locked ? 'player-controls is-locked' : 'player-controls';
  }

  function pad2(value) {
    var text = String(value);
    return text.length < 2 ? ('0' + text) : text;
  }

  function formatTime(seconds) {
    var sec = Math.max(0, Math.floor(Number(seconds) || 0));
    var hh = Math.floor(sec / 3600);
    var mm = Math.floor((sec % 3600) / 60);
    var ss = sec % 60;
    if (hh > 0) return hh + ':' + pad2(mm) + ':' + pad2(ss);
    return pad2(mm) + ':' + pad2(ss);
  }

  function setProgress(refs, current, duration) {
    var safeDuration = Number(duration) || 0;
    var safeCurrent = Number(current) || 0;
    if (refs.currentTime) refs.currentTime.innerHTML = formatTime(safeCurrent);
    if (refs.duration) refs.duration.innerHTML = formatTime(safeDuration);
    var percent = safeDuration > 0 ? Math.min(100, Math.max(0, (safeCurrent / safeDuration) * 100)) : 0;
    if (refs.progressFill) {
      refs.progressFill.style.width = percent + '%';
    }
    if (refs.progressThumb) refs.progressThumb.style.left = percent + '%';
    if (refs.progressTrack) refs.progressTrack.setAttribute('aria-valuenow', String(Math.round(percent)));
  }

  function setActiveTab(refs, tabName) {
    var i;
    for (i = 0; i < refs.tabs.length; i += 1) {
      var isActive = refs.tabs[i].getAttribute('data-tab') === tabName;
      refs.tabs[i].className = isActive ? 'btn btn-sm player-tab is-active' : 'btn btn-sm player-tab';
    }
    for (i = 0; i < refs.panels.length; i += 1) {
      var panelId = refs.panels[i].id.replace('panel-', '');
      refs.panels[i].className = panelId === tabName ? 'player-panel is-active' : 'player-panel';
    }
  }

  function setMenuOpen(refs, open) {
    if (!refs || !refs.menuDock) return;
    refs.menuDock.className = open ? 'player-menu-dock is-open' : 'player-menu-dock';
  }

  function renderChoiceList(container, items, selectedId, itemClass) {
    if (!container) return;
    var out = [];
    for (var i = 0; i < items.length; i += 1) {
      var item = items[i] || {};
      var isSelected = String(item.id) === String(selectedId);
      out.push(
        '<button data-tv-focus="1" class="' + escape(itemClass || 'player-choice') + (isSelected ? ' is-selected' : '') + '" data-item-id="' + escape(item.id || '') + '">' +
          '<span>' + escape(item.label || ('Item ' + (i + 1))) + '</span>' +
          (isSelected ? '<span class="badge">OK</span>' : '') +
        '</button>'
      );
    }
    container.innerHTML = out.join('') || '<p class="player-empty">Nessun elemento disponibile.</p>';
  }

  function renderMetaRows(refs, rows) {
    if (!refs.metaList) return;
    var out = [];
    for (var i = 0; i < rows.length; i += 1) {
      out.push('<li><strong>' + escape(rows[i].label) + ':</strong> ' + escape(rows[i].value || '-') + '</li>');
    }
    refs.metaList.innerHTML = out.join('');
  }

  StreamBox.playerUI = {
    mount: mount,
    setRuntimeStatus: setRuntimeStatus,
    setOverlay: setOverlay,
    setPlayState: setPlayState,
    setLockState: setLockState,
    setMenuOpen: setMenuOpen,
    setProgress: setProgress,
    setActiveTab: setActiveTab,
    renderChoiceList: renderChoiceList,
    renderMetaRows: renderMetaRows
  };
})(window);

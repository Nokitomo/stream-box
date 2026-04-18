(function (global) {
  var StreamBox = global.StreamBox = global.StreamBox || {};
  var ui = StreamBox.playerUI;
  var tracksLib = StreamBox.playerTracks;

  function renderAll(state, refs, speeds) {
    renderServers(state, refs);
    renderTracks(state, refs, speeds);
    renderEpisodes(state, refs);
    renderMeta(state, refs);
  }

  function renderServers(state, refs) {
    var episode = state.navigator.getCurrentEpisode() || { streams: [] };
    var rows = [];
    for (var i = 0; i < episode.streams.length; i += 1) {
      rows.push({ id: 'srv-' + i, label: episode.streams[i].server || ('Server ' + (i + 1)) });
    }
    ui.renderChoiceList(refs.ui.listServers, rows, 'srv-' + state.activeStreamIndex, 'player-choice');
  }

  function renderTracks(state, refs, speeds) {
    var quality = state.engine.listQualityOptions();
    state.qualityOptions = [];
    var qualityRows = [];
    var selectedQualityId = 'ql-auto';
    var i;
    for (i = 0; i < quality.length; i += 1) {
      var id = quality[i].auto ? 'ql-auto' : ('ql-' + quality[i].index);
      state.qualityOptions.push({ id: id, raw: quality[i] });
      qualityRows.push({ id: id, label: tracksLib.qualityLabel(quality[i]) });
      if (quality[i].selected) selectedQualityId = id;
    }
    ui.renderChoiceList(refs.ui.listQuality, qualityRows, selectedQualityId, 'player-choice');

    var audio = state.engine.listAudioTracks();
    var audioRows = [];
    var selectedAudio = '';
    for (i = 0; i < audio.length; i += 1) {
      audioRows.push({ id: 'aud-' + i, label: audio[i].label || ('Audio ' + (i + 1)) });
      if (audio[i].selected) selectedAudio = 'aud-' + i;
    }
    ui.renderChoiceList(refs.ui.listAudio, audioRows, selectedAudio, 'player-choice');

    var subtitleRows = [];
    var selectedSubtitleId = 'off';
    for (i = 0; i < state.subtitleOptions.length; i += 1) {
      subtitleRows.push({ id: state.subtitleOptions[i].id, label: state.subtitleOptions[i].label });
      if (state.subtitleOptions[i].index === state.subtitleIndex) selectedSubtitleId = state.subtitleOptions[i].id;
    }
    ui.renderChoiceList(refs.ui.listSubtitle, subtitleRows, selectedSubtitleId, 'player-choice');

    var speedRows = [];
    for (i = 0; i < speeds.length; i += 1) speedRows.push({ id: 'spd-' + speeds[i], label: speeds[i] + 'x' });
    ui.renderChoiceList(refs.ui.listSpeed, speedRows, 'spd-' + state.playbackRate, 'player-choice');
  }

  function renderEpisodes(state, refs) {
    var seasons = state.payload.seasons || [];
    var seasonRows = [];
    var i;
    for (i = 0; i < seasons.length; i += 1) seasonRows.push({ id: 'season-' + i, label: seasons[i].title || ('Season ' + (i + 1)) });
    ui.renderChoiceList(refs.ui.listSeasons, seasonRows, 'season-' + state.panelSeasonIndex, 'player-choice');
    var season = seasons[state.panelSeasonIndex] || { episodes: [] };
    var navState = state.navigator.toState();
    var episodeRows = [];
    for (i = 0; i < season.episodes.length; i += 1) {
      var entry = season.episodes[i];
      var prefix = entry.episodeNumber ? ('E' + entry.episodeNumber + ' - ') : '';
      episodeRows.push({ id: 'episode-' + i, label: prefix + entry.title });
    }
    var selectedEpisodeId = navState.seasonIndex === state.panelSeasonIndex ? ('episode-' + navState.episodeIndex) : '';
    ui.renderChoiceList(refs.ui.listEpisodes, episodeRows, selectedEpisodeId, 'player-choice');
  }

  function renderMeta(state, refs) {
    var nav = state.navigator.toState();
    var episode = state.navigator.getCurrentEpisode();
    var stream = episode && episode.streams ? episode.streams[state.activeStreamIndex] : null;
    ui.renderMetaRows(refs.ui, [
      { label: 'Tipo', value: state.detail.type || state.summary.type || '-' },
      { label: 'Anno', value: state.detail.year || state.summary.year || '-' },
      { label: 'Stagione', value: nav.seasonIndex + 1 },
      { label: 'Episodio', value: episode ? episode.title : '-' },
      { label: 'Server', value: stream ? stream.server : '-' },
      { label: 'Formato', value: stream ? stream.type : '-' },
      { label: 'Velocita', value: state.playbackRate + 'x' },
      { label: 'Modalita mock', value: String(state.query.mock || '') === '1' ? 'SI' : 'NO' }
    ]);
  }

  StreamBox.playerView = {
    renderAll: renderAll,
    renderTracks: renderTracks,
    renderEpisodes: renderEpisodes
  };
})(window);

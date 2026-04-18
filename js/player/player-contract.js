(function (global) {
  var StreamBox = global.StreamBox = global.StreamBox || {};
  var utils = StreamBox.utils;

  function toArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function toText(value) {
    return utils.safeText(value || '');
  }

  function toNumber(value, fallback) {
    var parsed = Number(value);
    return isFinite(parsed) ? parsed : fallback;
  }

  function guessStreamType(url, declaredType) {
    var type = toText(declaredType).toLowerCase();
    var clean = toText(url).split('?')[0].split('#')[0].toLowerCase();
    if (type === 'hls' || type === 'm3u8' || /\.m3u8$/.test(clean)) return 'hls';
    if (type === 'dash' || type === 'mpd' || /\.mpd$/.test(clean)) return 'dash';
    if (type === 'mp4' || /\.mp4$/.test(clean)) return 'mp4';
    return 'auto';
  }

  function normalizeSubtitle(track, index) {
    var url = toText(track && (track.url || track.uri || track.src));
    if (!url) return null;
    var label = toText(track && (track.label || track.title || track.language || ('Subtitle ' + (index + 1))));
    var language = toText(track && (track.language || track.lang || 'und')).toLowerCase();
    var type = toText(track && track.type).toLowerCase();
    if (!type) {
      var clean = url.split('?')[0].split('#')[0].toLowerCase();
      if (/\.srt$/.test(clean)) type = 'application/x-subrip';
      else if (/\.ttml$/.test(clean)) type = 'application/ttml+xml';
      else type = 'text/vtt';
    }
    return {
      label: label || ('Subtitle ' + (index + 1)),
      language: language || 'und',
      type: type,
      url: url
    };
  }

  function normalizeHeaders(headers) {
    var out = {};
    if (!headers || typeof headers !== 'object') return out;
    for (var key in headers) {
      if (!Object.prototype.hasOwnProperty.call(headers, key)) continue;
      var normKey = toText(key);
      var normValue = toText(headers[key]);
      if (!normKey || !normValue) continue;
      out[normKey] = normValue;
    }
    return out;
  }

  function normalizeStream(stream, index) {
    var url = toText(stream && (stream.url || stream.link || stream.src));
    if (!url) return null;
    var subtitles = [];
    var rawSubtitles = toArray(stream && (stream.subtitles || stream.textTracks));
    for (var i = 0; i < rawSubtitles.length; i += 1) {
      var normalized = normalizeSubtitle(rawSubtitles[i], i);
      if (normalized) subtitles.push(normalized);
    }
    return {
      server: toText(stream && stream.server) || ('Server ' + (index + 1)),
      url: url,
      type: guessStreamType(url, stream && stream.type),
      quality: toText(stream && stream.quality),
      headers: normalizeHeaders(stream && stream.headers),
      subtitles: subtitles
    };
  }

  function normalizeEpisode(episode, seasonIndex, episodeIndex) {
    var streams = [];
    var rawStreams = toArray(episode && episode.streams);
    for (var i = 0; i < rawStreams.length; i += 1) {
      var normalizedStream = normalizeStream(rawStreams[i], i);
      if (normalizedStream) streams.push(normalizedStream);
    }

    var intro = null;
    if (episode && episode.intro && typeof episode.intro === 'object') {
      var start = toNumber(episode.intro.start, NaN);
      var end = toNumber(episode.intro.end, NaN);
      if (isFinite(start) && isFinite(end) && end > start) {
        intro = { start: start, end: end };
      }
    }

    var link = toText(episode && (episode.link || episode.episodeLink || episode.id));
    return {
      episodeId: toText(episode && (episode.episodeId || episode.id || link || ('ep-' + seasonIndex + '-' + episodeIndex))),
      title: toText(episode && episode.title) || ('Episode ' + (episodeIndex + 1)),
      episodeNumber: toNumber(episode && episode.episodeNumber, episodeIndex + 1),
      link: link || ('season-' + seasonIndex + '-episode-' + episodeIndex),
      intro: intro,
      streams: streams
    };
  }

  function normalizeSeason(season, seasonIndex) {
    var rawEpisodes = toArray(season && season.episodes);
    var episodes = [];
    for (var i = 0; i < rawEpisodes.length; i += 1) {
      var normalizedEpisode = normalizeEpisode(rawEpisodes[i], seasonIndex, i);
      if (normalizedEpisode) episodes.push(normalizedEpisode);
    }
    return {
      seasonNumber: toNumber(season && season.seasonNumber, seasonIndex + 1),
      title: toText(season && season.title) || ('Season ' + (seasonIndex + 1)),
      episodes: episodes
    };
  }

  function pickSeasonTitle(sourceSeason, index) {
    var title = toText(sourceSeason && sourceSeason.title);
    if (title) return title;
    var number = toNumber(sourceSeason && sourceSeason.number, index + 1);
    return 'Season ' + number;
  }

  function buildFallbackSeasons(raw, detail) {
    var out = [];
    var sourceSeasons = toArray(raw && raw.seasons);
    for (var i = 0; i < sourceSeasons.length; i += 1) {
      var source = sourceSeasons[i] || {};
      var seasonEpisodes = [];
      var directEpisodes = toArray(source.episodes || source.directLinks);
      for (var j = 0; j < directEpisodes.length; j += 1) {
        var episode = directEpisodes[j] || {};
        seasonEpisodes.push({
          episodeId: toText(episode.id || episode.link || ('ep-' + i + '-' + j)),
          title: toText(episode.title || episode.name) || ('Episode ' + (j + 1)),
          episodeNumber: toNumber(episode.episodeNumber || episode.number, j + 1),
          link: toText(episode.link || episode.id || ('season-' + i + '-episode-' + j)),
          streams: toArray(episode.streams)
        });
      }
      out.push({
        seasonNumber: toNumber(source.seasonNumber || source.number, i + 1),
        title: pickSeasonTitle(source, i),
        episodes: seasonEpisodes
      });
    }

    if (!out.length && detail && detail.loadedSeason && Array.isArray(detail.loadedSeason.episodes)) {
      var loadedEpisodes = [];
      for (var k = 0; k < detail.loadedSeason.episodes.length; k += 1) {
        var loaded = detail.loadedSeason.episodes[k] || {};
        loadedEpisodes.push({
          episodeId: toText(loaded.id || ('loaded-' + k)),
          title: toText(loaded.name) || ('Episode ' + (k + 1)),
          episodeNumber: toNumber(loaded.number, k + 1),
          link: 'loaded-season-episode-' + (k + 1),
          streams: []
        });
      }
      out.push({
        seasonNumber: toNumber(detail.loadedSeason.number, 1),
        title: 'Season ' + toNumber(detail.loadedSeason.number, 1),
        episodes: loadedEpisodes
      });
    }

    if (!out.length) {
      out.push({
        seasonNumber: 1,
        title: 'Season 1',
        episodes: [
          {
            episodeId: 'default-episode',
            title: 'Episode 1',
            episodeNumber: 1,
            link: 'default-episode-link',
            streams: toArray(raw && raw.streams)
          }
        ]
      });
    }
    return out;
  }

  function normalizePayload(input, context) {
    var raw = input && typeof input === 'object' ? input : {};
    var summary = context && context.summary ? context.summary : {};
    var detail = context && context.detail ? context.detail : {};
    var query = context && context.query ? context.query : {};
    var seasonsSource = toArray(raw.seasons);
    var normalizedSeasons = [];
    var i;

    if (!seasonsSource.length) seasonsSource = buildFallbackSeasons(raw, detail);
    for (i = 0; i < seasonsSource.length; i += 1) {
      var normalizedSeason = normalizeSeason(seasonsSource[i], i);
      if (normalizedSeason.episodes.length) normalizedSeasons.push(normalizedSeason);
    }
    if (!normalizedSeasons.length) normalizedSeasons = buildFallbackSeasons({}, detail);

    var defaultSeason = toNumber(raw.defaults && raw.defaults.seasonIndex, 0);
    var defaultEpisode = toNumber(raw.defaults && raw.defaults.episodeIndex, 0);
    var defaultStream = toNumber(raw.defaults && raw.defaults.streamIndex, 0);
    var querySeason = toNumber(query.season, NaN);
    var queryEpisode = toNumber(query.episode, NaN);
    if (isFinite(querySeason)) defaultSeason = querySeason;
    if (isFinite(queryEpisode)) defaultEpisode = queryEpisode;

    defaultSeason = Math.max(0, Math.min(defaultSeason, normalizedSeasons.length - 1));
    defaultEpisode = Math.max(0, Math.min(defaultEpisode, normalizedSeasons[defaultSeason].episodes.length - 1));

    return {
      content: {
        id: toText(raw.content && raw.content.id) || toText(summary.id),
        provider: toText(raw.content && raw.content.provider) || toText(summary.provider),
        title: toText(raw.content && raw.content.title) || toText(summary.title) || 'Untitled',
        poster: toText(raw.content && raw.content.poster) || toText(summary.poster),
        backdrop: toText(raw.content && raw.content.backdrop) || toText(summary.backdrop),
        infoUrl: toText(raw.content && raw.content.infoUrl) || toText(detail && detail.links && detail.links.page) || toText(summary.sourceLink)
      },
      seasons: normalizedSeasons,
      defaults: {
        seasonIndex: defaultSeason,
        episodeIndex: defaultEpisode,
        streamIndex: Math.max(0, defaultStream),
        autoplay: raw.defaults && raw.defaults.autoplay !== false
      }
    };
  }

  StreamBox.playerContract = {
    normalizePayload: normalizePayload,
    normalizeStream: normalizeStream,
    normalizeSubtitle: normalizeSubtitle
  };
})(window);
